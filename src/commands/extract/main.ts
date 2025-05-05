import { processBlocks } from './processor';
import { BatchLog } from '../../entities/BatchLog';
import { BatchType } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';

export async function extractData(
    batchLog: {id: number, batchId: string}, 
    startBlock?: number, 
    endBlock?: number
) {
    return processBlocks(batchLog, startBlock, endBlock);
}

export const showLastExtractBatchLog = () => showLastBatchLog(BatchType.EXTRACT);
export const pauseExtractBatch = pauseBatch;
export const resumeExtractBatch = () => resumeBatch(BatchType.EXTRACT);
