import { FactTokenDailyStat } from '../../entities/FactTokenDailyStat';
import { FactTokenWeeklyStat } from '../../entities/FactTokenWeeklyStat';
import { FactTokenMonthlyStat } from '../../entities/FactTokenMonthlyStat';
import { FactTokenYearlyStat } from '../../entities/FactTokenYearlyStat';
import { DimToken } from '../../entities/DimToken';
import { DimStatCycle } from '../../entities/DimStatCycle';
import { Event } from '../../entities/Event';
import { initializeDataSource } from './dataSource';
import { getTokenPriceFromOracle } from './utils';
import { Between } from 'typeorm';
import { Logger, LogLevel } from '../../utils/logger';

export async function processTokenStats() {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const statsTimer = logger.time('Process token stats');
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

    logger.info(`Processing stats for ${tokens.length} tokens`);
    
    for (const token of tokens) {
        const tokenTimer = logger.time(`Process token ${token.symbol}`);
        logger.info(`Processing stats for token ${token.symbol} (${token.address})`);
        
        try {
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
            logger.debug(`Found ${events.length} relevant events for token ${token.symbol}`);
            
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
                logger.debug(`Inserting new stat record for ${token.symbol}`, statData);
                await dailyStatRepo.insert(statData);
            } else {
                logger.debug(`Updating existing stat record for ${token.symbol}`, statData);
                await dailyStatRepo.update(existingStat.id, statData);
            }

            // Process weekly stats - use actual weekly data
            const weeklyEvents = await eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where('(event.section = :section1 AND event.method = :method1 AND event.data LIKE :data1) OR ' +
                       '(event.section = :section2 AND event.method = :method2 AND event.data LIKE :data2) OR ' +
                       '(event.section = :section3 AND event.method = :method3 AND event.data LIKE :data3)',
                    {
                        section1: 'Tokens', method1: 'Transfer', data1: `%${token.address}%`,
                        section2: 'Balances', method2: 'Transfer', data2: `%${token.address}%`, 
                        section3: 'Dex', method3: 'Swap', data3: `%${token.address}%`
                    })
                .andWhere('block.timestamp BETWEEN :start AND :end', { start: lastWeek, end: today })
                .getMany();

            const weeklyVolume = weeklyEvents.reduce((sum, event) => {
                let amount = 0;
                if (event.section === 'Dex' && event.method === 'Swap') {
                    amount = parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
                } else if (event.data.amount) {
                    amount = parseFloat(event.data.amount);
                }
                return sum + amount;
            }, 0);

            const weeklyTxns = weeklyEvents.length;

            const weeklyStat = {
                tokenId: token.id,
                date: today,
                cycleId: weeklyCycle?.id,
                volume: weeklyVolume,
                volumeUsd: weeklyVolume * tokenPrice,
                txnsCount: weeklyTxns,
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

            // Process monthly stats - use actual monthly data
            const monthlyEvents = await eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where('(event.section = :section1 AND event.method = :method1 AND event.data LIKE :data1) OR ' +
                       '(event.section = :section2 AND event.method = :method2 AND event.data LIKE :data2) OR ' +
                       '(event.section = :section3 AND event.method = :method3 AND event.data LIKE :data3)',
                    {
                        section1: 'Tokens', method1: 'Transfer', data1: `%${token.address}%`,
                        section2: 'Balances', method2: 'Transfer', data2: `%${token.address}%`, 
                        section3: 'Dex', method3: 'Swap', data3: `%${token.address}%`
                    })
                .andWhere('block.timestamp BETWEEN :start AND :end', { start: lastMonth, end: today })
                .getMany();

            const monthlyVolume = monthlyEvents.reduce((sum, event) => {
                let amount = 0;
                if (event.section === 'Dex' && event.method === 'Swap') {
                    amount = parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
                } else if (event.data.amount) {
                    amount = parseFloat(event.data.amount);
                }
                return sum + amount;
            }, 0);

            const monthlyTxns = monthlyEvents.length;

            const monthlyStat = {
                tokenId: token.id,
                date: today,
                cycleId: monthlyCycle?.id,
                volume: monthlyVolume,
                volumeUsd: monthlyVolume * tokenPrice,
                txnsCount: monthlyTxns,
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

            // Process yearly stats - use actual yearly data
            const yearlyEvents = await eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where('(event.section = :section1 AND event.method = :method1 AND event.data LIKE :data1) OR ' +
                       '(event.section = :section2 AND event.method = :method2 AND event.data LIKE :data2) OR ' +
                       '(event.section = :section3 AND event.method = :method3 AND event.data LIKE :data3)',
                    {
                        section1: 'Tokens', method1: 'Transfer', data1: `%${token.address}%`,
                        section2: 'Balances', method2: 'Transfer', data2: `%${token.address}%`, 
                        section3: 'Dex', method3: 'Swap', data3: `%${token.address}%`
                    })
                .andWhere('block.timestamp BETWEEN :start AND :end', { start: lastYear, end: today })
                .getMany();

            const yearlyVolume = yearlyEvents.reduce((sum, event) => {
                let amount = 0;
                if (event.section === 'Dex' && event.method === 'Swap') {
                    amount = parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
                } else if (event.data.amount) {
                    amount = parseFloat(event.data.amount);
                }
                return sum + amount;
            }, 0);

            const yearlyTxns = yearlyEvents.length;

            const yearlyStat = {
                tokenId: token.id,
                date: today,
                cycleId: yearlyCycle?.id,
                volume: yearlyVolume,
                volumeUsd: yearlyVolume * tokenPrice,
                txnsCount: yearlyTxns,
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
            tokenTimer.end();
        } catch (error) {
            logger.error(`Error processing token ${token.symbol}`, error as Error);
            continue;
        }
    }
    
    logger.info('Finished processing all token stats');
    statsTimer.end();
}
