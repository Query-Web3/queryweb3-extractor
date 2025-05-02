import { DataSource } from 'typeorm';
import { Block } from '../entities/Block';
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

// Mock function to get token price from oracle
async function getTokenPriceFromOracle(tokenAddress: string): Promise<number | null> {
    // In a real implementation, this would query an external price oracle
    // For now return null to fall back to default price
    return null;
}

// init datasource
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
        
        // Process blocks first to ensure we have the chain data
        const blockRepo = dataSource.getRepository(Block);
        const latestBlock = await blockRepo.findOne({ 
            order: { number: 'DESC' },
            where: { batchId: batchLog?.batchId }
        });

        if (!latestBlock) {
            throw new Error('No blocks found for this batch');
        }

        // Ensure basic dimension data exists
        const chainRepo = dataSource.getRepository(DimChain);
        let chain = await chainRepo.findOne({ where: { name: 'Acala' } });
        if (!chain) {
            chain = await chainRepo.save({
                name: 'Acala',
                chainId: 1,
                latestBlock: latestBlock.number,
                latestBlockTime: latestBlock.timestamp
            });
        } else {
            // Update latest block info
            await chainRepo.update(chain.id, {
                latestBlock: latestBlock.number,
                latestBlockTime: latestBlock.timestamp
            });
        }

        // Define the extrinsic methods to be processed
        const methodsToProcess = [
            'tokens.transfer',
            'dex.swapWithExactSupply',
            'dex.swapWithExactTarget',
            'homa.mint',
            'homa.requestRedeem'
        ];

        // Iterate through each extrinsic method
        for (const method of methodsToProcess) {
            // Query all extrinsics with the current method, grouped by parameters
            const extrinsics = await dataSource.getRepository(Extrinsic)
                .createQueryBuilder('extrinsic')
                .where('extrinsic.method = :method', { method })
                .groupBy('extrinsic.params')
                .getMany();

            // Process each extrinsic
            for (const extrinsic of extrinsics) {
                try {
                    if (method.startsWith('tokens.')) {
                        // Cast the extrinsic parameters to TokenParams type
                        const params = extrinsic.params as TokenParams;
                        if (params?.currencyId) {
                            // Upsert the token if currencyId is present
                            await upsertToken(params.currencyId);
                        }
                    } else if (method.startsWith('dex.')) {
                        // Cast the extrinsic parameters to SwapParams type
                        const params = extrinsic.params as SwapParams;
                        if (params?.path) {
                            // Upsert each token in the swap path
                            for (const currencyId of params.path) {
                                await upsertToken(currencyId);
                            }
                        }
                    } else if (method.startsWith('homa.')) {
                        // Upsert the ACA token
                        await upsertToken('ACA');
                    }
                } catch (e) {
                    // Log any errors that occur during extrinsic processing
                    console.error(`Failed to process ${method} extrinsic:`, extrinsic, e);
                }
            }
        }

        // Define the common event types to be processed
        const eventsToProcess = [
            'Tokens.Transfer',
            'Dex.Swap',
            'Homa.Minted',
            'Homa.Redeemed',
            'Rewards.Reward'
        ];

        // Iterate through each common event type
        for (const eventType of eventsToProcess) {
            // Split the event type into section and method
            const [section, method] = eventType.split('.');
            // Query all events with the current section and method, grouped by data
            const events = await dataSource.getRepository(Event)
                .createQueryBuilder('event')
                .where('event.section = :section AND event.method = :method', { section, method })
                .groupBy('event.data')
                .getMany();

            // Process each event
            for (const event of events) {
                try {
                    // Cast the event data to EventData type
                    const data = event.data as EventData;
                    if (data?.currencyId) {
                        // Upsert the token if currencyId is present
                        await upsertToken(data.currencyId);
                    }
                } catch (e) {
                    // Log any errors that occur during event processing
                    console.error(`Failed to process ${eventType} event:`, event, e);
                }
            }
        }

        // Define additional event types to be processed
        const additionalEvents = [
            'Balances.Transfer',
            'Dex.AddLiquidity',
            'Dex.RemoveLiquidity',
            'Incentives.Deposited',
            'Incentives.Withdrawn',
            'Incentives.Claimed'
        ];

        // Iterate through each additional event type
        for (const eventType of additionalEvents) {
            // Split the event type into section and method
            const [section, method] = eventType.split('.');
            // Query all events with the current section and method, grouped by data
            const events = await dataSource.getRepository(Event)
                .createQueryBuilder('event')
                .where('event.section = :section AND event.method = :method', { section, method })
                .groupBy('event.data')
                .getMany();

            // Process each event
            for (const event of events) {
                try {
                    // Cast the event data to EventData type
                    const data = event.data as EventData;
                    if (section === 'Dex' && data?.poolId) {
                        // Upsert the LP token if poolId is present
                        await upsertToken(`LP-${data.poolId}`);
                    } else if (section === 'Incentives' && data?.reward) {
                        // Upsert the reward token if reward is present
                        await upsertToken(data.reward);
                    } else {
                        // Log unprocessed events
                        console.log(`[INFO] Event ${eventType} received but not processed`, data);
                    }
                } catch (e) {
                    // Log any errors that occur during event processing
                    console.error(`Failed to process ${eventType} event:`, event, e);
                }
            }
        }

        // Initialize all dimension tables
        await initializeDimensionTables();
        
        // Process daily token statistics
        await processTokenDailyStats();
        // Process daily yield statistics
        await processYieldStats();
        
        // Log the completion of the data transformation process
        console.log('Data transformation completed');
    } catch (e) {
        // Log any errors that occur during the transformation process
        console.error('Transform failed:', e);
        // Rethrow the error to be handled by the caller
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
    const eventRepo = dataSource.getRepository(Event);
    
    const tokens = await tokenRepo.find();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastQuarter = new Date(today);
    lastQuarter.setMonth(lastQuarter.getMonth() - 3);
    const lastYear = new Date(today);
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    for (const token of tokens) {
        // Get all transfer events for this token
        const transferEvents = await eventRepo.find({
            where: [
                { section: 'Tokens', method: 'Transfer', data: { currencyId: token.address } },
                { section: 'Balances', method: 'Transfer', data: { currencyId: token.address } }
            ]
        });

        // Calculate daily volume and txns
        const dailyVolume = transferEvents.reduce((sum, event) => {
            const amount = parseFloat(event.data.amount || '0');
            return sum + amount;
        }, 0);

        const dailyTxns = transferEvents.length;

        // Get previous stats for YoY/QoQ calculations
        const prevDayStat = await statRepo.findOne({ where: { tokenId: token.id, date: yesterday } });
        const prevQuarterStat = await statRepo.findOne({ where: { tokenId: token.id, date: lastQuarter } });
        const prevYearStat = await statRepo.findOne({ where: { tokenId: token.id, date: lastYear } });

        // Calculate YoY/QoQ changes
        const volumeYoY = prevYearStat ? 
            ((dailyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
        const volumeQoQ = prevQuarterStat ? 
            ((dailyVolume - prevQuarterStat.volume) / prevQuarterStat.volume * 100) : 0;
        const txnsYoY = prevYearStat ? 
            ((dailyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;

        // Get or create today's stat
        const existingStat = await statRepo.findOne({
            where: { tokenId: token.id, date: today }
        });

        // Get token price from oracle or use default 1.0 if not available
        const tokenPrice = token.priceUsd ?? await getTokenPriceFromOracle(token.address) ?? 1.0;
        
        const statData = {
            tokenId: token.id,
            date: today,
            volume: dailyVolume,
            volumeUsd: dailyVolume * tokenPrice,
            txnsCount: dailyTxns,
            priceUsd: tokenPrice,
            volumeYoY,
            volumeQoQ,
            txnsYoY
        };

        if (!existingStat) {
            await statRepo.insert(statData);
        } else {
            await statRepo.update(existingStat.id, statData);
        }
    }
}
