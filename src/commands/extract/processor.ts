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

/**
 * Processes a range of blocks, collecting and processing them in batches.
 * Updates the batch log upon completion and handles locking to prevent concurrent processing.
 * 
 * @param batchLog - The batch log entity containing information about the current batch.
 * @param startBlock - Optional starting block number. If not provided, it will be determined automatically.
 * @param endBlock - Optional ending block number. If not provided, it will be determined automatically.
 * @returns A promise that resolves to an object containing the number of processed blocks and the last processed block height.
 */
export async function processBlocks(
    batchLog: BatchLog, 
    startBlock?: number, 
    endBlock?: number
): Promise<ProcessResult> {
    // Get an instance of the logger
    const logger = Logger.getInstance();
    // Set the log level based on the environment variable or default to INFO
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    // Associate the logger with the current batch log
    logger.setBatchLog(batchLog);
    
    // Extract the batch ID from the batch log
    const batchId = batchLog.batchId;
    // Log the start of the batch processing
    logger.info(`Starting batch with ID: ${batchId}`);

    // Initialize the count of processed blocks
    let processedCount = 0;
    // Initialize the database connection
    const dataSource = await initializeDataSource();
    
    // Check and acquire a lock to prevent concurrent processing of the same batch
    const hasLock = await checkAndAcquireLock(dataSource, batchId);
    if (!hasLock) {
        // If the lock cannot be acquired, return 0 processed blocks
        return {
            processedCount: 0,
            lastProcessedHeight: null
        };
    }

    // Determine the block range to process
    const { startBlock: determinedStart, endBlock: determinedEnd, isHistorical } = 
        await determineBlockRange(startBlock, endBlock);

    // Create a connection to the blockchain API
    const api = await createApiConnection();

    try {
        // Collect and process the blocks within the determined range
        processedCount = await collectBlocksToProcess(
            api, 
            dataSource, 
            determinedStart, 
            determinedEnd, 
            isHistorical,
            batchId
        );

        // Update the batch log with the processing results
        await updateBatchLog(
            dataSource, 
            batchLog, 
            processedCount, 
            determinedEnd
        );

        // Release the lock after successful processing
        await releaseLock(dataSource, batchId);

        // Return the processing results
        return {
            processedCount,
            lastProcessedHeight: processedCount > 0 ? determinedEnd : null
        };
    } catch (e) {
        // Log any errors that occur during processing
        if (e instanceof Error) {
            logger.error('Error processing blocks', e);
        } else {
            logger.error('Error processing blocks', new Error(String(e)));
        }
        // Release the lock in case of an error
        await releaseLock(dataSource, batchId, false);
        // Rethrow the error to be handled by the caller
        throw e;
    } finally {
        // Disconnect from the blockchain API if the connection exists
        if (api) {
            await api.disconnect();
        }
    }
}

/**
 * Collects and processes blocks within a specified range. If the operation is historical and the number of blocks
 * exceeds 100, it processes them in batches. Otherwise, it uses a different approach (not fully implemented here).
 * 
 * @param api - The Polkadot API promise instance for interacting with the blockchain.
 * @param dataSource - The TypeORM data source for database operations.
 * @param startBlock - The starting block number of the range to process.
 * @param endBlock - The ending block number of the range to process.
 * @param isHistorical - A flag indicating whether the block processing is historical or real-time.
 * @param batchId - The unique identifier for the current batch.
 * @returns A promise that resolves to the total number of processed blocks.
 */
