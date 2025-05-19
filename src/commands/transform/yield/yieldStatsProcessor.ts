import { FactYieldStat } from '../../../entities/FactYieldStat';
import { DimToken } from '../../../entities/DimToken';
import { DimReturnType } from '../../../entities/DimReturnType';
import { DimStatCycle } from '../../../entities/DimStatCycle';
import { AcalaEvent } from '../../../entities/acala/AcalaEvent';
import { initializeDataSource } from '../../../commands/transform/dataSource';
import { getTokenPriceFromOracle } from '../../../commands/transform/utils';
import { Logger, LogLevel } from '../../../utils/logger';
import { getSharedApiConnection as getSharedApi, releaseSharedApiConnection as releaseSharedApi } from '../../../common/apiConnector';
import { getRedisClient } from '../../../common/redis';

async function getPoolAddressFromChain(tokenAddress: string): Promise<string> {
    const logger = Logger.getInstance();
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
        
        logger.warn(`No valid pool account query method found, using token address as fallback`);
        return tokenAddress;
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Failed to get pool address for ${tokenAddress}:`, err);
        return tokenAddress;
    } finally {
        await releaseSharedApi(api);
    }
}

export async function processYieldStats() {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const dataSource = await initializeDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        logger.info('Starting yield stats processing transaction');
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
        
        // Get ACA price once for all tokens
        let acaPrice = 1.0;
        try {
            const price = await getTokenPriceFromOracle('ACA');
            if (price !== null && !isNaN(price)) {
                acaPrice = price;
            }
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            Logger.getInstance().error('Failed to get ACA price, using default 1.0', err);
        }
        today.setHours(0, 0, 0, 0);

        logger.debug('Querying reward and transfer events');
        const [rewardEvents, transferEvents] = await Promise.all([
            eventRepo.find({
                where: { 
                    section: 'Rewards', 
                    method: 'Reward'
                }
            }),
            eventRepo.find({
                where: [
                    { section: 'Tokens', method: 'Transfer' },
                    { section: 'Balances', method: 'Transfer' }
                ]
            })
        ]);
        
        logger.debug(`Found ${rewardEvents.length} reward events and ${transferEvents.length} transfer events`);
        if (rewardEvents.length > 0) {
            logger.debug('Sample reward event:', {
                id: rewardEvents[0].id,
                data: rewardEvents[0].data
            });
        }

        const poolAddressCache = new Map<string, string>();
        const getCachedPoolAddress = async (tokenAddress: string) => {
            if (!poolAddressCache.has(tokenAddress)) {
                poolAddressCache.set(tokenAddress, await getPoolAddressFromChain(tokenAddress));
            }
            return poolAddressCache.get(tokenAddress)!;
        };

        await Promise.all(tokens.map(async token => {
            logger.debug(`Processing token ${token.address} (${token.symbol})`);
            
            const tokenRewards = rewardEvents.filter(e => {
                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    const matches = data?.currencyId === token.address;
                    if (matches) {
                        logger.debug('Matching reward event:', {
                            eventId: e.id,
                            data: data
                        });
                    }
                    return matches;
                } catch (e: unknown) {
                    const err = e instanceof Error ? e : new Error(String(e));
                    logger.error(`Failed to parse reward event data for token ${token.address}:`, err);
                    return false;
                }
            });

            const tokenTransfers = transferEvents.filter(e => {
                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    const matches = data?.currencyId === token.address;
                    if (matches) {
                        logger.debug('Matching transfer event:', {
                            eventId: e.id,
                            data: data
                        });
                    }
                    return matches;
                } catch (e: unknown) {
                    const err = e instanceof Error ? e : new Error(String(e));
                    logger.error(`Failed to parse transfer event data for token ${token.address}:`, err);
                    return false;
                }
            });

            logger.debug(`Found ${tokenRewards.length} rewards and ${tokenTransfers.length} transfers for token ${token.address}`);

            const dailyRewards = tokenRewards.reduce((sum, e) => {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return sum + parseFloat(data?.amount || '0');
            }, 0);

            const tvl = tokenTransfers.reduce((sum, e) => {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return sum + parseFloat(data?.amount || '0');
            }, 0);

            const safeTvl = isNaN(tvl) || !isFinite(tvl) || tvl <= 0 ? 0 : tvl;
            const safeDailyRewards = isNaN(dailyRewards) || !isFinite(dailyRewards) ? 0 : dailyRewards;
            const safeTokenPrice = acaPrice; // Use the pre-fetched ACA price
            const safeApy = safeTvl > 0 ? (safeDailyRewards * 365 / safeTvl * 100) : 0;
            
            if (safeTvl === 0) {
                logger.warn(`TVL is zero for token ${token.address}, skipping APY calculation`);
                return; // Skip this token
            }
            
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

            logger.debug('Preparing to upsert yield stats:', {
                token: token.address,
                statCount: statUpdates.length,
                sampleStat: statUpdates[0]
            });

            const upsertResult = await yieldStatRepo.upsert(statUpdates, ['token', 'returnType', 'date']);
            logger.debug('Upsert result:', {
                affected: upsertResult.raw?.affectedRows,
                identifiers: upsertResult.identifiers
            });
            
            const writtenStats = await yieldStatRepo.find({
                where: {
                    token: { id: token.id },
                    date: today
                },
                relations: ['token']
            });
            
            if (writtenStats.length === 0) {
                logger.error(`No stats written for token ${token.address} on ${today}`);
                try {
                    await yieldStatRepo.insert(statUpdates);
                    logger.info(`Successfully inserted stats for token ${token.address} after upsert failed`);
                } catch (insertError: unknown) {
                    const err = insertError instanceof Error ? insertError : new Error(String(insertError));
                    logger.error(`Failed to insert stats for token ${token.address}:`, err);
                }
            }
        }));

        await queryRunner.commitTransaction();
        logger.info('Successfully committed yield stats transaction');
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error('Failed to process yield stats:', err);
        await queryRunner.rollbackTransaction();
        throw e;
    } finally {
        await queryRunner.release();
    }
}
