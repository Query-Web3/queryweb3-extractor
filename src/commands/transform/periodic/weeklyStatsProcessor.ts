import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';
import { TokenService } from '../token/TokenService';

export class WeeklyStatsProcessor {
    constructor(
        private repository: TokenStatsRepository, 
        private logger: Logger,
        private tokenService: TokenService
    ) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async processAllTokens() {
        const timer = this.logger.time('Process weekly stats for all tokens');
        this.logger.info('Processing weekly stats for all tokens');
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - 7);

            // 1. 获取所有token
            const tokens = await this.repository.tokenRepo.find();
            
            // 2. 为每个token计算周统计
            for (const token of tokens) {
                try {
                    // 查询过去7天的日统计数据
                    const dailyStats = await this.repository.dailyStatRepo
                        .createQueryBuilder('stat')
                        .where('stat.token_id = :tokenId', { tokenId: token.id })
                        .andWhere('stat.date BETWEEN :start AND :end', {
                            start: weekStart,
                            end: today
                        })
                        .getMany();

                    // 计算周统计
                    const weeklyVolume = dailyStats.reduce((sum, stat) => sum + stat.volume, 0);
                    const weeklyTxns = dailyStats.reduce((sum, stat) => sum + stat.txnsCount, 0);
                    
                    // 计算平均价格，处理NaN情况
                    const avgPrice = dailyStats.length > 0 ? 
                        dailyStats.reduce((sum, stat) => sum + (stat.priceUsd || 0), 0) / dailyStats.length : 0;
                    
                    // 确保volumeUsd有效
                    const safeVolumeUsd = isFinite(weeklyVolume * avgPrice) ? weeklyVolume * avgPrice : 0;

                    // 获取同比数据
                    const prevYearWeekStart = new Date(weekStart);
                    prevYearWeekStart.setFullYear(prevYearWeekStart.getFullYear() - 1);
                    const prevYearWeekEnd = new Date(today);
                    prevYearWeekEnd.setFullYear(prevYearWeekEnd.getFullYear() - 1);

                    const prevYearStats = await this.repository.dailyStatRepo
                        .createQueryBuilder('stat')
                        .select('SUM(stat.volume) as volume, SUM(stat.txns_count) as txns_count')
                        .where('stat.token_id = :tokenId', { tokenId: token.id })
                        .andWhere('stat.date BETWEEN :start AND :end', {
                            start: prevYearWeekStart,
                            end: prevYearWeekEnd
                        })
                        .getRawOne();

                    // 计算同比变化
                    const volumeYoY = prevYearStats?.volume ? 
                        ((weeklyVolume - prevYearStats.volume) / prevYearStats.volume * 100) : 0;
                    const txnsYoY = prevYearStats?.txns_count ?
                        ((weeklyTxns - prevYearStats.txns_count) / prevYearStats.txns_count * 100) : 0;

                    // 保存周统计
                    const weeklyStat = {
                        tokenId: token.id,
                        date: today,
                        volume: weeklyVolume,
                        volumeUsd: safeVolumeUsd,
                        txnsCount: weeklyTxns,
                        priceUsd: isFinite(avgPrice) ? avgPrice : 0,
                        volumeYoy: volumeYoY,
                        txnsYoy: txnsYoY
                    };

                    await this.repository.weeklyStatRepo.upsert(weeklyStat, {
                        conflictPaths: ['tokenId', 'date'],
                        skipUpdateIfNoValuesChanged: true
                    });
                } catch (error) {
                    this.logger.error(`Error processing weekly stats for token ${token.symbol}`, error as Error);
                    continue;
                }
            }

