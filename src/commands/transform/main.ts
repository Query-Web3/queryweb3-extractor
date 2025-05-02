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
        const dataSource = await initializeDataSource();
        
        // Process blocks first to ensure we have the chain data
        const blockRepo = dataSource.getRepository(Block);
        const latestBlock = await blockRepo.findOne({ 
            order: { number: 'DESC' },
            where: { batchId: batchLog?.batchId }
        });

        if (!latestBlock) {
            throw new Error('No blocks found for this batch');
        }

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
        const eventsToProcess = [
            'Tokens.Transfer',
            'Dex.Swap',
            'Homa.Minted',
            'Homa.Redeemed',
            'Rewards.Reward'
        ];

        for (const eventType of eventsToProcess) {
            const [section, method] = eventType.split('.');
            const events = await dataSource.getRepository(Event)
                .createQueryBuilder('event')
                .where('event.section = :section AND event.method = :method', { section, method })
                .groupBy('event.data')
                .getMany();

            for (const event of events) {
                try {
                    const data = event.data as any;
                    if (data?.currencyId) {
                        await upsertToken(data.currencyId);
                    }
                } catch (e) {
                    console.error(`Failed to process ${eventType} event:`, event, e);
                }
            }
        }

        // Initialize dimension tables
        await initializeDimensionTables();
        
        // Process statistics
        await processTokenDailyStats();
        await processYieldStats();
        
        console.log('Data transformation completed');
    } catch (e) {
        console.error('Transform failed:', e);
        throw e;
    }
}
