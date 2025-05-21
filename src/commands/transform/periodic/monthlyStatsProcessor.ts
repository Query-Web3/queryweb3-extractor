import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class MonthlyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async processAllTokens() {
        const timer = this.logger.time('Process monthly stats for all tokens');
        this.logger.info('Processing monthly stats for all tokens');
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const monthStart = new Date(today);
            monthStart.setMonth(monthStart.getMonth() - 1);

            // 1. 获取所有token
            const tokens = await this.repository.tokenRepo.find();
            
            // 2. 为每个token计算月统计
            for (const token of tokens) {
                try {
                    // 查询过去4周的周统计数据
                    const weeklyStats = await this.repository.weeklyStatRepo
                        .createQueryBuilder('stat')
                        .where('stat.token_id = :tokenId', { tokenId: token.id })
                        .andWhere('stat.date BETWEEN :start AND :end', {
                            start: monthStart,
                            end: today
                        })
                        .getMany();

                    // 计算月统计
                    const monthlyVolume = weeklyStats.reduce((sum, stat) => {
                        let volume = 0;
                        if (stat.volume !== null && stat.volume !== undefined) {
                            const volumeStr = String(stat.volume);
                            volume = parseFloat(volumeStr.replace(/[^\d.-]/g, ''));
                        }
                        return sum + (isFinite(volume) ? volume : 0);
                    }, 0);
                    const monthlyTxns = weeklyStats.reduce((sum, stat) => sum + stat.txnsCount, 0);
                    
                    // 计算平均价格，处理NaN情况
                    const avgPrice = weeklyStats.length > 0 ? 
                        weeklyStats.reduce((sum, stat) => sum + (stat.priceUsd || 0), 0) / weeklyStats.length : 0;
                    
                    // 确保volumeUsd有效
                    const safeVolumeUsd = isFinite(monthlyVolume * avgPrice) ? monthlyVolume * avgPrice : 0;

                    // 获取同比数据
                    const prevYearMonthStart = new Date(monthStart);
                    prevYearMonthStart.setFullYear(prevYearMonthStart.getFullYear() - 1);
                    const prevYearMonthEnd = new Date(today);
                    prevYearMonthEnd.setFullYear(prevYearMonthEnd.getFullYear() - 1);

                    const prevYearStats = await this.repository.weeklyStatRepo
                        .createQueryBuilder('stat')
                        .select('SUM(stat.volume) as volume, SUM(stat.txns_count) as txns_count')
                        .where('stat.token_id = :tokenId', { tokenId: token.id })
                        .andWhere('stat.date BETWEEN :start AND :end', {
                            start: prevYearMonthStart,
                            end: prevYearMonthEnd
                        })
                        .getRawOne();

                    // 计算同比变化
                    const volumeYoY = prevYearStats?.volume ? 
                        ((monthlyVolume - prevYearStats.volume) / prevYearStats.volume * 100) : 0;
                    const txnsYoY = prevYearStats?.txns_count ?
                        ((monthlyTxns - prevYearStats.txns_count) / prevYearStats.txns_count * 100) : 0;

                    // 验证volume值
                    const safeMonthlyVolume = isFinite(monthlyVolume) ? 
                        Math.min(monthlyVolume, Number.MAX_SAFE_INTEGER) : 0;
                    
                    // 保存月统计
                    const monthlyStat = {
                        tokenId: token.id,
                        date: today,
                        volume: safeMonthlyVolume,
                        volumeUsd: safeVolumeUsd,
                        txnsCount: monthlyTxns,
                        priceUsd: isFinite(avgPrice) ? avgPrice : 0,
                        volumeYoy: volumeYoY,
                        txnsYoy: txnsYoY
                    };

                    // 记录验证日志
                    if (monthlyVolume !== safeMonthlyVolume) {
                        this.logger.warn(`Volume value ${monthlyVolume} was truncated to ${safeMonthlyVolume} for token ${token.symbol}`);
                    }

                    await this.repository.monthlyStatRepo.upsert(monthlyStat, {
                        conflictPaths: ['tokenId', 'date'],
                        skipUpdateIfNoValuesChanged: true
                    });
                } catch (error) {
                    this.logger.error(`Error processing monthly stats for token ${token.symbol}`, error as Error);
                    continue;
                }
            }

            timer.end();
            return true;
        } catch (error) {
            this.logger.error('Error processing monthly stats for all tokens', error as Error);
            return false;
        }
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
                    const amountIn = event.data?.amountIn ? 
                        parseFloat(String(event.data.amountIn).replace(/[^\d.-]/g, '')) : 0;
                    const amountOut = event.data?.amountOut ? 
                        parseFloat(String(event.data.amountOut).replace(/[^\d.-]/g, '')) : 0;
                    amount = (isFinite(amountIn) ? amountIn : 0) + (isFinite(amountOut) ? amountOut : 0);
                } else if (event.data?.amount) {
                    amount = parseFloat(String(event.data.amount).replace(/[^\d.-]/g, ''));
                }
                return sum + (isFinite(amount) ? amount : 0);
            }, 0);

            const monthlyTxns = monthlyEvents.length;

            // Get token price from oracle (use default 1.0 if not available)
            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;
            const safeTokenPrice = isFinite(tokenPrice) ? tokenPrice : 1.0;

            // Find token in dim_tokens table by symbol or name
            const tokenRecord = await this.repository.tokenRepo.findOne({
                where: [
                    { symbol: token.symbol },
                    { name: token.symbol }
                ]
            });

            if (!tokenRecord) {
                this.logger.warn(`Skipping token ${token.symbol} - no matching record found in dim_tokens table`);
                return false;
            }

            // Get previous stats for comparisons
            const prevMonthStat = await this.repository.monthlyStatRepo.findOne({ 
                where: { tokenId: tokenRecord.id, date: new Date(today.setMonth(today.getMonth() - 2)) } 
            });
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: tokenRecord.id, date: new Date(today.setFullYear(today.getFullYear() - 1)) } 
            });
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

            if (hasFullYearData) {
                volumeYoY = prevYearStat.volume ? 
                    ((monthlyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
                txnsYoY = prevYearStat.txnsCount ?
                    ((monthlyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;
            }

            if (hasFullQuarterData) {
                // 确保分母不为0且计算有效
                volumeQoQ = prevQuarterStat.volume && prevQuarterStat.volume !== 0 ? 
                    ((monthlyVolume - prevQuarterStat.volume) / prevQuarterStat.volume * 100) : 0;
                txnsQoQ = prevQuarterStat.txnsCount && prevQuarterStat.txnsCount !== 0 ?
                    ((monthlyTxns - prevQuarterStat.txnsCount) / prevQuarterStat.txnsCount * 100) : 0;
                
                // 确保计算结果有效
                volumeQoQ = isFinite(volumeQoQ) ? volumeQoQ : 0;
                txnsQoQ = isFinite(txnsQoQ) ? txnsQoQ : 0;
            }

            // 验证volume值
            const safeMonthlyVolume = isFinite(monthlyVolume) ? 
                Math.min(monthlyVolume, Number.MAX_SAFE_INTEGER) : 0;
            
            const monthlyStat = {
                tokenId: tokenRecord.id,
                date: today,
                volume: safeMonthlyVolume,
                volumeUsd: isFinite(safeMonthlyVolume * safeTokenPrice) ? safeMonthlyVolume * safeTokenPrice : 0,
                txnsCount: monthlyTxns,
                priceUsd: safeTokenPrice,
                volumeYoy: volumeYoY,
                txnsYoy: txnsYoY,
                volumeQoq: isFinite(volumeQoQ) ? volumeQoQ : 0,
                txnsQoq: isFinite(txnsQoQ) ? txnsQoQ : 0
            };

            // 记录验证日志
            if (monthlyVolume !== safeMonthlyVolume) {
                this.logger.warn(`Volume value ${monthlyVolume} was truncated to ${safeMonthlyVolume} for token ${token.symbol}`);
            }

            await this.repository.monthlyStatRepo.upsert(monthlyStat, {
                conflictPaths: ['tokenId', 'date'],
                skipUpdateIfNoValuesChanged: true
            });

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing monthly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