            timer.end();
            return true;
        } catch (error) {
            this.logger.error('Error processing weekly stats for all tokens', error as Error);
            return false;
        }
    }

    public async processToken(token: DimToken) {
        const tokenTimer = this.logger.time(`Process weekly stats for token ${token.symbol}`);
        this.logger.info(`Processing weekly stats for token ${token.symbol} (${token.address})`);
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);

            // Get weekly events
            const baseEvents = await this.repository.eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where('(event.section = :section1 AND event.method = :method1) OR ' +
                       '(event.section = :section2 AND event.method = :method2) OR ' +
                       '(event.section = :section3 AND event.method = :method3)',
                    {
                        section1: 'Tokens', method1: 'Transfer',
                        section2: 'Balances', method2: 'Transfer',
                        section3: 'Dex', method3: 'Swap'
                    })
                .andWhere('block.timestamp BETWEEN :start AND :end', { start: lastWeek, end: today })
                .getMany();

            const rewardEvents = await this.repository.eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where('event.section = :section AND event.method = :method', {
                    section: 'Rewards',
                    method: 'Reward'
                })
                .andWhere('block.timestamp BETWEEN :start AND :end', { start: lastWeek, end: today })
                .getMany();

            const weeklyEvents = [
                ...baseEvents.filter(e => JSON.stringify(e.data).includes(`"${token.address}"`)),
                ...rewardEvents.filter(e => 
                    e.data && 
                    typeof e.data === 'object' &&
                    e.data.currencyId === token.address
                )
            ];

            const weeklyVolume = weeklyEvents.reduce((sum, event) => {
                let amount = 0;
                if (event.section === 'Dex' && event.method === 'Swap') {
                    amount = parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
                } else if (event.data.amount) {
                    amount = parseFloat(event.data.amount);
                }
                return sum + amount;
            }, 0);

            let weeklyTxns = weeklyEvents.length;
            
            try {
                // 使用TokenService的Redis客户端
                const redisClient = this.tokenService['redisClient'];
                if (redisClient.isOpen) {
                    const redisKey = `token:${token.address}:weekly:txns:${today.toISOString().split('T')[0]}`;
                    // 从Redis获取当前计数
                    const redisCount = await redisClient.get(redisKey);
                    if (redisCount) {
                        weeklyTxns += parseInt(redisCount);
                    }
                    // 更新Redis计数器
                    await redisClient.incrBy(redisKey, weeklyEvents.length);
                    // 设置7天过期
                    await redisClient.expire(redisKey, 604800);
                }
            } catch (e) {
                this.logger.warn('Failed to update Redis counter, using direct count only', e as Error);
            }

            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;
            const safeTokenPrice = isFinite(tokenPrice) ? tokenPrice : 1.0;

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

            const prevWeekStat = await this.repository.weeklyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setDate(today.getDate() - 14)) } 
            });
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setFullYear(today.getFullYear() - 1)) } 
            });

            const hasFullWeekData = prevWeekStat && 
                (new Date().getTime() - prevWeekStat.date.getTime()) > 7 * 24 * 60 * 60 * 1000;
            const hasFullYearData = prevYearStat && 
                (new Date().getTime() - prevYearStat.date.getTime()) > 365 * 24 * 60 * 60 * 1000;

            let volumeYoY = 0;
            let txnsYoY = 0;
            let volumeQoQ = 0;
            let txnsQoQ = 0;

            if (hasFullYearData) {
                volumeYoY = prevYearStat.volume ? 
                    ((weeklyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
                txnsYoY = prevYearStat.txnsCount ?
                    ((weeklyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;
            }

            if (hasFullWeekData) {
                volumeQoQ = prevWeekStat.volume ? 
                    ((weeklyVolume - prevWeekStat.volume) / prevWeekStat.volume * 100) : 0;
                txnsQoQ = prevWeekStat.txnsCount ?
                    ((weeklyTxns - prevWeekStat.txnsCount) / prevWeekStat.txnsCount * 100) : 0;
            }

            const weeklyStat = {
                tokenId: tokenRecord.id,
                date: today,
                volume: isFinite(weeklyVolume) ? weeklyVolume : 0,
                volumeUsd: isFinite(weeklyVolume * safeTokenPrice) ? weeklyVolume * safeTokenPrice : 0,
                txnsCount: isFinite(weeklyTxns) ? weeklyTxns : 0,
                priceUsd: safeTokenPrice,
                volumeYoy: isFinite(volumeYoY) ? volumeYoY : 0,
                volumeQoq: isFinite(volumeQoQ) ? volumeQoQ : 0,
                txnsYoy: isFinite(txnsYoY) ? txnsYoY : 0,
                txnsQoq: isFinite(txnsQoQ) ? txnsQoQ : 0
            };

            const result = await this.repository.weeklyStatRepo.upsert(weeklyStat, {
                conflictPaths: ['tokenId', 'date'],
                skipUpdateIfNoValuesChanged: true
            });
            
            if (!result.identifiers[0]?.id) {
                throw new Error(`Failed to upsert weekly stat record for ${token.symbol}`);
            }

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing weekly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
