import { processBlocks } from './processor';
import { extractDataSource } from '../../datasources/extractDataSource';
import { BatchLog, BatchType, BatchStatus } from '../../entities/BatchLog';
import { getRepository } from 'typeorm';

export async function extractData(
    batchLog: {id: number, batchId: string}, 
    startBlock?: number, 
    endBlock?: number
) {
    return processBlocks(batchLog, startBlock, endBlock);
}

export async function showLastBatchLog() {
    if (!extractDataSource.isInitialized) {
        await extractDataSource.initialize();
    }
    const batchLogRepo = extractDataSource.getRepository(BatchLog);
    const lastLog = await batchLogRepo.findOne({
        where: { type: BatchType.EXTRACT },
        order: { startTime: 'DESC' }
    });

    if (lastLog) {
        console.log('Last Extract BatchLog Record:');
        console.log(`ID: ${lastLog.id}`);
        console.log(`Batch ID: ${lastLog.batchId}`);
        console.log(`Start Time: ${lastLog.startTime}`);
        console.log(`End Time: ${lastLog.endTime || 'N/A'}`);
        console.log(`Status: ${BatchStatus[lastLog.status]}`);
        console.log(`Type: ${BatchType[lastLog.type]}`);
        console.log(`Processed Blocks: ${lastLog.processed_block_count}`);
        console.log(`Last Processed Height: ${lastLog.last_processed_height || 'N/A'}`);
    } else {
        console.log('No extract batchlog records found');
    }
}

export async function pauseBatch(batchlogId: number) {
    if (!extractDataSource.isInitialized) {
        await extractDataSource.initialize();
    }
    const batchLogRepo = extractDataSource.getRepository(BatchLog);
    const batchLog = await batchLogRepo.findOne({
        where: { 
            id: batchlogId,
            status: BatchStatus.RUNNING
        }
    });

    if (!batchLog) {
        throw new Error(`No running batch found with ID ${batchlogId}`);
    }

    await batchLogRepo.update(batchLog.id, {
        status: BatchStatus.PAUSED,
        endTime: new Date()
    });
    return batchLog;
}

export async function resumeBatch() {
    if (!extractDataSource.isInitialized) {
        await extractDataSource.initialize();
    }
    const batchLogRepo = extractDataSource.getRepository(BatchLog);
    const unfinishedLog = await batchLogRepo.findOne({
        where: { 
            type: BatchType.EXTRACT,
            status: BatchStatus.RUNNING 
        },
        order: { startTime: 'DESC' }
    });

    if (!unfinishedLog) {
        throw new Error('No running extract batch found');
    }
    return unfinishedLog;
}
