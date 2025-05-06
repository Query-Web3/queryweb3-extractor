import { BatchLog, BatchStatus, BatchType } from '../../entities/BatchLog';
import { showLastBatchLog, pauseBatch, resumeBatch } from '../common/batchLog';
import { Block } from '../../entities/Block';
import { Extrinsic } from '../../entities/Extrinsic';
import { Event } from '../../entities/Event';
import { initializeDataSource } from './dataSource';
import { upsertToken, initializeDimensionTables } from './tokenProcessor';
import { processTokenStats } from './tokenStatsProcessor';
import { processYieldStats } from './yieldStatsProcessor';
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
            const blockRepo = dataSource.getRepository(Block);
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

            const methodsToProcess = [
                'tokens.transfer',
                'dex.swapWithExactSupply',
                'dex.swapWithExactTarget',
                'homa.mint',
                'homa.requestRedeem'
            ];

            const processTimer = logger.time('Process extrinsics');
            for (const method of methodsToProcess) {
                const methodTimer = logger.time(`Process ${method}`);
                logger.debug(`Processing method: ${method}`);
                
                const extrinsics = await dataSource.getRepository(Extrinsic)
                    .createQueryBuilder('extrinsic')
                    .where('extrinsic.method = :method', { method })
                    .groupBy('extrinsic.params')
                    .getMany();

                logger.info(`Found ${extrinsics.length} extrinsics for method ${method}`);
                
                for (const extrinsic of extrinsics) {
                    try {
                        if (method.startsWith('tokens.')) {
                            const params = extrinsic.params as any;
                            if (params?.currencyId) {
                                await upsertToken(params.currencyId);
                            }
                        } else if (method.startsWith('dex.')) {
                            const params = extrinsic.params as any;
                            if (params?.path) {
                                for (const currencyId of params.path) {
                                    await upsertToken(currencyId);
                                }
                            }
                        } else if (method.startsWith('homa.')) {
                            await upsertToken('ACA');
                        }
                    } catch (e) {
                        logger.error(`Failed to process ${method} extrinsic`, e as Error, {
                            extrinsicId: extrinsic.id,
                            method,
                            params: extrinsic.params
                        });
                    }
                }
                methodTimer.end();
            }
            processTimer.end();

            const eventPatterns = [
                { section: 'tokens', method: 'transfer' },
                { section: 'dex', method: 'swap' },
                { section: 'homa', method: 'minted' },
                { section: 'homa', method: 'redeemed' },
                { section: 'rewards', method: 'reward' }
            ];

            const eventTimer = logger.time('Process events');
            for (const pattern of eventPatterns) {
                const patternTimer = logger.time(`Process ${pattern.section}.${pattern.method}`);
                logger.debug(`Querying events matching ${pattern.section}.${pattern.method}...`);
                
                const events = await dataSource.getRepository(Event)
                    .createQueryBuilder('event')
                    .where('LOWER(event.section) = LOWER(:section) AND LOWER(event.method) = LOWER(:method)', {
                        section: pattern.section,
                        method: pattern.method
                    })
                    .groupBy('event.data')
                    .getMany();
                
                logger.info(`Found ${events.length} events matching ${pattern.section}.${pattern.method}`);

                for (const event of events) {
                    try {
                        const data = event.data as any;
                        if (data?.currencyId) {
                            await upsertToken(data.currencyId);
                        }
                    } catch (e) {
                        logger.error(`Failed to process ${pattern.section}.${pattern.method} event`, e as Error, {
                            eventId: event.id,
                            section: pattern.section,
                            method: pattern.method,
                            data: event.data
                        });
                    }
                }
                patternTimer.end();
            }
            eventTimer.end();

            const statsTimer = logger.time('Process stats');
            await initializeDimensionTables();
            await processTokenStats();
            await processYieldStats();
            statsTimer.end();
            
            await queryRunner.commitTransaction();
            logger.info('Data transformation completed and committed');
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
