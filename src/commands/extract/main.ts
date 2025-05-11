import { processBlocks } from './processor';
import { determineBlockRange } from './blockRange';
import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';
import { initializeDataSource } from './dataSource';

/**
 * Extracts data from the blockchain within a specified block range or time range.
 * If no batch log is provided, it creates a new batch log entry in the database.
 * If a time range is provided, it calculates the corresponding block range.
 * 
 * @param batchLog - Optional batch log object. If not provided, a new one will be created.
 * @param startBlock - Optional starting block number for data extraction.
 * @param endBlock - Optional ending block number for data extraction.
 * @param timeRange - Optional time range string to calculate the block range.
 * @returns A promise that resolves to an object containing the number of processed blocks 
 *          and the height of the last processed block, or null if no blocks were processed.
 */
export async function extractData(
    batchLog?: BatchLog | null,
    startBlock?: number, 
    endBlock?: number,
    timeRange?: string
): Promise<{processedCount: number, lastProcessedHeight: number | null}> {
    // Check if a batch log is provided. If not, create a new one.
    if (!batchLog) {
        // Initialize the database connection
        const dataSource = await initializeDataSource();
        // Get the repository for the BatchLog entity
        const batchLogRepo = dataSource.getRepository(BatchLog);
        // Create a new batch log entry with initial values
        batchLog = await batchLogRepo.save(batchLogRepo.create({
            batchId: 'cli-' + Date.now(),
            startTime: new Date(),
            status: BatchStatus.RUNNING,
            type: BatchType.EXTRACT,
            retryCount: 0,
            processed_block_count: 0,
            last_processed_height: null
        }));
    }
    
    // Calculate the block range if a time range is provided
    if (timeRange) {
        // Determine the block range based on the provided time range
        const range = await determineBlockRange(undefined, undefined, timeRange);
        // Set the starting block number
        startBlock = range.startBlock;
        // Set the ending block number
        endBlock = range.endBlock;
    }
    
    // Process the blocks within the specified range and return the result
    return await processBlocks(batchLog, startBlock, endBlock);
}

export const showLastExtractBatchLog = () => showLastBatchLog(BatchType.EXTRACT);
export const pauseExtractBatch = pauseBatch;
export const resumeExtractBatch = () => resumeBatch(BatchType.EXTRACT);
