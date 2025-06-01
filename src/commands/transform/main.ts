import { BatchLog, BatchStatus, BatchType, LockStatus } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';
import { DimToken } from '../../entities/DimToken';
import { BlockProcessor } from './block/blockProcessor';
import { BatchProcessor } from './batch/batchProcessor';
import { initializeDataSource } from './dataSource';
import { TokenService } from './token/TokenService';
import { TokenRepository } from './token/TokenRepository';
import { TokenValidator } from './token/TokenValidator';
import { TokenFactory } from './token/TokenFactory';
import { DimensionInitializer } from './token/DimensionInitializer';
import { DailyStatsProcessor } from './periodic/dailyStatsProcessor';
import { WeeklyStatsProcessor } from './periodic/weeklyStatsProcessor';
import { MonthlyStatsProcessor } from './periodic/monthlyStatsProcessor';
import { YearlyStatsProcessor } from './periodic/yearlyStatsProcessor';
import { TokenStatsRepository } from './token/tokenStatsRepository';
import { YieldStatsProcessor } from './yield/yieldStatsProcessor';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Logger, LogLevel } from '../../utils/logger';

export async function transformData(batchLog?: BatchLog) {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.DEBUG);
    const TRANSFORM_INTERVAL_MS = process.env.TRANSFORM_INTERVAL_MS ? Number(process.env.TRANSFORM_INTERVAL_MS) : 3600000;
    const LOCK_KEY = 'transform_data_lock';

    // Initialize data source once and reuse
    let dataSource: DataSource;
    try {
        dataSource = await initializeDataSource();
        if (!dataSource.isInitialized) {
            logger.info('Initializing database connection...');
            await dataSource.initialize();
            logger.info('Database connection established');
        }
    } catch (err) {
        logger.error('Failed to initialize data source', err as Error);
        throw err;
    }

    const batchProcessor = new BatchProcessor(dataSource, logger);
    if (!batchLog) {
        batchLog = await batchProcessor.checkAndCreateBatchLog(LOCK_KEY, TRANSFORM_INTERVAL_MS);
        if (!batchLog) {
            return; // Lock is active
        }
    }
    logger.setBatchLog(batchLog);

    logger.info('Starting data transformation from Acala to DIM tables...');
    
    try {
        const initTimer = logger.time('Initialize data source');
        logger.info('Using pre-initialized data source');
        initTimer.end();

            // Ensure data source is connected before starting transaction
            if (!dataSource.isInitialized) {
                logger.info('Reinitializing data source before transaction...');
                await dataSource.initialize();
            }
            
            const queryRunner = dataSource.createQueryRunner();
            const transactionTimer = logger.time('Database transaction');
            
            try {
                await queryRunner.connect();
                await queryRunner.startTransaction();
            } catch (err) {
                logger.error('Failed to start transaction', err as Error);
                // Try reconnecting data source and retry
                logger.info('Attempting to reconnect data source...');
                await dataSource.initialize();
                await queryRunner.connect();
                await queryRunner.startTransaction();
            }
        
        try {
            const blockProcessor = new BlockProcessor(dataSource, logger);
            const latestBlock = await blockProcessor.getLatestBlock();
            const tokenIds = new Set<string>();
            
            await blockProcessor.processAcalaBlocks(tokenIds);
            await blockProcessor.processExtrinsics(tokenIds);
            await blockProcessor.processEvents(tokenIds);

            // Unified processing of tokens and stats
            if (tokenIds.size > 0) {
                const processTimer = logger.time('Process tokens and stats');
                try {
                    const tokenService = new TokenService(
                        new TokenRepository(),
                        new TokenValidator(),
                        new TokenFactory()
                    );
                    
                    const tokenArray = Array.from(tokenIds);
                    logger.info(`Found ${tokenArray.length} tokens to process`);

                    // Initialize dimensions first
                    const dimensionInitializer = new DimensionInitializer();
                    await dimensionInitializer.initialize();

                    // Process each token with stats
                    for (const tokenId of tokenArray) {
                        const tokenTimer = logger.time(`Process token ${tokenId}`);
                        try {
                            // Upsert token to dim table
                            const token = await tokenService.upsertToken(tokenId);
                            logger.debug(`Processed token: ${tokenId}`);

                            // Process token stats to fact tables
                            const tokenStatsRepo = new TokenStatsRepository(dataSource);
                            
                            // Process daily stats first
                            const dailyStatsProcessor = new DailyStatsProcessor(tokenStatsRepo, logger, tokenService);
                            await dailyStatsProcessor.processToken(token);
                            
                            // Then process weekly stats (aggregates daily)
                            const weeklyStatsProcessor = new WeeklyStatsProcessor(tokenStatsRepo, logger, tokenService);
                            await weeklyStatsProcessor.processToken(token);
                            
                            // Then process monthly stats (aggregates weekly)
                            const monthlyStatsProcessor = new MonthlyStatsProcessor(tokenStatsRepo, logger, tokenService);
                            await monthlyStatsProcessor.processToken(token);
                            
                            // Finally process yearly stats (aggregates monthly)
                            const yearlyStatsProcessor = new YearlyStatsProcessor(tokenStatsRepo, logger, tokenService);
                            await yearlyStatsProcessor.processToken(token);
                            
                            const yieldStatsProcessor = new YieldStatsProcessor(dataSource, logger);
                            await yieldStatsProcessor.processToken(token);
                            
                            logger.recordSuccess();
                        } catch (e) {
                            logger.error(`Failed to process token ${tokenId}`, e as Error);
                            logger.recordError();
                        }
                    }

                    // Validate data consistency
                    const tokenCount = await dataSource.getRepository(DimToken).count();
                    const blockCount = await blockProcessor.getBlockRepo().count();
                    
                    if (tokenCount === 0) {
                        logger.warn('No tokens found in DimToken table');
                    }
                    if (blockCount === 0) {
                        logger.warn('No blocks found in acala_block table');
                    }

                    // Update Redis cache
                    const redisTimer = logger.time('Update Redis cache');
                    try {
                        const allTokens = await dataSource.getRepository(DimToken).find();
                        await tokenService['redisClient'].set(
                            'dim_tokens',
                            JSON.stringify(allTokens),
                            { EX: 3600 }
                        );
                        logger.info(`Updated Redis cache with ${allTokens.length} tokens`);
                    } catch (e) {
                        logger.error('Failed to update Redis cache', e as Error);
                    } finally {
                        redisTimer.end();
                    }
                } finally {
                    processTimer.end();
                }
            }
            
            await queryRunner.commitTransaction();
            const metrics = logger.getMetrics();
            logger.debug('Metrics durations:', metrics.durations); // 调试输出
            const finalTokenCount = await dataSource.getRepository(DimToken).count();
            const finalBlockCount = await blockProcessor.getBlockRepo().count();
            logger.info(`Data transformation completed. Stats: ${finalTokenCount} tokens, ${finalBlockCount} blocks processed`);
            // Format all durations with proper indentation
            const durationsStr = Object.entries(metrics.durations)
                .map(([label, duration]) => {
                    const indent = label.startsWith('Process token') ? '      ' : '    ';
                    return `${indent}- ${label}: ${duration.toFixed(2)}ms`;
                })
                .join('\n');
            
            // Group token processing stats
            const tokenStats = Object.entries(metrics.durations)
                .filter(([label]) => label.startsWith('Process token'))
                .reduce((acc, [_, duration]) => {
                    acc.count++;
                    acc.total += duration;
                    return acc;
                }, {count: 0, total: 0});

            const summaryStr = [
                `Performance metrics:`,
                `  - Success rate: ${metrics.throughput.toFixed(2)}%`,
                `  - Total processed: ${metrics.totalProcessed}`,
                `  - Success count: ${metrics.successCount}`,
                `  - Error count: ${metrics.errorCount}`,
                `  - Processing durations:`,
                `    - Total time: ${Object.values(metrics.durations).reduce((a, b) => a + b, 0).toFixed(2)}ms`,
                tokenStats.count > 0 ? 
                    `    - Token processing: ${tokenStats.count} tokens, avg ${(tokenStats.total/tokenStats.count).toFixed(2)}ms/token` : 
                    '',
                `Detailed timings:\n${durationsStr}`
            ].filter(Boolean).join('\n');

            logger.info(summaryStr);
        } catch (e) {
            await queryRunner.rollbackTransaction();
            logger.error('Transaction rolled back due to error', e as Error);
            throw e;
        } finally {
            await queryRunner.release();
        }
    } catch (e) {
        logger.error('Transform failed', e as Error);
        
        await batchProcessor.updateBatchLogOnError(batchLog);
        
        throw e;
    } finally {
        if (batchLog && batchLog.status === BatchStatus.RUNNING) {
            await batchProcessor.finalizeBatchLog(batchLog);
        }
    }
}

export const showLastTransformBatchLog = () => showLastBatchLog(BatchType.TRANSFORM);
export const pauseTransformBatch = pauseBatch;
export const resumeTransformBatch = () => resumeBatch(BatchType.TRANSFORM);
