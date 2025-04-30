import { DataSource } from 'typeorm';
import { BatchLog, BatchStatus, BatchType } from '../entities/BatchLog';
import { transformDataSource } from '../datasources/transformDataSource';
import { DimChain } from '../entities/DimChain';
import { DimAssetType } from '../entities/DimAssetType';
import { DimReturnType } from '../entities/DimReturnType';
import { DimToken } from '../entities/DimToken';
import { Extrinsic } from '../entities/Extrinsic';
import { Event } from '../entities/Event';
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

async function upsertToken(currencyId: any) {
    const dataSource = await initializeDataSource();
    const assetTypeRepo = dataSource.getRepository(DimAssetType);
    const tokenRepo = dataSource.getRepository(DimToken);
    
    const currencyIdStr = String(currencyId);
    let assetType = await assetTypeRepo.findOne({ 
        where: { name: currencyIdStr.startsWith('LP-') ? 'LP Token' : 'Native' }
    });

    if (!assetType) {
        assetType = await assetTypeRepo.save({
            name: currencyIdStr.startsWith('LP-') ? 'LP Token' : 'Native',
            description: currencyIdStr.startsWith('LP-') ? 'Liquidity Pool Token' : 'Native Token'
        });
    }

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
            symbol: currencyIdStr.toUpperCase(),
            name: currencyIdStr,
            decimals: 18,
            assetTypeId: assetType!.id
        });
    }
    
    return token;
}
