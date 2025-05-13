import { BatchLog } from '../../../entities/BatchLog';
import { HydrationProcessor } from './HydrationProcessor';

export interface HydrationProcessResult {
    processedCount: number;
    lastProcessedHeight: number | null;
}

export async function processHydrationData(
    batchLog: BatchLog
): Promise<HydrationProcessResult> {
    const processor = new HydrationProcessor();
    return processor.process(batchLog);
}

export { processHydrationData as default };
