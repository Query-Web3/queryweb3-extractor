import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class WeeklyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
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
            // 查询所有相关事件（不包含Rewards事件）
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

            // 单独查询Rewards事件（不添加data条件）
            const rewardEvents = await this.repository.eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where('event.section = :section AND event.method = :method', {
                    section: 'Rewards',
                    method: 'Reward'
                })
                .andWhere('block.timestamp BETWEEN :start AND :end', { start: lastWeek, end: today })
                .getMany();

            // 合并并过滤事件
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

            const weeklyTxns = weeklyEvents.length;

            // Get token price from oracle (use default 1.0 if not available)
            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;

            // Get previous stats for comparisons
            const prevWeekStat = await this.repository.weeklyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setDate(today.getDate() - 14)) } 
            });
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setFullYear(today.getFullYear() - 1)) } 
            });

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

            // 检查数据完整性
            const hasFullWeekData = prevWeekStat && 
                (new Date().getTime() - prevWeekStat.date.getTime()) > 7 * 24 * 60 * 60 * 1000;
            const hasFullYearData = prevYearStat && 
                (new Date().getTime() - prevYearStat.date.getTime()) > 365 * 24 * 60 * 60 * 1000;

            // 处理同比环比数据
            let volumeYoY = 0;
            let txnsYoY = 0;
            let volumeQoQ = 0;
            let txnsQoQ = 0;

            if (!hasFullYearData) {
                this.logger.warn(`Insufficient yearly data for ${token.symbol}, using 0% for YoY comparison`);
            } else {
                volumeYoY = ((weeklyVolume - prevYearStat.volume) / prevYearStat.volume * 100);
                txnsYoY = ((weeklyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100);
            }

            if (!hasFullWeekData) {
                this.logger.warn(`Insufficient weekly data for ${token.symbol}, using 0% for QoQ comparison`);
            } else {
                volumeQoQ = ((weeklyVolume - prevWeekStat.volume) / prevWeekStat.volume * 100);
                txnsQoQ = ((weeklyTxns - prevWeekStat.txnsCount) / prevWeekStat.txnsCount * 100);
            }

            const weeklyStat = {
                tokenId: tokenRecord.id,
                date: today,
                volume: weeklyVolume,
                volumeUsd: weeklyVolume * tokenPrice,
                txnsCount: weeklyTxns,
                priceUsd: tokenPrice,
                volumeYoy: volumeYoY,
                volumeQoq: volumeQoQ,
                txnsYoy: txnsYoY,
                txnsQoq: txnsQoQ
            };

            // 使用upsert操作确保原子性
            const result = await this.repository.weeklyStatRepo.upsert(weeklyStat, {
                conflictPaths: ['tokenId', 'date'],
                skipUpdateIfNoValuesChanged: true
            });
            
            this.logger.debug(`Upserted weekly stat for ${token.symbol}:`, result);
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
