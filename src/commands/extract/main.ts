import { processBlocks } from './processor';
import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';
import { initializeDataSource } from './dataSource';

export async function extractData(
    batchLog?: {id: number, batchId: string} | null, 
    startBlock?: number, 
    endBlock?: number
): Promise<{processedCount: number, lastProcessedHeight: number | null}> {
    if (!batchLog) {
        const dataSource = await initializeDataSource();
        const batchLogRepo = dataSource.getRepository(BatchLog);
        batchLog = await batchLogRepo.save(batchLogRepo.create({
            batchId: 'cli-' + Date.now(),
            status: BatchStatus.RUNNING,
            type: BatchType.EXTRACT
        }));
    }
    return processBlocks(batchLog, startBlock, endBlock);
}

export const showLastExtractBatchLog = () => showLastBatchLog(BatchType.EXTRACT);
export const pauseExtractBatch = pauseBatch;
export const resumeExtractBatch = () => resumeBatch(BatchType.EXTRACT);
