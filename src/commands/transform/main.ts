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
import { processTokenStats } from './token/tokenStatsProcessor';
import { processYieldStats } from './yield/yieldStatsProcessor';
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
                    } catch (e) {
                        logger.error(`Failed to process Acala data for block #${block.number}`, e as Error);
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
                } catch (e) {
                    logger.error(`Failed to process extrinsic`, e as Error, {
                        extrinsicId: extrinsic.id,
                        method: extrinsic.method,
                        params: extrinsic.params
                    });
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
                .groupBy('event.data')
                .getMany();

            for (const event of events) {
                try {
                    const data = event.data as any;
                    if (data?.currencyId) {
                        tokenIds.add(data.currencyId);
                    }
                } catch (e) {
                    logger.error(`Failed to process event`, e as Error, {
                        eventId: event.id,
                        section: event.section,
                        method: event.method,
                        data: event.data
                    });
                }
            }
            eventTimer.end();

            // Batch process all unique tokens
            if (tokenIds.size > 0) {
                const tokenTimer = logger.time('Batch process tokens');
            const tokenService = new TokenService(
                new TokenRepository(),
                new TokenValidator(),
                new TokenFactory()
            );
            await Promise.all(Array.from(tokenIds).map(tokenId => 
                tokenService.upsertToken(tokenId).catch(e => 
                    logger.error(`Failed to process token ${tokenId}`, e as Error)
                )
            ));
                tokenTimer.end();
            }

            // Validate data consistency
            const validateTimer = logger.time('Validate data');
            const tokenCount = await dataSource.getRepository(DimToken).count();
            const blockCount = await blockRepo.count();
            
            if (tokenCount === 0) {
                logger.warn('No tokens found in DimToken table');
            }
            if (blockCount === 0) {
                logger.warn('No blocks found in acala_block table');
            }
            validateTimer.end();

            const statsTimer = logger.time('Process stats');
            const dimensionInitializer = new DimensionInitializer();
            await dimensionInitializer.initialize();
            await processTokenStats();
            await processYieldStats();
            statsTimer.end();
            
            await queryRunner.commitTransaction();
            logger.info(`Data transformation completed. Stats: ${tokenCount} tokens, ${blockCount} blocks processed`);
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
