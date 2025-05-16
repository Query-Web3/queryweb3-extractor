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
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return data?.currencyId === token.address;
            });
            const tokenTransfers = transferEvents.filter(e => {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return data?.currencyId === token.address;
            });

            const dailyRewards = tokenRewards.reduce((sum, e) => {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return sum + parseFloat(data?.amount || '0');
            }, 0);
            const tvl = tokenTransfers.reduce((sum, e) => {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                return sum + parseFloat(data?.amount || '0');
            }, 0);

            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;
            const tvlUsd = tvl * tokenPrice;
            const apy = tvl > 0 ? (dailyRewards * 365 / tvl * 100) : 0;
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

            // Bulk upsert stats
            await yieldStatRepo.upsert(statUpdates, ['tokenId', 'returnTypeId', 'date']);
        }));

        await queryRunner.commitTransaction();
    } catch (e) {
        await queryRunner.rollbackTransaction();
        throw e;
    } finally {
        await queryRunner.release();
    }
}
