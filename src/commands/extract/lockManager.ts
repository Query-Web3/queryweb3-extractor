import { DataSource } from 'typeorm';
import { BatchLog, LockStatus } from '../../entities/BatchLog';

const EXTRACT_INTERVAL_MS = process.env.EXTRACT_INTERVAL_MS ? Number(process.env.EXTRACT_INTERVAL_MS) : 3600000;
const LOCK_KEY = 'extract_data_lock';

export async function checkAndAcquireLock(dataSource: DataSource, batchId: string): Promise<boolean> {
    const batchRepo = dataSource.getRepository(BatchLog);
    
    // First verify batch exists
    const batch = await batchRepo.findOne({ where: { batchId } });
    if (!batch) {
        throw new Error(`Batch with ID ${batchId} not found`);
    }

    // Check existing lock
    const existingLock = await batchRepo.findOne({
        where: { lockKey: LOCK_KEY }
    });

    if (existingLock) {
        const lockTime = existingLock.lockTime?.getTime() || 0;
        const currentTime = Date.now();
        if (currentTime - lockTime < EXTRACT_INTERVAL_MS) {
            console.log(`Extract data is locked until ${new Date(lockTime + EXTRACT_INTERVAL_MS)}`);
            return false;
        }
    }

    // Update the existing batch record with lock info
    await batchRepo.update(batch.id, {
        lockKey: LOCK_KEY,
        lockTime: new Date(),
        lockStatus: LockStatus.LOCKED
    });

    return true;
}

export async function releaseLock(dataSource: DataSource, batchId: string, success: boolean = true) {
    const batchRepo = dataSource.getRepository(BatchLog);
    
    // Verify batch exists
    const batch = await batchRepo.findOne({ where: { batchId } });
    if (!batch) {
        throw new Error(`Batch with ID ${batchId} not found`);
    }

    await batchRepo.update(batch.id, {
        lockStatus: success ? LockStatus.UNLOCKED : LockStatus.FAILED,
        lockTime: new Date()
    });
}
