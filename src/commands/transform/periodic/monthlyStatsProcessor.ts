import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class MonthlyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async processToken(token: DimToken) {
        const tokenTimer = this.logger.time(`Process monthly stats for token ${token.symbol}`);
        this.logger.info(`Processing monthly stats for token ${token.symbol} (${token.address})`);
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const lastMonth = new Date(today);
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            // Get monthly events
            const monthlyEvents = await this.repository.eventRepo.createQueryBuilder('event')
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

            // Get token price from oracle (use default 1.0 if not available)
            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;

            // Find token in dim_tokens table by symbol or name
            const tokenRecord = await this.repository.tokenRepo.findOne({
                where: [
                    { symbol: token.symbol },
                    { name: token.symbol } // Also try matching by name if symbol not found
                ]
            });

            if (!tokenRecord) {
                this.logger.warn(`Skipping token ${token.symbol} - no matching record found in dim_tokens table`);
                return false;
            }

            this.logger.debug(`Found matching token record for ${token.symbol}: ID=${tokenRecord.id}`);

            // Get previous stats for comparisons
            const prevMonthStat = await this.repository.monthlyStatRepo.findOne({ 
                where: { tokenId: tokenRecord.id, date: new Date(today.setMonth(today.getMonth() - 2)) } 
            });
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: tokenRecord.id, date: new Date(today.setFullYear(today.getFullYear() - 1)) } 
            });

            // 获取季度数据 (3个月前)
            const prevQuarterStat = await this.repository.monthlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setMonth(today.getMonth() - 3)) } 
            });

            // 检查数据完整性
            const hasFullMonthData = prevMonthStat && 
                (new Date().getTime() - prevMonthStat.date.getTime()) > 30 * 24 * 60 * 60 * 1000;
            const hasFullYearData = prevYearStat && 
                (new Date().getTime() - prevYearStat.date.getTime()) > 365 * 24 * 60 * 60 * 1000;
            const hasFullQuarterData = prevQuarterStat && 
                (new Date().getTime() - prevQuarterStat.date.getTime()) > 90 * 24 * 60 * 60 * 1000;

            // 处理同比环比数据
            let volumeYoY = 0;
            let txnsYoY = 0;
            let volumeQoQ = 0;
            let txnsQoQ = 0;

            if (!hasFullYearData) {
                this.logger.warn(`Insufficient yearly data for ${token.symbol}, using 0% for YoY comparison`);
            } else {
                volumeYoY = ((monthlyVolume - prevYearStat.volume) / prevYearStat.volume * 100);
                txnsYoY = ((monthlyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100);
            }

            if (!hasFullQuarterData) {
                this.logger.warn(`Insufficient quarterly data for ${token.symbol}, using 0% for QoQ comparison`);
            } else {
                volumeQoQ = ((monthlyVolume - prevQuarterStat.volume) / prevQuarterStat.volume * 100);
                txnsQoQ = ((monthlyTxns - prevQuarterStat.txnsCount) / prevQuarterStat.txnsCount * 100);
            }

            const monthlyStat = {
                tokenId: tokenRecord.id,
                date: today,
                volume: monthlyVolume,
                volumeUsd: monthlyVolume * tokenPrice,
                txnsCount: monthlyTxns,
                priceUsd: tokenPrice,
                volumeYoy: volumeYoY,
                txnsYoy: txnsYoY,
                volumeQoq: volumeQoQ,
                txnsQoq: txnsQoQ
            };

            const existingMonthlyStat = await this.repository.monthlyStatRepo.findOne({
                where: { tokenId: token.id, date: today }
            });

            // 使用upsert操作避免主键冲突
            await this.repository.monthlyStatRepo.upsert(monthlyStat, {
                conflictPaths: ['tokenId', 'date'], // 冲突检测字段
                skipUpdateIfNoValuesChanged: true // 无变化时不更新
            });
            this.logger.debug(`Upserted monthly stat record for ${token.symbol}`);

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing monthly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
