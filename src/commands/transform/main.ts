import { BatchLog, BatchStatus } from '../../entities/BatchLog';
import { Block } from '../../entities/Block';
import { Extrinsic } from '../../entities/Extrinsic';
import { Event } from '../../entities/Event';
import { initializeDataSource } from './dataSource';
import { upsertToken, initializeDimensionTables } from './tokenProcessor';
import { processTokenDailyStats, processYieldStats } from './statProcessor';
import { v4 as uuidv4 } from 'uuid';

/**
 * Transforms data extracted from the Acala network and populates dimension (DIM) tables.
 * Handles various extrinsic methods and events to populate dimension tables.
 */
export async function transformData(batchLog?: BatchLog) {
    console.log('Starting data transformation from Acala to DIM tables...');
    
    try {
        console.log('Initializing data source...');
        const dataSource = await initializeDataSource();
        console.log('Data source initialized successfully');
        
        // Verify database connection
        if (!dataSource.isInitialized) {
            console.log('Initializing database connection...');
            await dataSource.initialize();
        }
        console.log('Database connection established');

        // Start a transaction to ensure data consistency
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
        
        // Process blocks first to ensure we have the chain data
        const blockRepo = dataSource.getRepository(Block);
        console.log('Querying latest block...');
        const latestBlock = await blockRepo.findOne({ 
            where: {},
            order: { number: 'DESC' }
        });
        
        if (!latestBlock) {
            throw new Error('No blocks found in acala_block table');
        }
        
        console.log(`Processing latest block #${latestBlock.number} (batchId: ${latestBlock.batchId})`);

        // Define the extrinsic methods to be processed
        const methodsToProcess = [
            'tokens.transfer',
            'dex.swapWithExactSupply',
            'dex.swapWithExactTarget',
            'homa.mint',
            'homa.requestRedeem'
        ];

        // Process each extrinsic method
        for (const method of methodsToProcess) {
            const extrinsics = await dataSource.getRepository(Extrinsic)
                .createQueryBuilder('extrinsic')
                .where('extrinsic.method = :method', { method })
                .groupBy('extrinsic.params')
                .getMany();

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
                    console.error(`Failed to process ${method} extrinsic:`, extrinsic, e);
                }
            }
        }

        // Process events
        // More flexible event matching with case-insensitive search
        const eventPatterns = [
            { section: 'tokens', method: 'transfer' },
            { section: 'dex', method: 'swap' },
            { section: 'homa', method: 'minted' },
            { section: 'homa', method: 'redeemed' },
            { section: 'rewards', method: 'reward' }
        ];

        for (const pattern of eventPatterns) {
            console.log(`Querying events matching ${pattern.section}.${pattern.method}...`);
            const events = await dataSource.getRepository(Event)
                .createQueryBuilder('event')
                .where('LOWER(event.section) = LOWER(:section) AND LOWER(event.method) = LOWER(:method)', {
                    section: pattern.section,
                    method: pattern.method
                })
                .groupBy('event.data')
                .getMany();
            console.log(`Found ${events.length} events matching ${pattern.section}.${pattern.method}`);

            for (const event of events) {
                try {
                    const data = event.data as any;
                    if (data?.currencyId) {
                        await upsertToken(data.currencyId);
                    }
                } catch (e) {
                    console.error(`Failed to process ${pattern.section}.${pattern.method} event:`, event, e);
                }
            }
        }

        // Initialize dimension tables
        await initializeDimensionTables();
        
        // Process statistics
        await processTokenDailyStats();
            await processYieldStats();
            
            // Commit transaction
            await queryRunner.commitTransaction();
            console.log('Data transformation completed and committed');
        } catch (e) {
            // Rollback transaction on error
            await queryRunner.rollbackTransaction();
            console.error('Transaction rolled back due to error:', e);
            throw e;
        } finally {
            // Release query runner
            await queryRunner.release();
        }
    } catch (e) {
        console.error('Transform failed:', e);
        
        // Log full error details for debugging
        if (e instanceof Error) {
            console.error('Error stack:', e.stack);
        } else {
            console.error('Full error object:', JSON.stringify(e, null, 2));
        }
        
        throw e;
    }
}
