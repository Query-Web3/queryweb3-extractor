import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
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
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);

    if (!batchLog) {
        batchLog = new BatchLog();
        batchLog.id = 0;
        batchLog.batchId = 'cli-' + Date.now();
        batchLog.type = BatchType.TRANSFORM;
        batchLog.status = BatchStatus.RUNNING;
        batchLog.startTime = new Date();
        batchLog.retryCount = 0;
        batchLog.processed_block_count = 0;
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
                acalaTimer.end();
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
            processTimer.end();

            // Process events
            const eventPatterns = [
                { section: 'tokens', method: 'transfer' },
                { section: 'dex', method: 'swap' },
                { section: 'homa', method: 'minted' },
                { section: 'homa', method: 'redeemed' },
                { section: 'rewards', method: 'reward' }
            ];

            const eventTimer = logger.time('Process events');
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
            eventTimer.end();

            // Unified processing of tokens and stats
            if (tokenIds.size > 0) {
                const processTimer = logger.time('Process tokens and stats');
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
                    try {
                        // Upsert token to dim table
                        const token = await tokenService.upsertToken(tokenId);
                        logger.debug(`Processed token: ${tokenId}`);

                        // Process token stats to fact tables
                        const tokenStatsRepo = new TokenStatsRepository(dataSource);
                        
                        // Process daily stats first
                        const dailyStatsProcessor = new DailyStatsProcessor(tokenStatsRepo, logger);
                        await dailyStatsProcessor.processToken(token);
                        
                        // Then process weekly stats (aggregates daily)
                        const weeklyStatsProcessor = new WeeklyStatsProcessor(tokenStatsRepo, logger);
                        await weeklyStatsProcessor.processToken(token);
                        
                        // Then process monthly stats (aggregates weekly)
                        const monthlyStatsProcessor = new MonthlyStatsProcessor(tokenStatsRepo, logger);
                        await monthlyStatsProcessor.processToken(token);
                        
                        // Finally process yearly stats (aggregates monthly)
                        const yearlyStatsProcessor = new YearlyStatsProcessor(tokenStatsRepo, logger);
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
                }

                processTimer.end();
            }
            
            await queryRunner.commitTransaction();
            const metrics = logger.getMetrics();
            const finalTokenCount = await dataSource.getRepository(DimToken).count();
            const finalBlockCount = await blockRepo.count();
            logger.info(`Data transformation completed. Stats: ${finalTokenCount} tokens, ${finalBlockCount} blocks processed`);
            logger.info(`Performance metrics: 
  - Success rate: ${metrics.throughput.toFixed(2)}%
  - Total processed: ${metrics.totalProcessed}
  - Success count: ${metrics.successCount}
  - Error count: ${metrics.errorCount}
  - Processing durations: ${JSON.stringify(metrics.durations, null, 2)}`);
        } catch (e) {
            await queryRunner.rollbackTransaction();
            logger.error('Transaction rolled back due to error', e as Error);
            throw e;
        } finally {
            await queryRunner.release();
        }
    } catch (e) {
        logger.error('Transform failed', e as Error);
        throw e;
    }
}

export const showLastTransformBatchLog = () => showLastBatchLog(BatchType.TRANSFORM);
export const pauseTransformBatch = pauseBatch;
export const resumeTransformBatch = () => resumeBatch(BatchType.TRANSFORM);
