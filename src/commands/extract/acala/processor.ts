import { BatchLog } from '../../../entities/BatchLog';
import { AcalaProcessor } from './AcalaProcessor';

export interface ProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processBlocks(
    batchLog: BatchLog, 
    startBlock?: number, 
    endBlock?: number
): Promise<ProcessResult> {
    const processor = new AcalaProcessor();
    return processor.process(batchLog);
}

export { processBlocks as default };
