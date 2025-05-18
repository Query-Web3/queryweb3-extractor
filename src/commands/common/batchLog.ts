import { batchDataSource } from '../../datasources/batchDataSource';
import { BatchLog, BatchType, BatchStatus } from '../../entities/BatchLog';

export async function showLastBatchLog(type: BatchType) {
    if (!batchDataSource.isInitialized) {
        await batchDataSource.initialize();
    }
    const batchLogRepo = batchDataSource.getRepository(BatchLog);
    const lastLog = await batchLogRepo.findOne({
        where: { type },
        order: { startTime: 'DESC' }
    });

    if (lastLog) {
        console.log(`Last ${BatchType[type]} BatchLog Record:`);
        console.log(`ID: ${lastLog.id}`);
        console.log(`Batch ID: ${lastLog.batchId}`);
        console.log(`Start Time: ${lastLog.startTime}`);
        console.log(`End Time: ${lastLog.endTime || 'N/A'}`);
        console.log(`Status: ${lastLog.status}`);
        console.log(`Type: ${lastLog.type}`);
        console.log(`Processed Blocks: ${lastLog.processed_block_count}`);
        console.log(`Last Processed Height: ${lastLog.last_processed_height || 'N/A'}`);
    } else {
        console.log(`No ${BatchType[type]} batchlog records found`);
    }
}

export async function pauseBatch(batchlogId: number) {
    if (!batchDataSource.isInitialized) {
        await batchDataSource.initialize();
    }
    const batchLogRepo = batchDataSource.getRepository(BatchLog);
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

export async function resumeBatch(type: BatchType) {
    if (!batchDataSource.isInitialized) {
        await batchDataSource.initialize();
    }
    const batchLogRepo = batchDataSource.getRepository(BatchLog);
    const unfinishedLog = await batchLogRepo.findOne({
        where: { 
            type,
            status: BatchStatus.RUNNING 
        },
        order: { startTime: 'DESC' }
    });

    if (!unfinishedLog) {
        throw new Error(`No running ${BatchType[type]} batch found`);
    }
    return unfinishedLog;
}
