import { DataSource } from 'typeorm';
import { BatchStatus, BatchType } from '../entities/BatchLog';
import { extractDataSource } from '../datasources/extractDataSource';
import { Block } from '../entities/Block';
import { Extrinsic } from '../entities/Extrinsic';
import { Event } from '../entities/Event';
import { BatchLog } from '../entities/BatchLog';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { v4 as uuidv4 } from 'uuid';

// Initialize data source
let dataSource: DataSource;

async function initializeDataSource() {
  if (!dataSource?.isInitialized) {
    dataSource = extractDataSource;
    await dataSource.initialize();
  }
  return dataSource;
}
const EXTRACT_INTERVAL_MS = process.env.EXTRACT_INTERVAL_MS ? Number(process.env.EXTRACT_INTERVAL_MS) : 3600000;

/**
 * Extracts data from the Acala network, including blocks, extrinsics, and events,
 * and stores them in the database. Updates the batch log status upon completion.
 * 
 * @param batchLog - Optional object containing the batch log ID. Used to update the batch status.
 */
export async function extractData(batchLog?: {id: number}, startBlock?: number, endBlock?: number): Promise<{
    processedCount: number;
    lastProcessedHeight: number | null;
}> {
    // Generate a unique ID for the current data extraction batch
    const batchId = uuidv4();
    console.log(`Starting batch with ID: ${batchId}`);

    // Initialize data source
    const dataSource = await initializeDataSource();
    
    // If no block range specified, get latest block from chain and highest from DB
    let isHistorical = startBlock !== undefined && endBlock !== undefined;
    
    if (!isHistorical) {
        // Get highest block from database with proper error handling
        let dbHighest = 0;
        try {
            const highestBlock = await dataSource.getRepository(Block)
                .createQueryBuilder('block')
                .select('MAX(block.number)', 'maxNumber')
                .getRawOne();
            dbHighest = highestBlock?.maxNumber || 0;
            console.log(`Highest block in DB: ${dbHighest}`);
        } catch (e) {
            console.error('Error getting highest block from DB:', e);
            dbHighest = 0;
        }

        // Get latest block from chain
        const provider = new WsProvider('wss://acala-rpc.aca-api.network');
        const api = await ApiPromise.create(options({ provider }));
        const header = await api.rpc.chain.getHeader();
        const chainLatest = header.number.toNumber();
        await api.disconnect();
        
        startBlock = dbHighest > 0 ? dbHighest + 1 : 0;
        endBlock = chainLatest;
        isHistorical = true;
        
        console.log(`Auto-determined block range: ${startBlock} to ${endBlock}`);
    }
    
    // Create a WebSocket provider with multiple endpoints and better error handling
    const endpoints = [
        'wss://acala-rpc.aca-api.network', // Fallback endpoint
        'wss://karura-rpc.dwellir.com',
        'wss://karura.polkawallet.io'
    ];
    
    const provider = new WsProvider(endpoints, 2500); // 2.5s timeout
    provider.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });
    provider.on('connected', () => {
        console.log('WebSocket connected to:', provider.endpoint);
    });
    provider.on('disconnected', () => {
        console.log('WebSocket disconnected from:', provider.endpoint);
    });
    
    // Initialize API with better error handling and reconnection
    let api: ApiPromise | null = null;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
        try {
            api = await ApiPromise.create(options({ provider }));
            await api.isReady;
            console.log('API connection established successfully to:', provider.endpoint);
            break;
        } catch (e) {
            console.error(`Error connecting to API (attempt ${retries + 1}/${maxRetries}):`, e);
            retries++;
            if (retries >= maxRetries) {
                throw new Error(`Failed to connect to API after ${maxRetries} attempts`);
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
        }
    }

    if (!api) {
        throw new Error('API connection could not be established');
    }
    
    let blocksToProcess: Array<{
        number: number;
        hash: string;
        header: any;
        hashObj: any;
    }> = [];
    
    if (isHistorical) {
        // Process historical blocks in range with batch processing
        const BATCH_SIZE = 100; // Process 100 blocks at a time
        let currentBatchStart = startBlock!;
        
        // First collect all blocks to process
        while (currentBatchStart <= endBlock!) {
            const currentBatchEnd = Math.min(currentBatchStart + BATCH_SIZE - 1, endBlock!);
            console.log(`Collecting blocks ${currentBatchStart} to ${currentBatchEnd}`);
            
            for (let blockNumber = currentBatchStart; blockNumber <= currentBatchEnd; blockNumber++) {
                try {
                    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
                    const header = await api.rpc.chain.getHeader(blockHash);
                    
                    // Check if block already exists in database
                    const existingBlock = await (await initializeDataSource()).getRepository(Block).findOne({
                        where: { number: blockNumber }
                    });
                    
                    if (!existingBlock) {
                        blocksToProcess.push({
                            number: blockNumber,
                            hash: blockHash.toString(),
                            header,
                            hashObj: blockHash
                        });
                    } else {
                        console.log(`Skipping existing block ${blockNumber}`);
                    }
                } catch (e) {
                    console.error(`Error processing block ${blockNumber}:`, e);
                    continue;
                }
            }
            currentBatchStart = currentBatchEnd + 1;
        }
    } else {
        // Process latest block only (original behavior)
        const header = await api.rpc.chain.getHeader();
        console.log(`Connected to Acala network - Block Number: ${header.number}, Block Hash: ${header.hash}`);
        
        // Check if block already exists
        const existingBlock = await (await initializeDataSource()).getRepository(Block).findOne({
            where: { number: header.number.toNumber() }
        });
        
        if (!existingBlock) {
            blocksToProcess.push({
                number: header.number.toNumber(),
                hash: header.hash.toString(),
                header,
                hashObj: header.hash
            });
        } else {
            console.log(`Skipping existing block ${header.number}`);
            return {
                processedCount: 0,
                lastProcessedHeight: null
            }; // No new blocks to process
        }
    }

    // Get CPU core count for parallel processing
    const os = require('os');
    const cpuCount = os.cpus().length;
    const CONCURRENCY = Math.max(1, Math.floor(cpuCount / 2)); // Use at most half of CPU cores
    console.log(`Using ${CONCURRENCY} parallel workers (${cpuCount} cores available)`);

    // Ensure each parallel group doesn't exceed CPU core limits
    const CHUNK_SIZE = Math.min(100, CONCURRENCY * 20); // Max 100 blocks per group or 20x CPU capacity

    let processedCount = 0;
    try {
        // Progress manager
        const progressMap = new Map<number, {current: number, total: number}>();
        let lastProgressUpdate = 0;
        
        // Update progress display
        const updateProgress = () => {
            const now = Date.now();
            if (now - lastProgressUpdate < 1000) return; // Update once per second
            lastProgressUpdate = now;
            
            console.log('\nCurrent parallel processing progress:');
            progressMap.forEach((progress, workerId) => {
                const percent = Math.round((progress.current / progress.total) * 100);
                console.log(`Worker ${workerId}: ${progress.current}/${progress.total} (${percent}%)`);
            });
            console.log('');
        };

        // Split blocks into parallel processing groups
        const processBlock = async (block: any, workerId: number) => {
            try {
                if (!api) throw new Error('API not initialized');
                
                // Get the full block data
                const signedBlock = await api.rpc.chain.getBlock(block.hashObj);
                // Get the system events for the current block
                const events = await api.query.system.events.at(block.hashObj);

                // Process each extrinsic in the block to extract relevant information
                const extrinsics = await Promise.all(signedBlock.block.extrinsics.map(async (ext: any, index: number) => {
                    let fee = '0';
                    try {
                        // Get the payment information for the extrinsic to calculate the fee
                        if (ext && ext.isSigned && ext.signer && ext.method && api && api.isConnected) {
                            console.log(`Getting payment info for extrinsic ${index} with signer ${ext.signer.toString()}`);
                            try {
                                // Validate extrinsic method exists
                                if (!api.tx[ext.method.section]?.[ext.method.method]) {
                                    console.warn(`Extrinsic method ${ext.method.section}.${ext.method.method} not found in API`);
                                    fee = '0';
                                } else {
                                    const tx = api.tx(ext.method);
                                    if (!tx || !tx.isSigned) {
                                        throw new Error('Invalid or unsigned transaction');
                                    }
                                    // Add timeout for payment info call
                                    const paymentInfo = await Promise.race<{
                                        partialFee: { toString: () => string };
                                        toHuman: () => Record<string, any>;
                                    }>([
                                        tx.paymentInfo(ext.signer),
                                        new Promise((_, reject) =>
                                            setTimeout(() => reject(new Error('Payment info timeout')), 5000)
                                        )
                                    ]);
                                    if (!paymentInfo || !paymentInfo.partialFee) {
                                        throw new Error('Invalid payment info response');
                                    }
                                    fee = paymentInfo.partialFee.toString();
                                    console.log(`Payment info for extrinsic ${index}: ${JSON.stringify(paymentInfo.toHuman())}`);
                                }
                            } catch (e) {
                                console.error(`Failed to get payment info for extrinsic ${index}:`, e);
                                fee = '0';
                            }
                        } else {
                            if (!ext.signer) {
                                console.log(`Skipping payment info for unsigned extrinsic ${index}`);
                            } else if (!api || !api.isConnected) {
                                console.error('API connection not available for payment info');
                            }
                            fee = '0';
                        }
                    } catch (e) {
                        console.error(`Failed to get payment info for extrinsic ${index}:`, e);
                        fee = '0';
                    }
                    
                    return {
                        index: index,
                        method: ext.method.toString(),
                        signer: ext.signer ? ext.signer.toString() : null,
                        fee,
                        status: 'pending',
                        params: ext.method.toHuman()
                    };
                }));

                // Use transaction to save block data
                const dataSource = await initializeDataSource();
                const queryRunner = dataSource.createQueryRunner();
                await queryRunner.connect();
                await queryRunner.startTransaction();
                
                try {
                    // Create a block record in the database
                    const blockRecord = await queryRunner.manager.getRepository(Block).save({
                        number: block.number,
                        hash: block.hash,
                        batchId
                    });
                    
                    if (extrinsics.length > 0) {
                        // Create records for each extrinsic in the database
                        const createdExtrinsics = await Promise.all(extrinsics.map(async ext => {
                            // Check if extrinsic already exists
                            const existingExtrinsic = await queryRunner.manager.getRepository(Extrinsic).findOne({
                                where: {
                                    blockId: blockRecord.id,
                                    index: ext.index
                                }
                            });
                            
                            if (!existingExtrinsic) {
                                return await queryRunner.manager.getRepository(Extrinsic).save({
                                    blockId: blockRecord.id,
                                    index: ext.index,
                                    method: ext.method,
                                    signer: ext.signer,
                                    fee: ext.fee,
                                    status: ext.status,
                                    params: ext.params,
                                    batchId
                                });
                            }
                            return existingExtrinsic;
                        }).filter(Boolean));
                        
                        // Create records for each event in the database
                        await Promise.all((events as any).map(async (record: any, index: number) => {
                            const { event, phase } = record;
                            // Determine the associated extrinsic ID based on the event phase
                            const extrinsicId = phase.isApplyExtrinsic
                                ? createdExtrinsics[phase.asApplyExtrinsic.toNumber()]?.id
                                : null;
                                
                            // Check if event already exists
                            const existingEvent = await queryRunner.manager.getRepository(Event).findOne({
                                where: {
                                    block: { id: blockRecord.id },
                                    index: index
                                }
                            });
                        
                            if (!existingEvent) {
                                return await queryRunner.manager.getRepository(Event).save({
                                    block: { id: blockRecord.id },
                                    extrinsic: extrinsicId ? { id: extrinsicId } : undefined,
                                    index,
                                    section: event.section,
                                    method: event.method,
                                    data: event.data.toHuman(),
                                    batchId
                                });
                            }
                            return null;
                        }));
                    }
                    
                    // Commit transaction
                    await queryRunner.commitTransaction();
                    return { success: true, blockNumber: block.number };
                } catch (e) {
                    // Rollback transaction
                    await queryRunner.rollbackTransaction();
                    console.error(`Error processing block ${block.number}:`, e);
                    return { success: false, blockNumber: block.number, error: e };
                } finally {
                    // Release queryRunner
                    await queryRunner.release();
                }
            } catch (e) {
                console.error(`Error processing block ${block.number}:`, e);
                return { success: false, blockNumber: block.number, error: e };
            }
        };

        // Split blocks using calculated CHUNK_SIZE
        const totalBlocks = blocksToProcess.length;
        const chunks = [];
        
        for (let i = 0; i < totalBlocks; i += CHUNK_SIZE) {
            chunks.push(blocksToProcess.slice(i, i + CHUNK_SIZE));
        }

        // Process each block group in parallel
        for (const chunk of chunks) {
            console.log(`Processing chunk of ${chunk.length} blocks (${chunk[0].number} to ${chunk[chunk.length-1].number})`);
            
            // Assign unique ID to each worker
            let workerId = 0;
            
            // Process all blocks in current group in parallel
            const results = await Promise.all(chunk.map(block => {
                const currentWorkerId = workerId++;
                progressMap.set(currentWorkerId, {
                    current: 0,
                    total: chunk.length
                });
                
                // Update progress display
                updateProgress();
                
                return processBlock(block, currentWorkerId)
                    .then(result => {
                        // Update progress when completed
                        const progress = progressMap.get(currentWorkerId);
                        if (progress) {
                            progress.current++;
                            updateProgress();
                        }
                        return result;
                    });
            }));

            // Count successful results
            const successCount = results.filter((r: any) => r.success).length;
            processedCount += successCount;
            console.log(`Processed ${successCount}/${chunk.length} blocks in current chunk`);
        }
    } catch (e) {
        console.error('Error processing blocks:', e);
    } finally {
        // Disconnect from the network API
        if (api) {
            await api.disconnect();
        }
    }
    
    if (batchLog) {
        // Update the batch log with processed block count and last height
        await (await initializeDataSource()).getRepository(BatchLog).update(batchLog.id, {
            endTime: new Date(),
            status: BatchStatus.SUCCESS,
            processed_block_count: processedCount,
            last_processed_height: blocksToProcess.length > 0 ? 
                blocksToProcess[blocksToProcess.length - 1].number : null
        });
    }

    return {
        processedCount: processedCount,
        lastProcessedHeight: blocksToProcess.length > 0 ? 
            blocksToProcess[blocksToProcess.length - 1].number : null
    };
}

