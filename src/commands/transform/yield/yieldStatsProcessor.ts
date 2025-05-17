import { FactYieldStat } from '../../../entities/FactYieldStat';
import { DimToken } from '../../../entities/DimToken';
import { DimReturnType } from '../../../entities/DimReturnType';
import { DimStatCycle } from '../../../entities/DimStatCycle';
import { AcalaEvent } from '../../../entities/acala/AcalaEvent';
import { initializeDataSource } from '../../../commands/transform/dataSource';
import { getTokenPriceFromOracle } from '../../../commands/transform/utils';
import { getSharedApiConnection as getSharedApi, releaseSharedApiConnection as releaseSharedApi } from '../../../common/apiConnector';
import { getRedisClient } from '../../../common/redis';

async function getPoolAddressFromChain(tokenAddress: string): Promise<string> {
    const api = await getSharedApi();
    try {
        // 处理包含特殊字符的token地址
        const sanitizedAddress = tokenAddress.includes('-') 
            ? tokenAddress.replace(/-/g, '') 
            : tokenAddress;

        if (api.query.rewards?.poolAccounts) {
            const poolAccount = await api.query.rewards.poolAccounts(sanitizedAddress);
            return poolAccount.toString();
        }
        
        if (api.query.staking?.poolAccounts) {
            const poolAccount = await api.query.staking.poolAccounts(sanitizedAddress);
            return poolAccount.toString();
        }
        
        if (api.query.system?.account) {
            const accountInfo = await api.query.system.account(sanitizedAddress);
            return accountInfo.toString();
        }
        
        console.warn(`No valid pool account query method found, using token address as fallback`);
        return tokenAddress;
    } catch (error) {
        console.error(`Failed to get pool address for ${tokenAddress}:`, error);
        return tokenAddress;
    } finally {
        await releaseSharedApi(api);
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
        
        const [tokens, returnTypes, dailyCycle] = await Promise.all([
            tokenRepo.find(),
            returnTypeRepo.find(),
            statCycleRepo.findOne({ where: { name: 'Daily' } })
        ]);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rewardEvents = await eventRepo.find({
            where: { 
                section: 'Rewards', 
                method: 'Reward'
            }
        });
        const transferEvents = await eventRepo.find({
            where: [
                { section: 'Tokens', method: 'Transfer' },
                { section: 'Balances', method: 'Transfer' }
            ]
        });

        const poolAddressCache = new Map<string, string>();
        const getCachedPoolAddress = async (tokenAddress: string) => {
            if (!poolAddressCache.has(tokenAddress)) {
                poolAddressCache.set(tokenAddress, await getPoolAddressFromChain(tokenAddress));
            }
            return poolAddressCache.get(tokenAddress)!;
        };

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

            // 从Redis获取缓存价格
            const redis = await getRedisClient();
            let tokenPrice = 1.0;
            try {
                const cachedPrice = await redis.get(`token:price:${token.address}`);
                if (cachedPrice) {
                    tokenPrice = parseFloat(cachedPrice);
                } else {
                    const price = await getTokenPriceFromOracle(token.address);
                    if (price !== null && !isNaN(price)) {
                        tokenPrice = price;
                        // 缓存价格，有效期1小时
                        await redis.setex(`token:price:${token.address}`, 3600, price.toString());
                    }
                }
            } catch (e) {
                console.error(`Failed to get price for ${token.address}, using default 1.0`);
            } finally {
                await redis.quit();
            }

            const safeTvl = isNaN(tvl) || !isFinite(tvl) ? 0 : tvl;
            const safeDailyRewards = isNaN(dailyRewards) || !isFinite(dailyRewards) ? 0 : dailyRewards;
            const safeTokenPrice = isNaN(tokenPrice) || !isFinite(tokenPrice) ? 1.0 : tokenPrice;
            const safeApy = safeTvl > 0 ? (safeDailyRewards * 365 / safeTvl * 100) : 0;
            
            const tvlUsd = safeTvl * safeTokenPrice;
            const poolAddress = await getCachedPoolAddress(token.address);

            const statUpdates = returnTypes.map(returnType => ({
                token: { id: token.id },
                returnType: { id: returnType.id },
                cycle: dailyCycle,
                poolAddress,
                date: today,
                apy: safeApy,
                tvl: safeTvl,
                tvlUsd
            }));

            const upsertResult = await yieldStatRepo.upsert(statUpdates, ['token', 'returnType', 'date']);
            
            const writtenStats = await yieldStatRepo.find({
                where: {
                    token: { id: token.id },
                    date: today
                },
                relations: ['token']
            });
            
            if (writtenStats.length === 0) {
                console.error(`No stats written for token ${token.address} on ${today}`);
                try {
                    await yieldStatRepo.insert(statUpdates);
                } catch (insertError) {
                    console.error(`Failed to insert stats for token ${token.address}:`, insertError);
                }
            }
        }));

        await queryRunner.commitTransaction();
    } catch (e) {
        console.error('Failed to process yield stats:', e);
        await queryRunner.rollbackTransaction();
        throw e;
    } finally {
        await queryRunner.release();
    }
}
