import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus, LockStatus } from '../../entities/BatchLog';
import { Block } from '../../entities/Block';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { initializeDataSource } from './dataSource';
import { getConcurrencySettings, splitIntoChunks, processChunk } from './parallelManager';

const EXTRACT_INTERVAL_MS = process.env.EXTRACT_INTERVAL_MS ? Number(process.env.EXTRACT_INTERVAL_MS) : 3600000;
const LOCK_KEY = 'extract_data_lock';

async function checkAndAcquireLock(dataSource: DataSource, batchId: string): Promise<boolean> {
    const batchRepo = dataSource.getRepository(BatchLog);
    
    // First verify batch exists
    const batch = await batchRepo.findOne({ where: { batchId } });
    if (!batch) {
        throw new Error(`Batch with ID ${batchId} not found`);
    }

    // Check existing lock
    const existingLock = await batchRepo.findOne({
        where: { lockKey: LOCK_KEY }
    });

    if (existingLock) {
        const lockTime = existingLock.lockTime?.getTime() || 0;
        const currentTime = Date.now();
        if (currentTime - lockTime < EXTRACT_INTERVAL_MS) {
            console.log(`Extract data is locked until ${new Date(lockTime + EXTRACT_INTERVAL_MS)}`);
            return false;
        }
    }

    // Update the existing batch record with lock info
    await batchRepo.update(batch.id, {
        lockKey: LOCK_KEY,
        lockTime: new Date(),
        lockStatus: LockStatus.LOCKED
    });

    return true;
}

async function releaseLock(dataSource: DataSource, batchId: string, success: boolean = true) {
    const batchRepo = dataSource.getRepository(BatchLog);
    
    // Verify batch exists
    const batch = await batchRepo.findOne({ where: { batchId } });
    if (!batch) {
        throw new Error(`Batch with ID ${batchId} not found`);
    }

    await batchRepo.update(batch.id, {
        lockStatus: success ? LockStatus.UNLOCKED : LockStatus.FAILED,
        lockTime: new Date()
    });
}

export async function extractData(
    batchLog: {id: number, batchId: string}, 
    startBlock?: number, 
    endBlock?: number
): Promise<{
    processedCount: number;
    lastProcessedHeight: number | null;
}> {
    const batchId = batchLog.batchId;
    console.log(`Starting batch with ID: ${batchId}`);

    let processedCount = 0;
    const dataSource = await initializeDataSource();
    
    const hasLock = await checkAndAcquireLock(dataSource, batchId);
    if (!hasLock) {
        return {
            processedCount: 0,
            lastProcessedHeight: null
        };
    }
    
    let isHistorical = startBlock !== undefined && endBlock !== undefined;
    
    if (!isHistorical) {
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
    
    const endpoints = [
        'wss://acala-rpc.aca-api.network',
        'wss://karura-rpc.dwellir.com',
        'wss://karura.polkawallet.io'
    ];
    
    const provider = new WsProvider(endpoints, 2500);
    provider.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });
    provider.on('connected', () => {
        console.log('WebSocket connected to:', provider.endpoint);
    });
    provider.on('disconnected', () => {
        console.log('WebSocket disconnected from:', provider.endpoint);
    });
    
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
            await new Promise(resolve => setTimeout(resolve, 5000));
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
        const totalBlocks = endBlock! - startBlock! + 1;
        console.log(`Total blocks to process: ${totalBlocks}`);
        
        if (totalBlocks > 100) {
            const batchSize = 100;
            const totalBatches = Math.ceil(totalBlocks / batchSize);
            console.log(`Processing ${totalBlocks} blocks in ${totalBatches} batches`);
            
            for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
                const batchStart = startBlock! + (batchNum * batchSize);
                const batchEnd = Math.min(batchStart + batchSize - 1, endBlock!);
                console.log(`Processing batch ${batchNum + 1}/${totalBatches}: blocks ${batchStart} to ${batchEnd}`);
                
                let currentBatchStart = batchStart;
                while (currentBatchStart <= batchEnd) {
                    const currentBatchEnd = Math.min(currentBatchStart + batchSize - 1, batchEnd);
                    console.log(`Processing blocks ${currentBatchStart} to ${currentBatchEnd}`);
                    
                    blocksToProcess = [];
                    for (let blockNumber = currentBatchStart; blockNumber <= currentBatchEnd; blockNumber++) {
                        try {
                            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
                            const header = await api.rpc.chain.getHeader(blockHash);
                            
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
                    
                    // Process current batch immediately
                    if (blocksToProcess.length > 0) {
                        const { CONCURRENCY, CHUNK_SIZE } = getConcurrencySettings(blocksToProcess.length);
                        const chunks = splitIntoChunks(blocksToProcess, CHUNK_SIZE);
                        
                        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
                            const currentChunks = chunks.slice(i, i + CONCURRENCY);
                            const results = await Promise.all(
                                currentChunks.map(chunk => processChunk(chunk, api, batchId))
                            );
                            processedCount += results.reduce((sum, count) => sum + count, 0);
                        }
                    }
                    
                    currentBatchStart = currentBatchEnd + 1;
                    
                    if (batchLog) {
                        await dataSource.getRepository(BatchLog).update(batchLog.id, {
                            processed_block_count: processedCount,
                            last_processed_height: currentBatchEnd
                        });
                    }
                }
            }
        } else {
            let currentBatchStart = startBlock!;
            while (currentBatchStart <= endBlock!) {
                const currentBatchEnd = Math.min(currentBatchStart + 100 - 1, endBlock!);
                console.log(`Collecting blocks ${currentBatchStart} to ${currentBatchEnd}`);
                
                for (let blockNumber = currentBatchStart; blockNumber <= currentBatchEnd; blockNumber++) {
                    try {
                        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
                        const header = await api.rpc.chain.getHeader(blockHash);
                        
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
        }
    } else {
        const header = await api.rpc.chain.getHeader();
        console.log(`Connected to Acala network - Block Number: ${header.number}, Block Hash: ${header.hash}`);
        
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
            };
        }
    }

    try {
        // Final processing for any remaining blocks (non-historical case)
        if (blocksToProcess.length > 0) {
            const { CONCURRENCY, CHUNK_SIZE } = getConcurrencySettings(blocksToProcess.length);
            const chunks = splitIntoChunks(blocksToProcess, CHUNK_SIZE);
            
            for (let i = 0; i < chunks.length; i += CONCURRENCY) {
                const currentChunks = chunks.slice(i, i + CONCURRENCY);
                const results = await Promise.all(
                    currentChunks.map(chunk => processChunk(chunk, api, batchId))
                );
                processedCount += results.reduce((sum, count) => sum + count, 0);
            }
        }
    } catch (e) {
        console.error('Error processing blocks:', e);
        await releaseLock(dataSource, batchId, false);
        throw e;
    } finally {
        if (api) {
            await api.disconnect();
        }
    }
    
    if (batchLog) {
        await dataSource.getRepository(BatchLog).update(batchLog.id, {
            endTime: new Date(),
            status: BatchStatus.SUCCESS,
            processed_block_count: processedCount,
            last_processed_height: blocksToProcess.length > 0 ? 
                blocksToProcess[blocksToProcess.length - 1].number : null
        });
    }

    await releaseLock(dataSource, batchId);

    return {
        processedCount: processedCount,
        lastProcessedHeight: blocksToProcess.length > 0 ? 
            blocksToProcess[blocksToProcess.length - 1].number : null
    };
}
