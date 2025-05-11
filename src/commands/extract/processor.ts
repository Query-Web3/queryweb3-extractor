import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../entities/BatchLog';
import { Block } from '../../entities/Block';
import { ApiPromise } from '@polkadot/api';
import { initializeDataSource } from './dataSource';
import { getConcurrencySettings, splitIntoChunks, processChunk } from './parallelManager';
import { checkAndAcquireLock, releaseLock } from './lockManager';
import { determineBlockRange } from './blockRange';
import { createApiConnection } from '../common/apiConnector';
import { Logger, LogLevel } from '../../utils/logger';

export interface ProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processBlocks(
    batchLog: BatchLog, 
    startBlock?: number, 
    endBlock?: number
): Promise<ProcessResult> {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    logger.setBatchLog(batchLog);
    
    const batchId = batchLog.batchId;
    logger.info(`Starting batch with ID: ${batchId}`);

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
        if (e instanceof Error) {
            logger.error('Error processing blocks', e);
        } else {
            logger.error('Error processing blocks', new Error(String(e)));
        }
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
    const logger = Logger.getInstance();
    const blocksToProcess = [];
    
    if (isHistorical) {
        const totalBlocks = endBlock - startBlock + 1;
        logger.info(`Total blocks to process: ${totalBlocks}`);
        
        if (totalBlocks > 100) {
            const batchSize = 100;
            const totalBatches = Math.ceil(totalBlocks / batchSize);
            logger.info(`Processing ${totalBlocks} blocks in ${totalBatches} batches`);
            
            for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
                const batchStart = startBlock + (batchNum * batchSize);
                const batchEnd = Math.min(batchStart + batchSize - 1, endBlock);
                logger.info(`Processing batch ${batchNum + 1}/${totalBatches}: blocks ${batchStart} to ${batchEnd}`);
                
                let currentBatchStart = batchStart;
                while (currentBatchStart <= batchEnd) {
                    const currentBatchEnd = Math.min(currentBatchStart + batchSize - 1, batchEnd);
                    logger.info(`Processing blocks ${currentBatchStart} to ${currentBatchEnd}`);
                    const batchTimer = logger.time(`Batch ${batchNum + 1}/${totalBatches}`);
                    
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
                                logger.debug(`Skipping existing block ${blockNumber}`);
                            }
                        } catch (e) {
                            if (e instanceof Error) {
                                logger.error(`Error processing block ${blockNumber}`, e);
                            } else {
                                logger.error(`Error processing block ${blockNumber}`, new Error(String(e)));
                            }
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
