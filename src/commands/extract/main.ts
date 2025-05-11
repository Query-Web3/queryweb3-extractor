import { processBlocks } from './processor';
import { determineBlockRange } from './blockRange';
import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';
import { initializeDataSource } from './dataSource';

export async function extractData(
    batchLog?: BatchLog | null,
    startBlock?: number, 
    endBlock?: number,
    timeRange?: string
): Promise<{processedCount: number, lastProcessedHeight: number | null}> {
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
    
    return processBlocks(batchLog, startBlock, endBlock);
}

export const showLastExtractBatchLog = () => showLastBatchLog(BatchType.EXTRACT);
export const pauseExtractBatch = pauseBatch;
export const resumeExtractBatch = () => resumeBatch(BatchType.EXTRACT);
