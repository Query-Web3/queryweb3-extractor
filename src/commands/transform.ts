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
        // Ensure basic dimension data exists
        //await initDimensionTables();
        
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

        // -------------------- Token Data Transformation --------------------
        // Transform token data by querying the extrinsic table.
        // Find all records where the method is 'tokens.transfer' and deduplicate results based on the 'params' field.
        const tokens = await prisma.extrinsic.findMany({
            where: {
                // Filter records with the method 'tokens.transfer'
                method: 'tokens.transfer'
            },
            // Deduplicate records by the 'params' field
            distinct: ['params']
        });

        // Iterate through each token-related record retrieved from the database
        for (const token of tokens) {
            try {
                // Cast the 'params' field of the current token record to the TokenParams type
                const params = token.params as TokenParams;
                // Check if the 'currencyId' field exists in the 'params' object
                if (params?.currencyId) {
                    // Ensure that the corresponding token dimension data exists in the 'dimToken' table.
                    // If the record doesn't exist, create a new one; otherwise, leave it unchanged.
                    await (prisma as any).dimToken.upsert({
                        // Query condition to find the record by chain ID and token address
                        where: {
                            chainId_address: {
                                chainId: 1,
                                address: params.currencyId
                            }
                        },
                        // If the record exists, perform no update operations
                        update: {},
                        // If the record doesn't exist, create a new token information record
                        create: {
                            chainId: 1,
                            address: params.currencyId,
                            // Token symbol, convert 'currencyId' to uppercase
                            symbol: params.currencyId.toUpperCase(),
                            // Token name, use 'currencyId' directly
                            name: params.currencyId,
                            // Token decimals, set the default value to 18
                            decimals: 18,
                            // Asset type ID, set the default value to 1
                            assetTypeId: 1
                        }
                    });
                }
            } catch (e) {
                // Log the failure to process a token record, including the failed record and error information
                console.error('Failed to process token:', token, e);
            }
        }

        // Log the completion of the data transformation process
        console.log('Data transformation completed');
    } catch (e) {
        // Log the failure of the data transformation, including error information
        console.error('Transform failed:', e);
        // Rethrow the error for the upper caller to handle
        throw e;
    }
}

async function initDimensionTables() {
    // Initialize asset types
    await (prisma as any).dimAssetType.upsert({
        where: { name: 'Native' },
        update: {},
        create: { name: 'Native' }
    });
    await (prisma as any).dimAssetType.upsert({
        where: { name: 'Stablecoin' },
        update: {},
        create: { name: 'Stablecoin' }
    });
    await (prisma as any).dimAssetType.upsert({
        where: { name: 'LP Token' },
        update: {},
        create: { name: 'LP Token' }
    });

    // Initialize return types
    await (prisma as any).dimReturnType.upsert({
        where: { name: 'Staking' },
        update: {},
        create: { name: 'Staking' }
    });
    await (prisma as any).dimReturnType.upsert({
        where: { name: 'Lending' },
        update: {},
        create: { name: 'Lending' }
    });
    await (prisma as any).dimReturnType.upsert({
        where: { name: 'DEX Yield' },
        update: {},
        create: { name: 'DEX Yield' }
    });

    // Initialize stat cycles
    await (prisma as any).dimStatCycle.upsert({
        where: { name: 'Daily' },
        update: {},
        create: { name: 'Daily', days: 1 }
    });
    await (prisma as any).dimStatCycle.upsert({
        where: { name: 'Weekly' },
        update: {},
        create: { name: 'Weekly', days: 7 }
    });
    await (prisma as any).dimStatCycle.upsert({
        where: { name: 'Monthly' },
        update: {},
        create: { name: 'Monthly', days: 30 }
    });
}

async function upsertToken(currencyId: string) {
    // Get or create default asset type
    const assetType = await (prisma as any).dimAssetType.findFirst({
        where: { name: currencyId.startsWith('LP-') ? 'LP Token' : 'Native' }
    });

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
            assetTypeId: assetType.id
        }
    });
}