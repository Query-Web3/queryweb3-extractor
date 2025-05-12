import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { transformData } from './main';
import { initializeDataSource } from './dataSource';
import { v4 as uuidv4 } from 'uuid';
import { Logger, LogLevel } from '../../utils/logger';

const TRANSFORM_INTERVAL_MS = process.env.TRANSFORM_INTERVAL_MS ? 
    Number(process.env.TRANSFORM_INTERVAL_MS) : 3600000;

export async function runTransform() {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);

    while (true) {
        const batchTimer = logger.time('Transform batch');
        let batchLog;
        try {
            const dataSource = await initializeDataSource();
            const batchLogRepo = dataSource.getRepository(BatchLog);
            batchLog = await batchLogRepo.save(batchLogRepo.create({
                batchId: uuidv4(),
                status: BatchStatus.RUNNING,
                type: BatchType.TRANSFORM
            }));
            
            logger.setBatchLog(batchLog);
            logger.info('Starting transform batch');
            
            await transformData(batchLog);
            
            if (batchLog?.id) {
                const repo = dataSource.getRepository(BatchLog);
                await repo.update(batchLog.id, {
                    endTime: new Date(),
                    status: BatchStatus.SUCCESS
                });
                logger.info('Transform batch completed successfully');
            }
        } catch (error) {
            const e = error instanceof Error ? error : new Error(String(error));
            logger.error('Transform batch failed', e);
            
            if (batchLog?.id) {
                const isConnectionError = e.message.includes('WebSocket is not connected');
                
                if (isConnectionError && (batchLog.retryCount || 0) < 10) {
                    const repo = (await initializeDataSource()).getRepository(BatchLog);
                    await repo.update(batchLog.id, {
                        status: BatchStatus.PAUSED,
                        retryCount: (batchLog.retryCount || 0) + 1,
                        errorDetails: e.message
                    });
                    
                    logger.info(`Connection error detected, pausing batch (retry ${(batchLog.retryCount || 0) + 1}/10)`);
                    await new Promise(resolve => setTimeout(resolve, 30000));
                    continue;
                } else {
                    const repo = (await initializeDataSource()).getRepository(BatchLog);
                    await repo.update(batchLog.id, {
                        endTime: new Date(),
                        status: isConnectionError ? BatchStatus.FAILED : BatchStatus.FAILED,
                        retryCount: (batchLog.retryCount || 0) + 1,
                        errorDetails: e.message
                    });
                    
                    if (isConnectionError) {
                        logger.error('Failed after 10 connection retries, exiting');
                        process.exit(1);
                    }
                }
            }
        } finally {
            batchTimer.end();
        }

        const waitHours = TRANSFORM_INTERVAL_MS / 3600000;
        logger.info(`Waiting for ${waitHours} hours to run next batch...`);
        await new Promise(resolve => setTimeout(resolve, TRANSFORM_INTERVAL_MS));
    }
}
