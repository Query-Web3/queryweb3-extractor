import { FactYieldStat } from '../../../entities/FactYieldStat';
import { DimToken } from '../../../entities/DimToken';
import { DimReturnType } from '../../../entities/DimReturnType';
import { DimStatCycle } from '../../../entities/DimStatCycle';
import { AcalaEvent } from '../../../entities/acala/AcalaEvent';
import { initializeDataSource } from '../dataSource';
import { getTokenPriceFromOracle } from '../utils';
import { createApi, disconnectApi } from '../../common/apiConnector';

async function getPoolAddressFromChain(tokenAddress: string): Promise<string> {
    const api = await createApi();
    try {
        // 查询Rewards模块的poolAccounts获取poolAddress
        const poolAccount = await api.query.rewards.poolAccounts(tokenAddress);
        return poolAccount.toString();
    } finally {
        await disconnectApi(api);
    }
}

export async function processYieldStats() {
    const dataSource = await initializeDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        console.log('Starting yield stats processing transaction');
        const tokenRepo = queryRunner.manager.getRepository(DimToken);
        const returnTypeRepo = queryRunner.manager.getRepository(DimReturnType);
        const yieldStatRepo = queryRunner.manager.getRepository(FactYieldStat);
        const eventRepo = queryRunner.manager.getRepository(AcalaEvent);
        const statCycleRepo = queryRunner.manager.getRepository(DimStatCycle);
        
        // Preload all necessary data
        const [tokens, returnTypes, dailyCycle] = await Promise.all([
            tokenRepo.find(),
            returnTypeRepo.find(),
            statCycleRepo.findOne({ where: { name: 'Daily' } })
        ]);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Batch fetch all reward and transfer events
        const rewardEvents = await eventRepo.find({
            where: { 
                section: 'Rewards', 
                method: 'Reward',
                //data: { currencyId: () => `JSON_EXTRACT(data, '$.currencyId')` }
            }
        });
        const transferEvents = await eventRepo.find({
            where: [
                { 
                    section: 'Tokens', 
                    method: 'Transfer',
                    //data: { currencyId: () => `JSON_EXTRACT(data, '$.currencyId')` }
                },
                { 
                    section: 'Balances', 
                    method: 'Transfer',
                    //data: { currencyId: () => `JSON_EXTRACT(data, '$.currencyId')` }
                }
            ]
        });

        // Cache pool addresses to avoid repeated chain queries
        const poolAddressCache = new Map<string, string>();
        const getCachedPoolAddress = async (tokenAddress: string) => {
            if (!poolAddressCache.has(tokenAddress)) {
                poolAddressCache.set(tokenAddress, await getPoolAddressFromChain(tokenAddress));
            }
            return poolAddressCache.get(tokenAddress)!;
        };

        // Process tokens in parallel
        await Promise.all(tokens.map(async token => {
            const tokenRewards = rewardEvents.filter(e => {
                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    return data?.currencyId === token.address;
                } catch (e) {
                    console.error(`Failed to parse reward event data for token ${token.address}:`, e);
                    return false;
                }
            });
            const tokenTransfers = transferEvents.filter(e => {
                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    return data?.currencyId === token.address;
                } catch (e) {
                    console.error(`Failed to parse transfer event data for token ${token.address}:`, e);
                    return false;
                }
            });

            const dailyRewards = tokenRewards.reduce((sum, e) => {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return sum + parseFloat(data?.amount || '0');
            }, 0);
            const tvl = tokenTransfers.reduce((sum, e) => {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return sum + parseFloat(data?.amount || '0');
            }, 0);

            let tokenPrice = 1.0;
            try {
                const price = await getTokenPriceFromOracle(token.address);
                if (price !== null && !isNaN(price)) {
                    tokenPrice = price;
                }
            } catch (e) {
                console.error(`Failed to get price for ${token.address}, using default 1.0`);
            }

            const safeTvl = isNaN(tvl) ? 0 : tvl;
            const safeDailyRewards = isNaN(dailyRewards) ? 0 : dailyRewards;
            const safeTokenPrice = isNaN(tokenPrice) ? 1.0 : tokenPrice;
            
            const tvlUsd = safeTvl * safeTokenPrice;
            const apy = safeTvl > 0 ? (safeDailyRewards * 365 / safeTvl * 100) : 0;
            const poolAddress = await getCachedPoolAddress(token.address);

            // Batch process return types
            const statUpdates = returnTypes.map(returnType => ({
                tokenId: token.id,
                returnTypeId: returnType.id,
                cycleId: dailyCycle?.id,
                poolAddress,
                date: today,
                apy,
                tvl,
                tvlUsd
            }));

            // Log stat updates before upsert
            console.log(`Preparing to upsert stats for token ${token.address}:`, {
                statUpdates: JSON.stringify(statUpdates, null, 2),
                conflictColumns: ['tokenId', 'returnTypeId', 'date']
            });

            // Bulk upsert stats
            const upsertResult = await yieldStatRepo.upsert(statUpdates, ['tokenId', 'returnTypeId', 'date']);
            console.log(`Upsert result for token ${token.address}:`, upsertResult);
            
            // Verify data was written
            const writtenStats = await yieldStatRepo.find({
                where: {
                    tokenId: token.id,
                    date: today
                }
            });
            
            if (writtenStats.length === 0) {
                console.error(`No stats written for token ${token.address} on ${today}`);
                // Try direct insert if upsert failed
                try {
                    await yieldStatRepo.insert(statUpdates);
                    console.log(`Successfully inserted stats for token ${token.address}`);
                } catch (insertError) {
                    console.error(`Failed to insert stats for token ${token.address}:`, insertError);
                }
            } else {
                console.log(`Successfully wrote ${writtenStats.length} stats for token ${token.address}`);
                console.log('Sample written stat:', writtenStats[0]);
            }
        }));

        await queryRunner.commitTransaction();
        console.log('Successfully committed yield stats transaction');
    } catch (e) {
        console.error('Failed to process yield stats:', e);
        await queryRunner.rollbackTransaction();
        console.log('Rolled back yield stats transaction');
        throw e;
    } finally {
        await queryRunner.release();
    }
}
