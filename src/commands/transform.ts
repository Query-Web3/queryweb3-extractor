import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TokenParams {
    currencyId?: string;
    dest?: string;
    amount?: string;
}

interface SwapParams {
    path?: string[];
    amountIn?: string;
    amountOutMin?: string;
    to?: string;
    deadline?: string;
}

interface EventData {
    who?: string;
    amount?: string;
    currencyId?: string;
    poolId?: string;
    reward?: string;
}

/**
 * Transforms data extracted from the Acala network and populates dimension (DIM) tables.
 * Handles various extrinsic methods and events to populate dimension tables.
 */
export async function transformData() {
    // Log the start of the data transformation process
    console.log('Starting data transformation from Acala to DIM tables...');
    
    try {
        // Ensure basic dimension data (chain information) exists.
        // If the record doesn't exist, create it; otherwise, leave it unchanged.
        await (prisma as any).dimChain.upsert({
            // Query condition to find the record by chain name
            where: { name: 'Acala' },
            // If the record exists, perform no update operations
            update: {},
            // If the record doesn't exist, create a new chain information record
            create: {
                name: 'Acala',
                chainId: 1
            }
        });

        // Process common extrinsic methods
        const methodsToProcess = [
            'tokens.transfer',
            'dex.swapWithExactSupply',
            'dex.swapWithExactTarget',
            'homa.mint',
            'homa.requestRedeem'
        ];

        for (const method of methodsToProcess) {
            const extrinsics = await prisma.extrinsic.findMany({
                where: { method },
                distinct: ['params']
            });

            for (const extrinsic of extrinsics) {
                try {
                    if (method.startsWith('tokens.')) {
                        const params = extrinsic.params as TokenParams;
                        if (params?.currencyId) {
                            await upsertToken(params.currencyId);
                        }
                    } else if (method.startsWith('dex.')) {
                        const params = extrinsic.params as SwapParams;
                        if (params?.path) {
                            for (const currencyId of params.path) {
                                await upsertToken(currencyId);
                            }
                        }
                    } else if (method.startsWith('homa.')) {
                        // Homa methods use ACA token
                        await upsertToken('ACA');
                    }
                } catch (e) {
                    console.error(`Failed to process ${method} extrinsic:`, extrinsic, e);
                }
            }
        }

        // Process common event types
        const eventsToProcess = [
            'Tokens.Transfer',
            'Dex.Swap',
            'Homa.Minted',
            'Homa.Redeemed',
            'Rewards.Reward'
        ];

        for (const eventType of eventsToProcess) {
            const [section, method] = eventType.split('.');
            const events = await prisma.event.findMany({
                where: { section, method },
                distinct: ['data']
            });

            for (const event of events) {
                try {
                    const data = event.data as EventData;
                    if (data?.currencyId) {
                        await upsertToken(data.currencyId);
                    }
                } catch (e) {
                    console.error(`Failed to process ${eventType} event:`, event, e);
                }
            }
        }

        // Process additional event types
        const additionalEvents = [
            'Balances.Transfer',
            'Dex.AddLiquidity',
            'Dex.RemoveLiquidity',
            'Incentives.Deposited',
            'Incentives.Withdrawn',
            'Incentives.Claimed'
        ];

        for (const eventType of additionalEvents) {
            const [section, method] = eventType.split('.');
            const events = await prisma.event.findMany({
                where: { section, method },
                distinct: ['data']
            });

            for (const event of events) {
                try {
                    const data = event.data as EventData;
                    // Handle LP tokens from DEX events
                    if (section === 'Dex' && data?.poolId) {
                        await upsertToken(`LP-${data.poolId}`);
                    }
                    // Handle reward tokens from Incentives events
                    else if (section === 'Incentives' && data?.reward) {
                        await upsertToken(data.reward);
                    }
                    // Default handler for other events
                    else {
                        console.log(`[INFO] Event ${eventType} received but not processed`, data);
                    }
                } catch (e) {
                    console.error(`Failed to process ${eventType} event:`, event, e);
                }
            }
        }

        // Log completion
        console.log('Data transformation completed');
    } catch (e) {
        // Log an error message if the entire data transformation process fails.
        // Include the error information in the log.
        console.error('Transform failed:', e);
        // Rethrow the error so that the calling function can handle it
        throw e;
    }
}

async function upsertToken(currencyId: string) {
    await (prisma as any).dimToken.upsert({
        where: {
            chainId_address: {
                chainId: 1,
                address: currencyId
            }
        },
        update: {},
        create: {
            chainId: 1,
            address: currencyId,
            symbol: currencyId.toUpperCase(),
            name: currencyId,
            decimals: 18,
            assetTypeId: 1
        }
    });
}