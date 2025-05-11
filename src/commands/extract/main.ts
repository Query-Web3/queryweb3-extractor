import { processBlocks } from './processor';
import { determineBlockRange } from './blockRange';
import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';
import { initializeDataSource } from './dataSource';
import { Logger } from '../../utils/logger';

export async function extractData(
    batchLog?: BatchLog | null,
    startBlock?: number, 
    endBlock?: number,
    timeRange?: string
): Promise<{processedCount: number, lastProcessedHeight: number | null}> {
    const logger = Logger.getInstance();
    const startTime = Date.now();
    if (!batchLog) {
        const dataSource = await initializeDataSource();
        const batchLogRepo = dataSource.getRepository(BatchLog);
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
    
    // Calculate block range if timeRange is provided
    if (timeRange) {
        const range = await determineBlockRange(undefined, undefined, timeRange);
        startBlock = range.startBlock;
        endBlock = range.endBlock;
    }
    
    const result = await processBlocks(batchLog, startBlock, endBlock);
    const totalTime = Date.now() - startTime;
    logger.info(`Extract completed in ${(totalTime / 1000).toFixed(2)} seconds`);
    return result;
}

export const showLastExtractBatchLog = () => showLastBatchLog(BatchType.EXTRACT);
export const pauseExtractBatch = pauseBatch;
export const resumeExtractBatch = () => resumeBatch(BatchType.EXTRACT);
