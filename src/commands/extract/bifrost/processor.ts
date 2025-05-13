import { BatchLog } from '../../../entities/BatchLog';
import { BifrostProcessor } from './BifrostProcessor';

export interface BifrostProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processBifrostData(
    batchLog: BatchLog
): Promise<BifrostProcessResult> {
    const processor = new BifrostProcessor();
    return processor.process(batchLog);
}

export { processBifrostData as default };
