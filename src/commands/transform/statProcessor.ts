import { FactTokenDailyStat } from '../../entities/FactTokenDailyStat';
import { FactYieldStat } from '../../entities/FactYieldStat';
import { DimToken } from '../../entities/DimToken';
import { DimReturnType } from '../../entities/DimReturnType';
import { Event } from '../../entities/Event';
import { initializeDataSource } from './dataSource';
import { getTokenPriceFromOracle } from './utils';

export async function processTokenDailyStats() {
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

export async function processYieldStats() {
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
