import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus, BatchType } from '../entities/BatchLog';
import { transformDataSource } from '../datasources/transformDataSource';
import { DimChain } from '../entities/DimChain';
import { DimAssetType } from '../entities/DimAssetType';
import { DimReturnType } from '../entities/DimReturnType';
import { DimToken } from '../entities/DimToken';
import { Extrinsic } from '../entities/Extrinsic';
import { Event } from '../entities/Event';
import { FactTokenDailyStat } from '../entities/FactTokenDailyStat';
import { FactYieldStat } from '../entities/FactYieldStat';
import { v4 as uuidv4 } from 'uuid';

// 初始化数据源
let dataSource: DataSource;

async function initializeDataSource() {
  if (!dataSource?.isInitialized) {
    dataSource = transformDataSource;
    await dataSource.initialize();
  }
  return dataSource;
}

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
export async function transformData(batchLog?: BatchLog) {
    console.log('Starting data transformation from Acala to DIM tables...');
    
    try {
        const dataSource = await initializeDataSource();
        
        // Ensure basic dimension data exists
        const chainRepo = dataSource.getRepository(DimChain);
        let chain = await chainRepo.findOne({ where: { name: 'Acala' } });
        if (!chain) {
            chain = await chainRepo.save({
                name: 'Acala',
                chainId: 1
            });
        }

        // Process common extrinsic methods
        const methodsToProcess = [
            'tokens.transfer',
            'dex.swapWithExactSupply',
            'dex.swapWithExactTarget',
            'homa.mint',
            'homa.requestRedeem'
        ];

        for (const method of methodsToProcess) {
            const extrinsics = await dataSource.getRepository(Extrinsic)
                .createQueryBuilder('extrinsic')
                .where('extrinsic.method = :method', { method })
                .groupBy('extrinsic.params')
                .getMany();

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
            const events = await dataSource.getRepository(Event)
                .createQueryBuilder('event')
                .where('event.section = :section AND event.method = :method', { section, method })
                .groupBy('event.data')
                .getMany();

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
            const events = await dataSource.getRepository(Event)
                .createQueryBuilder('event')
                .where('event.section = :section AND event.method = :method', { section, method })
                .groupBy('event.data')
                .getMany();

            for (const event of events) {
                try {
                    const data = event.data as EventData;
                    if (section === 'Dex' && data?.poolId) {
                        await upsertToken(`LP-${data.poolId}`);
                    } else if (section === 'Incentives' && data?.reward) {
                        await upsertToken(data.reward);
                    } else {
                        console.log(`[INFO] Event ${eventType} received but not processed`, data);
                    }
                } catch (e) {
                    console.error(`Failed to process ${eventType} event:`, event, e);
                }
            }
        }

        // Initialize all dimension tables
        await initializeDimensionTables();
        
        // Process daily stats
        await processTokenDailyStats();
        await processYieldStats();
        
        console.log('Data transformation completed');
    } catch (e) {
        console.error('Transform failed:', e);
        throw e;
    }
}

const TRANSFORM_INTERVAL_MS = process.env.TRANSFORM_INTERVAL_MS ? Number(process.env.TRANSFORM_INTERVAL_MS) : 3600000;

export async function runTransform() {
    while (true) {
        let batchLog;
        try {
            batchLog = await (await initializeDataSource()).getRepository(BatchLog).save({
                batchId: uuidv4(),
                status: BatchStatus.RUNNING,
                type: BatchType.TRANSFORM
            });
            
            await transformData(batchLog);
        } catch (e) {
            console.error(e);
            
            if (batchLog?.id) {
                const repo = (await initializeDataSource()).getRepository(BatchLog);
                await repo.update(batchLog.id, {
                    endTime: new Date(),
                    status: BatchStatus.FAILED,
                    retryCount: (batchLog.retryCount || 0) + 1
                });
            }
        }
        console.log(`Wait for <${TRANSFORM_INTERVAL_MS / 3600000}> hours to run next batch...`);
        await new Promise(resolve => setTimeout(resolve, TRANSFORM_INTERVAL_MS));
    }
}

async function initializeDimensionTables() {
    const dataSource = await initializeDataSource();
    
    // Initialize chain
    const chainRepo = dataSource.getRepository(DimChain);
    let chain = await chainRepo.findOne({ where: { name: 'Acala' } });
    if (!chain) {
        chain = await chainRepo.save({
            name: 'Acala',
            chainId: 1
        });
    }

    // Initialize asset types
    const assetTypeRepo = dataSource.getRepository(DimAssetType);
    const assetTypes = [
        { name: 'Native', description: 'Native token of the chain' },
        { name: 'LP Token', description: 'Liquidity pool token' },
        { name: 'Stablecoin', description: 'Stable value cryptocurrency' },
        { name: 'Governance', description: 'Governance token' }
    ];
    
    for (const type of assetTypes) {
        let existing = await assetTypeRepo.findOne({ where: { name: type.name } });
        if (!existing) {
            await assetTypeRepo.save(type);
        }
    }

    // Initialize return types
    const returnTypeRepo = dataSource.getRepository(DimReturnType);
    const returnTypes = [
        { name: 'Staking', description: 'Staking rewards' },
        { name: 'Liquidity Mining', description: 'Liquidity mining rewards' },
        { name: 'Lending', description: 'Lending interest' }
    ];
    
    for (const type of returnTypes) {
        let existing = await returnTypeRepo.findOne({ where: { name: type.name } });
        if (!existing) {
            await returnTypeRepo.save(type);
        }
    }
}

