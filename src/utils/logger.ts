import { BatchLog } from '../entities/BatchLog';
import { initializeDataSource } from '../commands/transform/dataSource';

interface Metrics {
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    durations: Record<string, number>;
    throughput: number;
}

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

export class Logger {
    private static instance: Logger;
    private batchLog?: BatchLog;
    private logLevel: LogLevel = LogLevel.INFO;
    private metrics: Metrics = {
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        durations: {},
        throughput: 0
    };

    private constructor() {}

    public recordSuccess() {
        this.metrics.successCount++;
        this.metrics.totalProcessed++;
    }

    public recordError() {
        this.metrics.errorCount++;
        this.metrics.totalProcessed++;
    }

    public recordDuration(label: string, durationMs: number) {
        console.debug(`[DEBUG] Recording duration for ${label}: ${durationMs}ms`);
        this.metrics.durations[label] = durationMs;
        console.debug(`[DEBUG] Current durations:`, this.metrics.durations);
    }

    public getMetrics(): Metrics {
        return {
            ...this.metrics,
            throughput: this.metrics.totalProcessed > 0 
                ? this.metrics.successCount / this.metrics.totalProcessed * 100
                : 0
        };
    }

    public resetMetrics() {
        // 保留durations数据，只重置计数指标
        this.metrics = {
            totalProcessed: 0,
            successCount: 0,
            errorCount: 0,
            durations: this.metrics.durations || {},
            throughput: 0
        };
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setBatchLog(batchLog: BatchLog) {
        this.batchLog = batchLog;
    }

    public setLogLevel(level: LogLevel) {
        this.logLevel = level;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }

    private async logToBatchLog(level: LogLevel, message: string, details?: any) {
        if (!this.batchLog?.id) return;

        try {
            const dataSource = await initializeDataSource();
            const repo = dataSource.getRepository(BatchLog);
            await repo.update(this.batchLog.id, {
                logs: [...(this.batchLog.logs || []), {
                    timestamp: new Date(),
                    level,
                    message,
                    details
                }]
            });
        } catch (e) {
            console.error('Failed to update batch log:', e);
        }
    }

    public debug(message: string, details?: any) {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        console.debug(`[DEBUG] ${message}`, details);
        this.logToBatchLog(LogLevel.DEBUG, message, details);
    }

    public info(message: string, details?: any) {
        if (!this.shouldLog(LogLevel.INFO)) return;
        console.log(`[INFO] ${message}`, details);
        this.logToBatchLog(LogLevel.INFO, message, details);
    }

    public warn(message: string, details?: any) {
        if (!this.shouldLog(LogLevel.WARN)) return;
        console.warn(`[WARN] ${message}`, details);
        this.logToBatchLog(LogLevel.WARN, message, details);
    }

    public error(message: string, error?: Error, details?: any) {
        if (!this.shouldLog(LogLevel.ERROR)) return;
        console.error(`[ERROR] ${message}`, error, details);
        
        const errorDetails = {
            message: error?.message || message,
            stack: error?.stack,
            details
        };
        
        this.logToBatchLog(LogLevel.ERROR, message, errorDetails);
        
        // Also update batch log with error details if available
        if (this.batchLog?.id) {
            this.updateBatchLogWithError(errorDetails);
        }
    }

    private async updateBatchLogWithError(errorDetails: any) {
        try {
            const dataSource = await initializeDataSource();
            const repo = dataSource.getRepository(BatchLog);
            await repo.update(this.batchLog!.id, {
                errorDetails: JSON.stringify(errorDetails)
            });
        } catch (e) {
            console.error('Failed to update batch log with error:', e);
        }
    }

            public time(label: string) {
        if (!this.shouldLog(LogLevel.DEBUG)) return { end: () => {} };

        console.time(label);
        const start = process.hrtime();

        return {
            end: () => {
                console.timeEnd(label);
                const [seconds, nanoseconds] = process.hrtime(start);
                const durationMs = (seconds * 1000) + (nanoseconds / 1000000);
                
                this.recordDuration(label, durationMs);
                this.logToBatchLog(LogLevel.DEBUG, `Timing: ${label}`, {
                    durationMs,
                    label
                });
            }
        };
    }
}
