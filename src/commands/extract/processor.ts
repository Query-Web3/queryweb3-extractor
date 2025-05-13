import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../entities/BatchLog';
import { AcalaBlock } from '../../entities/acala/AcalaBlock';
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
        processedCount = await collectBlocksToProcess(
            api, 
            dataSource, 
            determinedStart, 
            determinedEnd, 
            isHistorical,
            batchId
        );

        await updateBatchLog(
            dataSource, 
            batchLog, 
            processedCount, 
            determinedEnd
        );

        await releaseLock(dataSource, batchId);

        return {
            processedCount,
            lastProcessedHeight: processedCount > 0 ? determinedEnd : null
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
    isHistorical: boolean,
    batchId: string
) {
    const logger = Logger.getInstance();
    let processedCount = 0;
    
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
                    logger.info(`Fetching blocks' data from ${currentBatchStart} to ${currentBatchEnd}`);
                    const batchTimer = logger.time(`Batch ${batchNum + 1}/${totalBatches}`);
                    
                    const batchBlocks = [];
                    for (let blockNumber = currentBatchStart; blockNumber <= currentBatchEnd; blockNumber++) {
                        try {
                            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
                            const header = await api.rpc.chain.getHeader(blockHash);
                            
                            const apiAt = await api.at(blockHash);
                            let dexPools: [any, any][] = [];
                            let stableCoinBalances: [any, any][] = [];
                            
                            try {
                                if (apiAt.query.dex?.liquidityPool) {
                                    dexPools = await apiAt.query.dex.liquidityPool.entries();
                                }
                            } catch (e) {
                                console.warn(`Failed to get DEX pools for block ${blockNumber}:`, e);
                            }
                            
                            try {
                                if (apiAt.query.honzon?.totalPositions) {
                                    stableCoinBalances = await apiAt.query.honzon.totalPositions.entries();
                                }
                            } catch (e) {
                                console.warn(`Failed to get stable coin balances for block ${blockNumber}:`, e);
                            }
                            
                            const existingBlock = await dataSource.getRepository(AcalaBlock).findOne({
                                where: { number: blockNumber }
                            });
                            
                            if (!existingBlock) {
                                batchBlocks.push({
                                    number: blockNumber,
                                    hash: blockHash.toString(),
                                    header,
                                    hashObj: blockHash,
                                    acalaData: {
                                        dexPools: dexPools.map(([key, value]) => ({
                                            poolId: key.args[0].toString(),
                                            liquidity: value.toString()
                                        })),
                                        stableCoinBalances: stableCoinBalances.map(([key, value]) => ({
                                            accountId: key.args[0].toString(),
                                            position: value.toString()
                                        }))
                                    }
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
                    
                    if (batchBlocks.length > 0) {
                        const processed = await processChunk(batchBlocks, api, batchId);
                        processedCount += processed;
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

    return processedCount;
}

async function updateBatchLog(
    dataSource: DataSource,
    batchLog: {id: number, batchId: string},
    processedCount: number,
    lastProcessedHeight: number | null
) {
    if (batchLog) {
        await dataSource.getRepository(BatchLog).update(batchLog.id, {
            endTime: new Date(),
            status: BatchStatus.SUCCESS,
            processed_block_count: processedCount,
            last_processed_height: lastProcessedHeight
        });
    }
}
