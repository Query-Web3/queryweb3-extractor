import dotenv from 'dotenv';
import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';

// 加载环境变量
dotenv.config();
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';
import { FactTokenDailyStat } from '../../../entities/FactTokenDailyStat';

export class DailyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async processAllTokens() {
        const timer = this.logger.time('Process daily stats for all tokens');
        this.logger.info('Processing daily stats for all tokens');
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // 1. 按天聚合所有token的区块数据
            // 添加调试日志
            this.logger.debug('Querying daily events for date:', today.toISOString());
            
            const dailyEvents = await this.repository.eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where(`(
                    (event.section = 'Tokens' AND event.method = 'Transfer') OR
                    (event.section = 'Balances' AND event.method = 'Transfer') OR
                    (event.section = 'Dex' AND event.method = 'Swap') OR
                    (event.section = 'Homa' AND event.method = 'Minted') OR
                    (event.section = 'Homa' AND event.method = 'Redeemed')
                )`)
                .andWhere('block.timestamp >= :start AND block.timestamp < :end', {
                    start: today,
                    end: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                })
                .getMany();

            // 记录查询结果
            this.logger.debug(`Found ${dailyEvents.length} daily events`);
            if (dailyEvents.length > 0) {
                this.logger.debug('Sample event:', {
                    section: dailyEvents[0].section,
                    method: dailyEvents[0].method,
                    data: dailyEvents[0].data
                });
            }

            // 2. 按token分组计算日统计
            const tokenStats = new Map<string, {volume: number, txns: number}>();
            
            for (const event of dailyEvents) {
                const tokenAddress = this.extractTokenAddress(event);
                if (!tokenAddress) continue;
                
                if (!tokenStats.has(tokenAddress)) {
                    tokenStats.set(tokenAddress, {volume: 0, txns: 0});
                }
                
                const stats = tokenStats.get(tokenAddress)!;
                stats.txns += 1;
                
                if (event.section === 'Dex' && event.method === 'Swap') {
                    stats.volume += parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
                } else if (event.data.amount) {
                    stats.volume += parseFloat(event.data.amount);
                }
            }

            // 3. 保存所有token的日统计
            const tokens = await this.repository.tokenRepo.find();
            for (const token of tokens) {
                const stats = tokenStats.get(token.address);
                if (!stats) continue;
                
                await this.processTokenStats(token, stats.volume, stats.txns, today);
            }