async function collectBlocksToProcess(
    api: ApiPromise,
    dataSource: DataSource,
    startBlock: number,
    endBlock: number,
    isHistorical: boolean,
    batchId: string
) {
    // Get an instance of the logger
    const logger = Logger.getInstance();
    // Initialize the count of processed blocks
    let processedCount = 0;
    
    // Check if the block processing is historical
    if (isHistorical) {
        // Calculate the total number of blocks to process
        const totalBlocks = endBlock - startBlock + 1;
        // Log the total number of blocks to process
        logger.info(`Total blocks to process: ${totalBlocks}`);
        
        // Check if the total number of blocks exceeds 100
        if (totalBlocks > 100) {
            // Set the batch size to 100 blocks
            const batchSize = 100;
            // Calculate the total number of batches
            const totalBatches = Math.ceil(totalBlocks / batchSize);
            // Log the number of blocks and batches to process
            logger.info(`Processing ${totalBlocks} blocks in ${totalBatches} batches`);
            
            // Iterate through each batch
            for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
                // Calculate the starting block number of the current batch
                const batchStart = startBlock + (batchNum * batchSize);
                // Calculate the ending block number of the current batch
                const batchEnd = Math.min(batchStart + batchSize - 1, endBlock);
                // Log the current batch being processed
                logger.info(`Processing batch ${batchNum + 1}/${totalBatches}: blocks ${batchStart} to ${batchEnd}`);
                
                // Initialize the starting block number for the current sub-batch
                let currentBatchStart = batchStart;
                // Process the current batch in sub-batches
                while (currentBatchStart <= batchEnd) {
                    // Calculate the ending block number for the current sub-batch
                    const currentBatchEnd = Math.min(currentBatchStart + batchSize - 1, batchEnd);
                    // Log the range of blocks being fetched
                    logger.info(`Fetching blocks' data from ${currentBatchStart} to ${currentBatchEnd}`);
                    // Start a timer to measure the processing time of the current batch
                    const batchTimer = logger.time(`Batch ${batchNum + 1}/${totalBatches}`);
                    
                    // Initialize an array to store the blocks to be processed in the current batch
                    const batchBlocks = [];
                    // Iterate through each block in the current sub-batch
                    for (let blockNumber = currentBatchStart; blockNumber <= currentBatchEnd; blockNumber++) {
                        try {
                            // Get the block hash for the current block number
                            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
                            // Get the block header for the current block hash
                            const header = await api.rpc.chain.getHeader(blockHash);
                            
                            // Additional Acala-specific data extraction
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
                            
                            // Check if the block already exists in the database
                            const existingBlock = await dataSource.getRepository(Block).findOne({
                                where: { number: blockNumber }
                            });
                            
                            // If the block does not exist, add it to the batch
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
                                // Log that the block is being skipped because it already exists
                                logger.debug(`Skipping existing block ${blockNumber}`);
                            }
                        } catch (e) {
                            // Log any errors that occur during block processing
                            if (e instanceof Error) {
                                logger.error(`Error processing block ${blockNumber}`, e);
                            } else {
                                logger.error(`Error processing block ${blockNumber}`, new Error(String(e)));
                            }
                            // Continue to the next block if an error occurs
                            continue;
                        }
                    }
                    
                    // If there are blocks in the batch, process them
                    if (batchBlocks.length > 0) {
                        const processed = await processChunk(batchBlocks, api, batchId);
                        processedCount += processed;
                    }
                    
                    // Move to the next sub-batch
                    currentBatchStart = currentBatchEnd + 1;
                }
            }
        } else {
            // ... (similar logic for small batches)
        }
    } else {
        // ... (real-time block processing logic)
    }

    // Return the total number of processed blocks
    return processedCount;
}

/**
 * Updates the batch log in the database with the processing results.
 * 
 * @param dataSource - The TypeORM data source used to interact with the database.
 * @param batchLog - An object containing the ID and batch ID of the batch log to be updated.
 * @param processedCount - The number of blocks processed in the batch.
 * @param lastProcessedHeight - The height of the last processed block, or null if no blocks were processed.
 */
async function updateBatchLog(
    dataSource: DataSource,
    batchLog: {id: number, batchId: string},
    processedCount: number,
    lastProcessedHeight: number | null
) {
    // Check if the batch log object is provided
    if (batchLog) {
        // Update the batch log record in the database with the processing results
        await dataSource.getRepository(BatchLog).update(batchLog.id, {
            // Set the end time of the batch processing to the current time
            endTime: new Date(),
            // Set the status of the batch processing to success
            status: BatchStatus.SUCCESS,
            // Set the number of processed blocks
            processed_block_count: processedCount,
            // Set the height of the last processed block
            last_processed_height: lastProcessedHeight
        });
    }
}
