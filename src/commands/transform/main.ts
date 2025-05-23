import { BatchLog, BatchStatus, BatchType, LockStatus } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';
import { AcalaBlock } from '../../entities/acala/AcalaBlock';
import { DimToken } from '../../entities/DimToken';
import { Not, IsNull } from 'typeorm';
import { AcalaExtrinsic } from '../../entities/acala/AcalaExtrinsic';
import { AcalaEvent } from '../../entities/acala/AcalaEvent';
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

    if (!batchLog) {
        const dataSource = await initializeDataSource();
        const batchLogRepo = dataSource.getRepository(BatchLog);
        
        // Check existing lock
        const existingLock = await batchLogRepo.findOne({
            where: { lockKey: LOCK_KEY }
        });

        if (existingLock) {
            const lockTime = existingLock.lockTime?.getTime() || 0;
            const currentTime = Date.now();
            if (currentTime - lockTime < TRANSFORM_INTERVAL_MS) {
                logger.info(`Transform data is locked until ${new Date(lockTime + TRANSFORM_INTERVAL_MS)}`);
                return;
            }
        }

        batchLog = await batchLogRepo.save(batchLogRepo.create({
            batchId: 'cli-' + Date.now(),
            startTime: new Date(),
            status: BatchStatus.RUNNING,
            type: BatchType.TRANSFORM,
            retryCount: 0,
            processed_block_count: 0,
            last_processed_height: null,
            lockKey: LOCK_KEY,
            lockTime: new Date(),
            lockStatus: LockStatus.LOCKED
        }));
    }
    logger.setBatchLog(batchLog);

    logger.info('Starting data transformation from Acala to DIM tables...');
    
    try {
        const initTimer = logger.time('Initialize data source');
        logger.info('Initializing data source...');
        const dataSource = await initializeDataSource();
        logger.info('Data source initialized successfully');
        
        if (!dataSource.isInitialized) {
            logger.info('Initializing database connection...');
            await dataSource.initialize();
        }
        logger.info('Database connection established');
        initTimer.end();

            const queryRunner = dataSource.createQueryRunner();
            const transactionTimer = logger.time('Database transaction');
            await queryRunner.connect();
            await queryRunner.startTransaction();
        
        try {
            const blockTimer = logger.time('Query latest block');
            const blockRepo = dataSource.getRepository(AcalaBlock);
            logger.info('Querying latest block...');
            const latestBlock = await blockRepo.findOne({ 
                where: {},
                order: { number: 'DESC' }
            });
            
            if (!latestBlock) {
                throw new Error('No blocks found in acala_block table');
            }
            
            logger.info(`Processing latest block #${latestBlock.number} (batchId: ${latestBlock.batchId})`);
            blockTimer.end();

            // Batch collect all token IDs that need processing (including from Acala data)
            const tokenIds = new Set<string>();

            // Process all blocks with acalaData
            const acalaBlocks = await blockRepo.find({
                where: { acalaData: Not(IsNull()) },
                order: { number: 'ASC' }
            });

            if (acalaBlocks.length > 0) {
                const acalaTimer = logger.time('Process Acala block data');
                try {
                    logger.info(`Found ${acalaBlocks.length} blocks with Acala data`);
                    
                    for (const block of acalaBlocks) {
                        try {
                            const acalaData = block.acalaData;
                            if (acalaData?.events) {
                                for (const event of acalaData.events) {
                                    if (event?.currencyId) {
                                        tokenIds.add(event.currencyId);
                                    }
                                }
                            }
                            logger.recordSuccess();
                        } catch (e) {
                            logger.error(`Failed to process Acala data for block #${block.number}`, e as Error);
                            logger.recordError();
                        }
                    }
                } finally {
                    acalaTimer.end();
                }
            }

            
            // Process extrinsics
            const methodsToProcess = [
                'tokens.transfer',
                'dex.swapWithExactSupply',
                'dex.swapWithExactTarget',
                'homa.mint',
                'homa.requestRedeem'
            ];

            const processTimer = logger.time('Process extrinsics');
            try {
                const extrinsics = await dataSource.getRepository(AcalaExtrinsic)
                    .createQueryBuilder('extrinsic')
                    .where('extrinsic.method IN (:...methods)', { methods: methodsToProcess })
                    .groupBy('extrinsic.params')
                    .getMany();

                for (const extrinsic of extrinsics) {
                        try {
                            const method = extrinsic.method;
                            const params = extrinsic.params as any;
                            
                            if (method.startsWith('tokens.') && params?.currencyId) {
                                tokenIds.add(params.currencyId);
                            } else if (method.startsWith('dex.') && params?.path) {
                                for (const currencyId of params.path) {
                                    tokenIds.add(currencyId);
                                }
                            } else if (method.startsWith('homa.')) {
                                tokenIds.add('ACA');
                            }
                            logger.recordSuccess();
                        } catch (e) {
                            logger.error(`Failed to process extrinsic`, e as Error, {
                                extrinsicId: extrinsic.id,
                                method: extrinsic.method,
                                params: extrinsic.params
                            });
                            logger.recordError();
                        }
                }
            } finally {
                processTimer.end();
            }

            // Process events
            const eventPatterns = [
                { section: 'tokens', method: 'transfer' },
                { section: 'dex', method: 'swap' },
                { section: 'homa', method: 'minted' },
                { section: 'homa', method: 'redeemed' },
                { section: 'rewards', method: 'reward' }
            ];

            const eventTimer = logger.time('Process events');
            try {
                const events = await dataSource.getRepository(AcalaEvent)
                    .createQueryBuilder('event')
                    .where('LOWER(event.section) IN (:...sections) AND LOWER(event.method) IN (:...methods)', {
                        sections: eventPatterns.map(p => p.section.toLowerCase()),
                        methods: eventPatterns.map(p => p.method.toLowerCase())
                    })
                    .getMany();

                for (const event of events) {
                    try {
                        const data = event.data as any;
                        if (data?.currencyId) {
                            tokenIds.add(data.currencyId);
                        }
                        logger.recordSuccess();
                    } catch (e) {
                        logger.error(`Failed to process event`, e as Error, {
                            eventId: event.id,
                            section: event.section,
                            method: event.method,
                            data: event.data
                        });
                        logger.recordError();
                    }
                }
            } finally {
                eventTimer.end();
            }

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
                    const blockCount = await blockRepo.count();
                    
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
            const finalBlockCount = await blockRepo.count();
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
        
        // Update batch log with error status
        const dataSource = await initializeDataSource();
        const batchLogRepo = dataSource.getRepository(BatchLog);
        await batchLogRepo.update(batchLog.id, {
            status: BatchStatus.FAILED,
            endTime: new Date(),
            lockStatus: LockStatus.FAILED
        });
        
        throw e;
    } finally {
        // Release lock if batch completed successfully
        if (batchLog && batchLog.status === BatchStatus.RUNNING) {
            const dataSource = await initializeDataSource();
            const batchLogRepo = dataSource.getRepository(BatchLog);
            await batchLogRepo.update(batchLog.id, {
                status: BatchStatus.COMPLETED,
                endTime: new Date(),
                lockStatus: LockStatus.UNLOCKED
            });
        }
    }
}

export const showLastTransformBatchLog = () => showLastBatchLog(BatchType.TRANSFORM);
export const pauseTransformBatch = pauseBatch;
export const resumeTransformBatch = () => resumeBatch(BatchType.TRANSFORM);
