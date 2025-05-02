import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../entities/BatchLog';
import { Block } from '../../entities/Block';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { v4 as uuidv4 } from 'uuid';
import { initializeDataSource } from './dataSource';
import { getConcurrencySettings, splitIntoChunks, processChunk } from './parallelManager';

const EXTRACT_INTERVAL_MS = process.env.EXTRACT_INTERVAL_MS ? Number(process.env.EXTRACT_INTERVAL_MS) : 3600000;

/**
 * Extracts data from the Acala network, including blocks, extrinsics, and events,
 * and stores them in the database. Updates the batch log status upon completion.
 * 
 * @param batchLog - Optional object containing the batch log ID. Used to update the batch status.
 * @param startBlock - Optional starting block number
 * @param endBlock - Optional ending block number
 */
export async function extractData(
    batchLog?: {id: number}, 
    startBlock?: number, 
    endBlock?: number
): Promise<{
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

    // Get concurrency settings based on total blocks to process
    const { CONCURRENCY, CHUNK_SIZE } = getConcurrencySettings(blocksToProcess.length);

    let processedCount = 0;
    try {
        // Split blocks using calculated CHUNK_SIZE
        const chunks = splitIntoChunks(blocksToProcess, CHUNK_SIZE);

        // Process chunks in parallel with CONCURRENCY limit
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
            const currentChunks = chunks.slice(i, i + CONCURRENCY);
            const results = await Promise.all(
                currentChunks.map(chunk => processChunk(chunk, api, batchId))
            );
            processedCount += results.reduce((sum, count) => sum + count, 0);
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
