import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../entities/BatchLog';
import { Block } from '../../entities/Block';
import { ApiPromise } from '@polkadot/api';
import { initializeDataSource } from './dataSource';
import { getConcurrencySettings, splitIntoChunks, processChunk } from './parallelManager';
import { checkAndAcquireLock, releaseLock } from './lockManager';
import { determineBlockRange } from './blockRange';
import { createApiConnection } from './apiConnector';

export interface ProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processBlocks(
    batchLog: {id: number, batchId: string}, 
    startBlock?: number, 
    endBlock?: number
): Promise<ProcessResult> {
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

    const { startBlock: determinedStart, endBlock: determinedEnd, isHistorical } = 
        await determineBlockRange(startBlock, endBlock);

    const api = await createApiConnection();

    try {
        const blocksToProcess = await collectBlocksToProcess(
            api, 
            dataSource, 
            determinedStart, 
            determinedEnd, 
            isHistorical
        );

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

        await updateBatchLog(
            dataSource, 
            batchLog, 
            processedCount, 
            blocksToProcess
        );

        await releaseLock(dataSource, batchId);

        return {
            processedCount,
            lastProcessedHeight: blocksToProcess.length > 0 ? 
                blocksToProcess[blocksToProcess.length - 1].number : null
        };
    } catch (e) {
        console.error('Error processing blocks:', e);
        await releaseLock(dataSource, batchId, false);
        throw e;
    } finally {
        if (api) {
            await api.disconnect();
        }
    }
}

async function collectBlocksToProcess(
    api: ApiPromise,
    dataSource: DataSource,
    startBlock: number,
    endBlock: number,
    isHistorical: boolean
) {
    const blocksToProcess = [];
    
    if (isHistorical) {
        const totalBlocks = endBlock - startBlock + 1;
        console.log(`Total blocks to process: ${totalBlocks}`);
        
        if (totalBlocks > 100) {
            const batchSize = 100;
            const totalBatches = Math.ceil(totalBlocks / batchSize);
            console.log(`Processing ${totalBlocks} blocks in ${totalBatches} batches`);
            
            for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
                const batchStart = startBlock + (batchNum * batchSize);
                const batchEnd = Math.min(batchStart + batchSize - 1, endBlock);
                console.log(`Processing batch ${batchNum + 1}/${totalBatches}: blocks ${batchStart} to ${batchEnd}`);
                
                let currentBatchStart = batchStart;
                while (currentBatchStart <= batchEnd) {
                    const currentBatchEnd = Math.min(currentBatchStart + batchSize - 1, batchEnd);
                    console.log(`Processing blocks ${currentBatchStart} to ${currentBatchEnd}`);
                    const batchStartTime = Date.now();
                    console.log(`Batch ${batchNum + 1}/${totalBatches} started at: ${new Date(batchStartTime).toISOString()}`);
                    
                    for (let blockNumber = currentBatchStart; blockNumber <= currentBatchEnd; blockNumber++) {
                        try {
                            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
                            const header = await api.rpc.chain.getHeader(blockHash);
                            
                            const existingBlock = await dataSource.getRepository(Block).findOne({
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
            // ... (similar logic for small batches)
        }
    } else {
        // ... (real-time block processing logic)
    }

    return blocksToProcess;
}

async function updateBatchLog(
    dataSource: DataSource,
    batchLog: {id: number, batchId: string},
    processedCount: number,
    blocksToProcess: any[]
) {
    if (batchLog) {
        await dataSource.getRepository(BatchLog).update(batchLog.id, {
            endTime: new Date(),
            status: BatchStatus.SUCCESS,
            processed_block_count: processedCount,
            last_processed_height: blocksToProcess.length > 0 ? 
                blocksToProcess[blocksToProcess.length - 1].number : null
        });
    }
}