async function upsertToken(currencyId: any) {
    const dataSource = await initializeDataSource();
    const assetTypeRepo = dataSource.getRepository(DimAssetType);
    const tokenRepo = dataSource.getRepository(DimToken);
    
    // Handle object input by extracting relevant fields or stringifying
    let currencyIdStr: string;
    let symbol: string;
    let name: string;
    
    if (typeof currencyId === 'object' && currencyId !== null) {
        // If currencyId is an object, try to extract address/symbol/name
        currencyIdStr = currencyId.address || currencyId.id || JSON.stringify(currencyId);
        symbol = currencyId.symbol || currencyIdStr.slice(0, 20);
        name = currencyId.name || currencyIdStr.slice(0, 100);
    } else {
        // For non-object input, convert to string
        currencyIdStr = String(currencyId);
        symbol = currencyIdStr;
        name = currencyIdStr;
    }
    
    // Determine token type and metadata
    let assetTypeName = 'Native';
    let decimals = 12; // Default for most Substrate chains
    
    if (currencyIdStr.startsWith('LP-')) {
        assetTypeName = 'LP Token';
        symbol = 'LP-' + currencyIdStr.split('-')[1].slice(0, 15); // Limit to 15 chars
        name = 'Liquidity Pool ' + currencyIdStr.split('-')[1];
    } else if (currencyIdStr === 'AUSD') {
        assetTypeName = 'Stablecoin';
        symbol = 'AUSD';
        name = 'Acala Dollar';
        decimals = 12;
    } else if (currencyIdStr === 'ACA') {
        symbol = 'ACA';
        name = 'Acala';
        decimals = 12;
    }

    // Get or create asset type
    let assetType = await assetTypeRepo.findOne({ where: { name: assetTypeName } });
    if (!assetType) {
        assetType = await assetTypeRepo.save({
            name: assetTypeName,
            description: assetTypeName === 'LP Token' ? 'Liquidity Pool Token' : 'Native Token'
        });
    }

    // Get or create token
    let token = await tokenRepo.findOne({ 
        where: { 
            chain: { id: 1 },
            address: currencyIdStr
        },
        relations: ['chain']
    });
    
    if (!token) {
        token = await tokenRepo.save({
            chainId: 1,
            address: currencyIdStr,
            symbol: symbol.slice(0, 20), // Ensure within max length
            name: name.slice(0, 100),    // Ensure within max length
            decimals: decimals,
            assetTypeId: assetType!.id
        });
    }
    
    return token;
}

async function processYieldStats() {
    const dataSource = await initializeDataSource();
    const tokenRepo = dataSource.getRepository(DimToken);
    const returnTypeRepo = dataSource.getRepository(DimReturnType);
    const yieldStatRepo = dataSource.getRepository(FactYieldStat);
    
    const tokens = await tokenRepo.find();
    const returnTypes = await returnTypeRepo.find();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const token of tokens) {
        for (const returnType of returnTypes) {
            const existingStat = await yieldStatRepo.findOne({
                where: {
                    tokenId: token.id,
                    poolAddress: '0x0000000000000000000000000000000000000000',
                    date: today
                }
            });

            if (!existingStat) {
                await yieldStatRepo.insert({
                    tokenId: token.id,
                    returnTypeId: returnType.id,
                    poolAddress: '0x0000000000000000000000000000000000000000',
                    date: today,
                    apy: 5.0, // Placeholder
                    tvl: 1000000.0,
                    tvlUsd: 1000000.0
                });
            } else {
                await yieldStatRepo.update(existingStat.id, {
                    returnTypeId: returnType.id,
                    apy: 5.0,
                    tvl: 1000000.0,
                    tvlUsd: 1000000.0
                });
            }
        }
    }
}

async function processTokenDailyStats() {
    const dataSource = await initializeDataSource();
    const tokenRepo = dataSource.getRepository(DimToken);
    const statRepo = dataSource.getRepository(FactTokenDailyStat);
    
    const tokens = await tokenRepo.find();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const token of tokens) {
        // Calculate daily stats from events
        // This is simplified - actual implementation would aggregate from event data
        const existingStat = await statRepo.findOne({
            where: {
                tokenId: token.id,
                date: today
            }
        });

        if (!existingStat) {
            await statRepo.insert({
                tokenId: token.id,
                date: today,
                volume: 1000.0, // Placeholder - should calculate from events
                volumeUsd: 1000.0,
                txnsCount: 10,
                priceUsd: 1.0
            });
        }
    }
}
