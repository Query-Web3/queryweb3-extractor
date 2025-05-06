import { FactYieldStat } from '../../entities/FactYieldStat';
import { DimToken } from '../../entities/DimToken';
import { DimReturnType } from '../../entities/DimReturnType';
import { DimStatCycle } from '../../entities/DimStatCycle';
import { Event } from '../../entities/Event';
import { initializeDataSource } from './dataSource';
import { getTokenPriceFromOracle } from './utils';

export async function processYieldStats() {
    const dataSource = await initializeDataSource();
    const tokenRepo = dataSource.getRepository(DimToken);
    const returnTypeRepo = dataSource.getRepository(DimReturnType);
    const yieldStatRepo = dataSource.getRepository(FactYieldStat);
    const eventRepo = dataSource.getRepository(Event);
    const statCycleRepo = dataSource.getRepository(DimStatCycle);
    
    const tokens = await tokenRepo.find();
    const returnTypes = await returnTypeRepo.find();
    const dailyCycle = await statCycleRepo.findOne({ where: { name: 'Daily' } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const token of tokens) {
        for (const returnType of returnTypes) {
            // Calculate APY based on reward events
            const rewardEvents = await eventRepo.find({
                where: {
                    section: 'Rewards',
                    method: 'Reward',
                    data: { currencyId: token.address }
                }
            });

            // Calculate TVL based on transfer and deposit events
            const transferEvents = await eventRepo.find({
                where: [
                    { section: 'Tokens', method: 'Transfer', data: { currencyId: token.address } },
                    { section: 'Balances', method: 'Transfer', data: { currencyId: token.address } }
                ]
            });

            // Calculate daily rewards
            const dailyRewards = rewardEvents.reduce((sum, event) => {
                return sum + parseFloat(event.data.amount || '0');
            }, 0);

            // Calculate TVL
            const tvl = transferEvents.reduce((sum, event) => {
                return sum + parseFloat(event.data.amount || '0');
            }, 0);

            // Calculate APY (simplified: daily rewards * 365 / TVL)
            const apy = tvl > 0 ? (dailyRewards * 365 / tvl * 100) : 0;
            const tokenPrice = token.priceUsd ?? await getTokenPriceFromOracle(token.address) ?? 1.0;
            const tvlUsd = tvl * tokenPrice;

            const existingStat = await yieldStatRepo.findOne({
                where: {
                    tokenId: token.id,
                    returnTypeId: returnType.id,
                    date: today
                }
            });

            const statData = {
                tokenId: token.id,
                returnTypeId: returnType.id,
                cycleId: dailyCycle?.id,
                poolAddress: '0x0000000000000000000000000000000000000000',
                date: today,
                apy,
                tvl,
                tvlUsd
            };

            if (!existingStat) {
                await yieldStatRepo.insert(statData);
            } else {
                await yieldStatRepo.update(existingStat.id, statData);
            }
        }
    }
}
