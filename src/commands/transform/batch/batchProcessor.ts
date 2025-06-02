import { v4 as uuidv4 } from 'uuid';
import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus, BatchType, LockStatus } from '../../../entities/BatchLog';
import { Logger } from '../../../utils/logger';
import { getRedisClient } from '../../../common/redis';

export class BatchProcessor {
    constructor(
        private dataSource: DataSource,
        private logger: Logger,
        private redisClient = getRedisClient()
    ) {}

    async checkAndCreateBatchLog(lockKey: string, transformIntervalMs: number): Promise<BatchLog | undefined> {
        const batchLogRepo = this.dataSource.getRepository(BatchLog);
        
        // Check existing lock
        const existingLock = await batchLogRepo.findOne({
            where: { lockKey }
        });

        if (existingLock) {
            const lockTime = existingLock.lockTime?.getTime() || 0;
            const currentTime = Date.now();
            if (currentTime - lockTime < transformIntervalMs) {
                this.logger.info(`Transform data is locked until ${new Date(lockTime + transformIntervalMs)}`);
                return undefined;
            }
        }

        return await batchLogRepo.save(batchLogRepo.create({
            batchId: uuidv4(),
            startTime: new Date(),
            status: BatchStatus.RUNNING,
            type: BatchType.TRANSFORM,
            retryCount: 0,
            processed_block_count: 0,
            last_processed_height: null,
            lockKey,
            lockTime: new Date(),
            lockStatus: LockStatus.LOCKED
        }));
    }

    async updateBatchLogOnError(batchLog: BatchLog) {
        try {
            const batchLogRepo = this.dataSource.getRepository(BatchLog);
            await batchLogRepo.update(batchLog.id, {
                status: BatchStatus.FAILED,
                endTime: new Date(),
                lockStatus: LockStatus.FAILED
            });
        } catch (err) {
            this.logger.error('Failed to update batch log with error status', err as Error);
            throw err;
        }
    }

    async updateBlockCount(batchLog: BatchLog, blockNumber: number) {
        try {
            const redis = await this.redisClient;
            const batchKey = `batch:${batchLog.batchId}`;
            
            // 更新最后处理高度
            await redis.hSet(batchKey, 'last_height', blockNumber);
            
            // 增加处理区块计数
            await redis.hIncrBy(batchKey, 'block_count', 1);
            
            // 更新数据库中的计数器（可选，减少最终更新的数据量）
            await this.dataSource.getRepository(BatchLog).update(batchLog.id, {
                last_processed_height: blockNumber,
                processed_block_count: () => 'processed_block_count + 1'
            });
        } catch (err) {
            this.logger.error('Failed to update block count in Redis', err as Error);
            throw err;
        }
    }

    async cleanupBatchData(batchLog: BatchLog) {
        try {
            const redis = await this.redisClient;
            const batchKey = `batch:${batchLog.batchId}`;
            await redis.del(batchKey);
            this.logger.info(`Cleaned up Redis data for batch ${batchLog.batchId}`);
        } catch (err) {
            this.logger.error('Failed to cleanup Redis batch data', err as Error);
        }
    }

    async finalizeBatchLog(batchLog: BatchLog) {
        let finalStatus = {
            status: BatchStatus.COMPLETED,
            endTime: new Date().toISOString(),
            lockStatus: LockStatus.UNLOCKED,
            last_processed_height: batchLog.last_processed_height,
            processed_block_count: batchLog.processed_block_count
        };

        try {
            const redis = await this.redisClient;
            const batchKey = `batch:${batchLog.batchId}`;
            
            // 从Redis获取最终统计
            const [lastHeight, blockCount] = await redis.hmGet(batchKey, ['last_height', 'block_count']);
            
            finalStatus = {
                ...finalStatus,
                last_processed_height: lastHeight ? parseInt(lastHeight) : batchLog.last_processed_height,
                processed_block_count: blockCount ? parseInt(blockCount) : batchLog.processed_block_count
            };
        } catch (redisErr) {
            this.logger.error('Failed to get stats from Redis, using database values', redisErr as Error);
        }

        // First try to update via database
        try {
            this.logger.info('Attempting database status update...');
            const finalDataSource = new DataSource({
                type: 'mysql',
                host: process.env.TRANSFORM_DB_HOST,
                port: parseInt(process.env.TRANSFORM_DB_PORT || '3306'),
                username: process.env.TRANSFORM_DB_USER,
                password: process.env.TRANSFORM_DB_PASSWORD,
                database: process.env.TRANSFORM_DB_NAME,
                entities: [BatchLog],
                synchronize: false,
                logging: false,
                extra: {
                    connectTimeout: 10000  // Shorter timeout for final update
                }
            });
            
            await finalDataSource.initialize();
            const batchLogRepo = finalDataSource.getRepository(BatchLog);
            await batchLogRepo.update(batchLog.id, finalStatus);
            await finalDataSource.destroy();
            this.logger.info('Database status update succeeded');
        } catch (dbErr: unknown) {
            const err = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
            this.logger.error('Database status update failed, falling back to file', err);
            
            // Fallback to file system
            try {
                const statusFile = `/tmp/batch_${batchLog.batchId}_status.json`;
                const fs = require('fs');
                fs.writeFileSync(statusFile, JSON.stringify({
                    batchId: batchLog.batchId,
                    ...finalStatus,
                    error: 'Database update failed',
                    dbError: err.message || 'Unknown error'
                }));
                this.logger.info(`Status saved to file: ${statusFile}`);
            } catch (fileErr: unknown) {
                const err = fileErr instanceof Error ? fileErr : new Error(String(fileErr));
                this.logger.error('CRITICAL: Failed to save status to file', err);
            }
        }

        // If file exists but DB succeeded, clean it up
        try {
            const statusFile = `/tmp/batch_${batchLog.batchId}_status.json`;
            const fs = require('fs');
            if (fs.existsSync(statusFile)) {
                fs.unlinkSync(statusFile);
                this.logger.info('Cleaned up status file');
            }
        } catch (cleanupErr: unknown) {
            const err = cleanupErr instanceof Error ? cleanupErr : new Error(String(cleanupErr));
            this.logger.warn('Failed to clean up status file', err);
        }
    }
}