            timer.end();
            return true;
        } catch (error) {
            this.logger.error('Error processing daily stats for all tokens', error as Error);
            return false;
        }
    }

    private extractTokenAddress(event: any): string | null {
        // 实现从事件数据中提取token地址的逻辑
        if (event.data?.currencyId) return event.data.currencyId;
        if (event.data?.token) return event.data.token;
        if (event.data?.assetId) return event.data.assetId;
        return null;
    }

    private async processTokenStats(
        token: DimToken,
        volume: number,
        txns: number,
        date: Date
    ): Promise<boolean> {
        try {
            this.logger.debug(`Processing daily stats for token ${token.symbol}`);
            
            // 获取token价格，处理异常情况
            let tokenPrice = 1.0;
            try {
                const price = await getTokenPriceFromOracle(token.address);
                if (price !== null && !isNaN(price) && isFinite(price)) {
                    tokenPrice = price;
                }
            } catch (e) {
                this.logger.warn(`Failed to get price for ${token.symbol}, using default 1.0`);
            }

            // 确保所有数值有效
            const safeVolume = isNaN(volume) || !isFinite(volume) ? 0 : volume;
            const safeTxns = isNaN(txns) || !isFinite(txns) ? 0 : txns;
            const safeTokenPrice = isNaN(tokenPrice) || !isFinite(tokenPrice) ? 1.0 : tokenPrice;
            
            // 计算volumeUsd并确保有效
            const safeVolumeUsd = isFinite(safeVolume * safeTokenPrice) ? safeVolume * safeTokenPrice : 0;

            const statData = {
                tokenId: token.id,
                date,
                volume: safeVolume,
                volumeUsd: safeVolumeUsd,
                txnsCount: safeTxns,
                priceUsd: safeTokenPrice
            };

            // 记录即将写入的数据
            this.logger.debug('Preparing to save daily stats:', {
                tokenId: token.id,
                tokenSymbol: token.symbol,
                statData: JSON.stringify(statData, null, 2)
            });

            // 使用repository的dailyStatRepo进行数据操作
            const result = await this.repository.dailyStatRepo.upsert(statData, {
                conflictPaths: ['tokenId', 'date'],
                skipUpdateIfNoValuesChanged: true
            });

            if (!result.identifiers?.length) {
                throw new Error(`Failed to upsert daily stats for token ${token.symbol}`);
            }

            // 验证数据写入
            const writtenStat = await this.repository.dailyStatRepo.findOne({
                where: {
                    tokenId: token.id,
                    date: date
                }
            });
            
            if (!writtenStat) {
                throw new Error(`Failed to verify written stats for token ${token.symbol}`);
            }
            
            this.logger.info(`Successfully processed daily stats for token ${token.symbol}`);
            return true;
        } catch (error) {
            this.logger.error(`Error saving daily stats for token ${token.symbol}`, 
                error instanceof Error ? error : new Error(String(error)));
            this.logger.debug('Error details:', {
                tokenId: token.id,
                date: date.toISOString()
            });
            return false;
        }
    }

    public async processToken(token: DimToken) {
        const tokenTimer = this.logger.time(`Process token ${token.symbol}`);
        this.logger.info(`Processing daily stats for token ${token.symbol} (${token.address})`);
        
        try {
            // Validate token has ID and is properly linked to dim_tokens
            if (!token?.id) {
                throw new Error(`Invalid token object: ID is missing for ${token?.symbol || 'unknown token'}`);
            }

            const events = await this.repository.eventRepo.createQueryBuilder('event')
                .where(`(
                    (event.section = 'Tokens' AND event.method = 'Transfer') OR
                    (event.section = 'Balances' AND event.method = 'Transfer') OR
                    (event.section = 'Dex' AND event.method = 'Swap') OR
                    (event.section = 'Homa' AND event.method = 'Minted') OR
                    (event.section = 'Homa' AND event.method = 'Redeemed')
                )`)
                .andWhere('event.data LIKE :tokenLike', { tokenLike: `%"${token.address}"%` })
                .getMany();

            // Calculate daily volume and txns
            this.logger.debug(`Found ${events.length} relevant events for token ${token.symbol}`);
            
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

            // Get token price from oracle (use default 1.0 if not available or fails)
            // 获取token价格，处理异常情况
            let tokenPrice = 1.0;
            try {
                const price = await getTokenPriceFromOracle(token.address);
                if (price !== null && !isNaN(price) && isFinite(price)) {
                    tokenPrice = price;
                }
            } catch (error) {
                this.logger.warn(`Failed to get price for token ${token.symbol}, using default 1.0`, error as Error);
            }
            const safeTokenPrice = isNaN(tokenPrice) || !isFinite(tokenPrice) ? 1.0 : tokenPrice;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // Get previous stats for comparisons
            const prevDayStat = await this.repository.dailyStatRepo.findOne({ 
                where: { tokenId: token.id, date: yesterday } 
            });
            const prevWeekStat = await this.repository.weeklyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setDate(today.getDate() - 7)) } 
            });
            const prevMonthStat = await this.repository.monthlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setMonth(today.getMonth() - 1)) } 
            });
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setFullYear(today.getFullYear() - 1)) } 
            });

            // 检查数据完整性
            const hasFullYearData = prevYearStat && 
                (new Date().getTime() - prevYearStat.date.getTime()) > 365 * 24 * 60 * 60 * 1000;
            const hasFullDayData = prevDayStat && 
                (new Date().getTime() - prevDayStat.date.getTime()) > 24 * 60 * 60 * 1000;

            // 处理同比环比数据
            let volumeYoY = 0;
            let volumeQoQ = 0;
            let txnsYoY = 0;

            if (!hasFullYearData) {
                this.logger.warn(`Insufficient yearly data for ${token.symbol}, using 0% for YoY comparison`);
            } else {
                volumeYoY = ((dailyVolume - prevYearStat.volume) / prevYearStat.volume * 100);
                txnsYoY = ((dailyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100);
            }

            if (!hasFullDayData) {
                this.logger.warn(`Insufficient daily data for ${token.symbol}, using 0% for QoQ comparison`);
            } else {
                volumeQoQ = ((dailyVolume - prevDayStat.volume) / prevDayStat.volume * 100);
            }

            // Get or create today's stat
            const existingStat = await this.repository.dailyStatRepo.findOne({
                where: { tokenId: token.id, date: today }
            });

            try {
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
                } else {
                    this.logger.info(`Found matching token record for ${token.symbol} - ID=${tokenRecord.id}`);
                }

                // Calculate txns_qoq based on previous quarter's stats (90 days ago)
                const prevQuarterDate = new Date(today);
                prevQuarterDate.setDate(prevQuarterDate.getDate() - 90);
                const prevQuarterStat = await this.repository.dailyStatRepo
                    .createQueryBuilder('stat')
                    .select('SUM(stat.volume) as volume, SUM(stat.txns_count) as txns_count')
                    .where('stat.token_id = :tokenId', { tokenId: tokenRecord.id })
                    .andWhere('stat.date BETWEEN :start AND :end', {
                        start: new Date(prevQuarterDate.setDate(prevQuarterDate.getDate() - 90)),
                        end: prevQuarterDate
                    })
                    .getRawOne();
                
                const txnsQoQ = prevQuarterStat?.txns_count ? 
                    ((dailyTxns - prevQuarterStat.txns_count) / prevQuarterStat.txns_count * 100) : 0;

                // 确保tokenRecord.id存在且有效
                if (!tokenRecord?.id) {
                    throw new Error(`Invalid token record: ID is missing for ${tokenRecord?.symbol || token.symbol}`);
                }

                // 构建符合实体类型的statData对象
                // 确保所有数值有效
                const safeVolume = isNaN(dailyVolume) || !isFinite(dailyVolume) ? 0 : dailyVolume;
                const safeTxns = isNaN(dailyTxns) || !isFinite(dailyTxns) ? 0 : dailyTxns;
                const safeVolumeUsd = isFinite(safeVolume * safeTokenPrice) ? safeVolume * safeTokenPrice : 0;
                const safeVolumeYoY = isNaN(volumeYoY) || !isFinite(volumeYoY) ? 0 : volumeYoY;
                const safeVolumeQoQ = isNaN(volumeQoQ) || !isFinite(volumeQoQ) ? 0 : volumeQoQ;
                const safeTxnsYoY = isNaN(txnsYoY) || !isFinite(txnsYoY) ? 0 : txnsYoY;
                const safeTxnsQoQ = isNaN(txnsQoQ) || !isFinite(txnsQoQ) ? 0 : txnsQoQ;

                const statData: Partial<FactTokenDailyStat> = {
                    tokenId: tokenRecord.id,
                    date: today,
                    volume: safeVolume,
                    volumeUsd: safeVolumeUsd,
                    txnsCount: safeTxns,
                    priceUsd: safeTokenPrice,
                    volumeYoy: safeVolumeYoY,
                    volumeQoq: safeVolumeQoQ,
                    txnsYoy: safeTxnsYoY,
                    txnsQoq: safeTxnsQoQ
                };

                // 验证statData中的tokenId
                if (statData.tokenId === undefined || statData.tokenId === null) {
                    throw new Error(`Failed to set tokenId in statData for ${token.symbol}`);
                }

                // 添加详细日志检查statData内容
                this.logger.debug(`Preparing stat data for ${token.symbol}:`, {
                    tokenId: statData.tokenId,
                    statData: JSON.stringify(statData, null, 2)
                });

                // 使用upsert操作确保原子性
                const result = await this.repository.dailyStatRepo.upsert(statData, {
                    conflictPaths: ['tokenId', 'date'],
                    skipUpdateIfNoValuesChanged: true
                });
                
                this.logger.debug(`Upserted daily stat for ${token.symbol}:`, result);
                if (!result.identifiers[0]?.id) {
                    throw new Error(`Failed to upsert daily stat record for ${token.symbol}`);
                }

                tokenTimer.end();
                return true;
            } catch (error) {
                this.logger.error(`Failed to save daily stats for token ${token.symbol}`, error as Error);
                throw error;
            }
        } catch (error) {
            this.logger.error(`Error processing daily stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
