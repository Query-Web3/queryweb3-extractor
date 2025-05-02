import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { transformData } from './main';
import { initializeDataSource } from './dataSource';
import { v4 as uuidv4 } from 'uuid';

const TRANSFORM_INTERVAL_MS = process.env.TRANSFORM_INTERVAL_MS ? 
    Number(process.env.TRANSFORM_INTERVAL_MS) : 3600000;

export async function runTransform() {
    while (true) {
        let batchLog;
        try {
            const dataSource = await initializeDataSource();
            batchLog = await dataSource.getRepository(BatchLog).save({
                batchId: uuidv4(),
                status: BatchStatus.RUNNING,
                type: BatchType.TRANSFORM
            });
            
            await transformData(batchLog);
            
            if (batchLog?.id) {
                const repo = dataSource.getRepository(BatchLog);
                await repo.update(batchLog.id, {
                    endTime: new Date(),
                    status: BatchStatus.SUCCESS
                });
            }
        } catch (e) {
            console.error(e);
            
            if (batchLog?.id) {
                const repo = (await initializeDataSource()).getRepository(BatchLog);
                await repo.update(batchLog.id, {
                    endTime: new Date(),
                    status: BatchStatus.FAILED,
                    retryCount: (batchLog.retryCount || 0) + 1
                });
            }
        }
        console.log(`Wait for <${TRANSFORM_INTERVAL_MS / 3600000}> hours to run next batch...`);
        await new Promise(resolve => setTimeout(resolve, TRANSFORM_INTERVAL_MS));
    }
}
