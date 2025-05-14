import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus } from '../../entities/BatchLog';
import { initializeDataSource } from './dataSource';
import { checkAndAcquireLock, releaseLock } from './lockManager';
import { Logger, LogLevel } from '../../utils/logger';

export abstract class BaseProcessor<T> {
    protected logger = Logger.getInstance();
    protected dataSource!: DataSource;
    protected batchLog!: BatchLog;
    protected batchId!: string;
    protected numericBatchId!: number;

    public async process(batchLog: BatchLog, maxRetries = 3): Promise<{
        processedCount: number;
        lastProcessedHeight: number | null;
    }> {
        this.batchLog = batchLog;
        this.batchId = batchLog.batchId;
        this.numericBatchId = parseInt(batchLog.batchId) || Date.now();

        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
        this.logger.setBatchLog(batchLog);
        this.logger.info(`Starting ${this.getProcessorName()} batch with ID: ${this.batchId}`);

        this.dataSource = await initializeDataSource();
        
        let retryCount = 0;
        while (retryCount < maxRetries) {
            try {
                const hasLock = await checkAndAcquireLock(this.dataSource, this.batchId);
                if (!hasLock) {
                    return { processedCount: 0, lastProcessedHeight: null };
                }

                // 使用事务处理数据
                const queryRunner = this.dataSource.createQueryRunner();
                await queryRunner.connect();
                await queryRunner.startTransaction();

                try {
                    // 1. Fetch data
                    const rawData = await this.fetchData();
                    
                    // 2. Process data
                    const processedData = await this.processData(rawData);
                    
                    // 3. Save data
                    await this.saveData(processedData);

                    // 4. Update batch log
                    await this.updateBatchLog(processedData.length);

                    await queryRunner.commitTransaction();
                    await releaseLock(this.dataSource, this.batchId);

                    return {
                        processedCount: processedData.length,
                        lastProcessedHeight: await this.getLastProcessedHeight()
                    };
                } catch (error) {
                    await queryRunner.rollbackTransaction();
                    if (error instanceof Error && error.message.includes('Deadlock') && retryCount < maxRetries - 1) {
                        retryCount++;
                        this.logger.warn(`Deadlock detected, retrying (${retryCount}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                        continue;
                    }
                    await this.handleError(error);
                    throw error;
                } finally {
                    await queryRunner.release();
                    await this.cleanup();
                }
            } catch (error) {
                if (retryCount >= maxRetries - 1) {
                    await this.handleError(error);
                    throw error;
                }
                retryCount++;
                this.logger.warn(`Retrying after error (${retryCount}/${maxRetries})`, error);
                await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            }
        }
        return { processedCount: 0, lastProcessedHeight: null };
    }

    protected abstract getProcessorName(): string;
    protected abstract fetchData(): Promise<T>;
    protected abstract processData(rawData: T): Promise<any[]>;
    protected abstract saveData(processedData: any[]): Promise<void>;
    protected abstract getLastProcessedHeight(): Promise<number | null>;

    protected async updateBatchLog(processedCount: number): Promise<void> {
        if (this.batchLog) {
            await this.dataSource.getRepository(BatchLog).update(this.batchLog.id, {
                endTime: new Date(),
                status: BatchStatus.SUCCESS,
                processed_block_count: processedCount,
                last_processed_height: await this.getLastProcessedHeight()
            });
        }
    }

    protected async handleError(error: unknown): Promise<void> {
        if (error instanceof Error) {
            this.logger.error(`Error in ${this.getProcessorName()} processor`, error);
        } else {
            this.logger.error(`Error in ${this.getProcessorName()} processor`, new Error(String(error)));
        }
        await releaseLock(this.dataSource, this.batchId, false);
    }

    protected async cleanup(): Promise<void> {
        // Can be overridden by subclasses for resource cleanup
    }
}
