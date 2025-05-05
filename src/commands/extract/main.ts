import { processBlocks } from './processor';

export async function extractData(
    batchLog: {id: number, batchId: string}, 
    startBlock?: number, 
    endBlock?: number
) {
    return processBlocks(batchLog, startBlock, endBlock);
}
