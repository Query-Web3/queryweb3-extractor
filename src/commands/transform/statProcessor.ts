import { FactTokenDailyStat } from '../../entities/FactTokenDailyStat';
import { FactTokenWeeklyStat } from '../../entities/FactTokenWeeklyStat';
import { FactTokenMonthlyStat } from '../../entities/FactTokenMonthlyStat';
import { FactTokenYearlyStat } from '../../entities/FactTokenYearlyStat';
import { FactYieldStat } from '../../entities/FactYieldStat';
import { DimToken } from '../../entities/DimToken';
import { DimReturnType } from '../../entities/DimReturnType';
import { DimStatCycle } from '../../entities/DimStatCycle';
import { Event } from '../../entities/Event';
import { initializeDataSource } from './dataSource';
import { getTokenPriceFromOracle } from './utils';

export async function processTokenStats() {
    const dataSource = await initializeDataSource();
    const tokenRepo = dataSource.getRepository(DimToken);
    const dailyStatRepo = dataSource.getRepository(FactTokenDailyStat);
    const weeklyStatRepo = dataSource.getRepository(FactTokenWeeklyStat);
    const monthlyStatRepo = dataSource.getRepository(FactTokenMonthlyStat); 
    const yearlyStatRepo = dataSource.getRepository(FactTokenYearlyStat);
    const eventRepo = dataSource.getRepository(Event);
    
    const tokens = await tokenRepo.find();
    const statCycleRepo = dataSource.getRepository(DimStatCycle);
    const dailyCycle = await statCycleRepo.findOne({ where: { name: 'Daily' } });
    const weeklyCycle = await statCycleRepo.findOne({ where: { name: 'Weekly' } });
    const monthlyCycle = await statCycleRepo.findOne({ where: { name: 'Monthly' } });
    const quarterlyCycle = await statCycleRepo.findOne({ where: { name: 'Quarterly' } });
    const yearlyCycle = await statCycleRepo.findOne({ where: { name: 'Yearly' } });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastQuarter = new Date(today);
    lastQuarter.setMonth(lastQuarter.getMonth() - 3);
    const lastYear = new Date(today);
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    for (const token of tokens) {
        console.log(`Processing stats for token ${token.symbol} (${token.address})`);
        
        // Get all relevant events for this token
        const events = await eventRepo.find({
            where: [
                { section: 'Tokens', method: 'Transfer', data: { currencyId: token.address } },
                { section: 'Balances', method: 'Transfer', data: { currencyId: token.address } },
                { section: 'Dex', method: 'Swap', data: { path: [token.address] } },
                { section: 'Homa', method: 'Minted', data: { currencyId: token.address } },
                { section: 'Homa', method: 'Redeemed', data: { currencyId: token.address } },
                { section: 'Rewards', method: 'Reward', data: { currencyId: token.address } }
            ]
        });

        // Calculate daily volume and txns
        console.log(`Found ${events.length} relevant events for token ${token.symbol}`);
        
        const dailyVolume = events.reduce((sum, event) => {
            let amount = 0;
            if (event.section === 'Dex' && event.method === 'Swap') {
                amount = parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
            } else if (event.data.amount) {
                amount = parseFloat(event.data.amount);
            }
            return sum + amount;
        }, 0);

        const dailyTxns = events.length;

        // Get previous stats for comparisons
        const prevDayStat = await dailyStatRepo.findOne({ where: { tokenId: token.id, date: yesterday } });
        const prevWeekStat = await weeklyStatRepo.findOne({ where: { tokenId: token.id, date: lastWeek } });
        const prevMonthStat = await monthlyStatRepo.findOne({ where: { tokenId: token.id, date: lastMonth } });
        const prevQuarterStat = await monthlyStatRepo.findOne({ where: { tokenId: token.id, date: lastQuarter } });
        const prevYearStat = await yearlyStatRepo.findOne({ where: { tokenId: token.id, date: lastYear } });

        // Calculate YoY/QoQ changes
        const volumeYoY = prevYearStat ? 
            ((dailyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
        const volumeQoQ = prevQuarterStat ? 
            ((dailyVolume - prevQuarterStat.volume) / prevQuarterStat.volume * 100) : 0;
        const txnsYoY = prevYearStat ? 
            ((dailyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;

        // Get or create today's stat
        const existingStat = await dailyStatRepo.findOne({
            where: { tokenId: token.id, date: today }
        });

        // Get token price from oracle or use default 1.0 if not available
        const tokenPrice = token.priceUsd ?? await getTokenPriceFromOracle(token.address) ?? 1.0;
        
        const statData = {
            tokenId: token.id,
            date: today,
            cycleId: dailyCycle?.id,
            volume: dailyVolume,
            volumeUsd: dailyVolume * tokenPrice,
            txnsCount: dailyTxns,
            priceUsd: tokenPrice,
            volumeYoY,
            volumeQoQ,
            txnsYoY,
            volumeWoW: prevWeekStat ?
                ((dailyVolume - prevWeekStat.volume) / prevWeekStat.volume * 100) : 0,
            volumeMoM: prevMonthStat ?
                ((dailyVolume - prevMonthStat.volume) / prevMonthStat.volume * 100) : 0
        };

        if (!existingStat) {
            console.log(`Inserting new stat record for ${token.symbol}:`, statData);
            await dailyStatRepo.insert(statData);
        } else {
            console.log(`Updating existing stat record for ${token.symbol}:`, statData);
            await dailyStatRepo.update(existingStat.id, statData);
        }

        // Process weekly stats
        const weeklyStat = {
            tokenId: token.id,
            date: today,
            cycleId: weeklyCycle?.id,
            volume: dailyVolume * 7, // Weekly volume estimate
            volumeUsd: dailyVolume * tokenPrice * 7,
            txnsCount: dailyTxns * 7,
            priceUsd: tokenPrice,
            volumeYoY,
            volumeQoQ,
            txnsYoY
        };

        const existingWeeklyStat = await weeklyStatRepo.findOne({
            where: { tokenId: token.id, date: today }
        });

        if (!existingWeeklyStat) {
            await weeklyStatRepo.insert(weeklyStat);
        } else {
            await weeklyStatRepo.update(existingWeeklyStat.id, weeklyStat);
        }

        // Process monthly stats
        const monthlyStat = {
            tokenId: token.id,
            date: today,
            cycleId: monthlyCycle?.id,
            volume: dailyVolume * 30, // Monthly volume estimate
            volumeUsd: dailyVolume * tokenPrice * 30,
            txnsCount: dailyTxns * 30,
            priceUsd: tokenPrice,
            volumeYoY,
            volumeQoQ,
            txnsYoY
        };

        const existingMonthlyStat = await monthlyStatRepo.findOne({
            where: { tokenId: token.id, date: today }
        });

        if (!existingMonthlyStat) {
            await monthlyStatRepo.insert(monthlyStat);
        } else {
            await monthlyStatRepo.update(existingMonthlyStat.id, monthlyStat);
        }

        // Process yearly stats
        const yearlyStat = {
            tokenId: token.id,
            date: today,
            cycleId: yearlyCycle?.id,
            volume: dailyVolume * 365, // Yearly volume estimate
            volumeUsd: dailyVolume * tokenPrice * 365,
            txnsCount: dailyTxns * 365,
            priceUsd: tokenPrice,
            volumeYoY,
            volumeQoQ,
            txnsYoY
        };

        const existingYearlyStat = await yearlyStatRepo.findOne({
            where: { tokenId: token.id, date: today }
        });

        if (!existingYearlyStat) {
            await yearlyStatRepo.insert(yearlyStat);
        } else {
            await yearlyStatRepo.update(existingYearlyStat.id, yearlyStat);
        }
    }
}

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