/**
 * Continuously runs the data extraction process at specified intervals.
 * Creates a new batch log for each extraction attempt, updates its status upon success or failure,
 * and retries the extraction if it fails.
 */
export async function runExtract(options?: {startBlock?: number, endBlock?: number}) {
    // Infinite loop to ensure the extraction process runs continuously
    while (true) {
        const {startBlock, endBlock} = options || {};
        // Variable to hold the batch log record created for each extraction attempt
        let batchLog;
        try {
            // Create a new batch log record in the database with a unique batch ID and set its status to RUNNING
            batchLog = await (await initializeDataSource()).getRepository(BatchLog).save({
                batchId: uuidv4(),
                status: BatchStatus.RUNNING,
                type: BatchType.EXTRACT
            });
            
            // Call the extractData function with the created batch log to start the data extraction process
            const result = await extractData(batchLog, startBlock, endBlock);
            
            // Update processed block count and last height after successful extraction
            await (await initializeDataSource()).getRepository(BatchLog).update(batchLog.id, {
                processed_block_count: result.processedCount,
                last_processed_height: result.lastProcessedHeight
            });
            
            // If processing historical blocks, exit after one run
            if (startBlock !== undefined && endBlock !== undefined) {
                break;
            }
        } catch (e) {
            // Log any errors that occur during the extraction process
            console.error(e);
            
            // Check if a batch log was successfully created before attempting to update it
            if (batchLog) {
                // Update the batch log status to FAILED, set the end time, and increment the retry count
                await (await initializeDataSource()).getRepository(BatchLog).update(batchLog.id, {
                    endTime: new Date(),
                    status: BatchStatus.FAILED,
                    retryCount: batchLog.retryCount + 1
                });
            }
        }
        // Log the time to wait before starting the next extraction batch
        console.log(`Wait for ${EXTRACT_INTERVAL_MS / 3600000} hours to run next batch...`);
        // Pause the execution for the specified interval before starting the next extraction batch
        await new Promise(resolve => setTimeout(resolve, EXTRACT_INTERVAL_MS));
    }
}
