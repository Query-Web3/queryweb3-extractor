import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';
import { FactTokenMonthlyStat } from '../../../entities/FactTokenMonthlyStat';
import { TokenService } from '../token/TokenService';

export class YearlyStatsProcessor {
    constructor(
        private repository: TokenStatsRepository, 
        private logger: Logger,
        private tokenService: TokenService
    ) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async processAllTokens() {
        const timer = this.logger.time('Process yearly stats for all tokens');
        this.logger.info('Processing yearly stats for all tokens');
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yearStart = new Date(today);
            yearStart.setFullYear(yearStart.getFullYear() - 1);

            // 1. 获取所有token
            const tokens = await this.repository.tokenRepo.find();
            
            // 2. 为每个token计算年统计
            for (const token of tokens) {
                try {
                    // 查询过去12个月的月统计数据
                    const monthlyStats = await this.repository.monthlyStatRepo
                        .createQueryBuilder('stat')
                        .where('stat.token_id = :tokenId', { tokenId: token.id })
                        .andWhere('stat.date BETWEEN :start AND :end', {
                            start: yearStart,
                            end: today
                        })
                        .getMany();

                    // 计算年统计 - 直接从月统计数据累加
                    const yearlyVolume = monthlyStats.reduce((sum: number, stat: FactTokenMonthlyStat) => {
                        return sum + (stat.volume || 0);
                    }, 0);
                    const yearlyTxns = monthlyStats.reduce((sum: number, stat: FactTokenMonthlyStat) => sum + stat.txnsCount, 0);
                    // 计算平均价格，处理NaN情况
                    const avgPrice = monthlyStats.length > 0 ? 
                        monthlyStats.reduce((sum: number, stat: FactTokenMonthlyStat) => sum + (stat.priceUsd || 0), 0) / monthlyStats.length : 0;
                    const safeAvgPrice = isFinite(avgPrice) ? avgPrice : 0;

                    // 确保volumeUsd有效
                    const safeVolumeUsd = isFinite(yearlyVolume * avgPrice) ? yearlyVolume * avgPrice : 0;

                    // 获取同比数据
                    const prevYearStart = new Date(yearStart);
                    prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
                    const prevYearEnd = new Date(today);
                    prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);

                    const prevYearStats = await this.repository.monthlyStatRepo
                        .createQueryBuilder('stat')
                        .select('SUM(stat.volume) as volume, SUM(stat.txnsCount) as txnsCount')
                        .where('stat.token_id = :tokenId', { tokenId: token.id })
                        .andWhere('stat.date BETWEEN :start AND :end', {
                            start: prevYearStart,
                            end: prevYearEnd
                        })
                        .getRawOne();

                    // 计算同比变化
                    const volumeYoY = prevYearStats?.volume ? 
                        ((yearlyVolume - prevYearStats.volume) / prevYearStats.volume * 100) : 0;
                    const txnsYoY = prevYearStats?.txnsCount ?
                        ((yearlyTxns - prevYearStats.txnsCount) / prevYearStats.txnsCount * 100) : 0;

                    // 保存年统计
                    const yearlyStat = {
                        tokenId: token.id,
                        date: today,
                        volume: yearlyVolume,
                        volumeUsd: safeVolumeUsd,
                        txnsCount: yearlyTxns,
                        priceUsd: safeAvgPrice,
                        volumeYoy: volumeYoY,
                        txnsYoy: txnsYoY
                    };

                    this.logger.debug(`Upserting yearly stats for token ${token.symbol} on ${today.toISOString().split('T')[0]}`);
                    const result = await this.repository.yearlyStatRepo.upsert(yearlyStat, {
                        conflictPaths: ['tokenId', 'date'],
                        skipUpdateIfNoValuesChanged: true,
                        upsertType: 'on-conflict-do-update'
                    });
                    
                    if (!result.identifiers?.length) {
                        throw new Error(`Failed to upsert yearly stat record for ${token.symbol}`);
                    }
                    this.logger.debug(`Yearly stats ${result.identifiers[0]?.id ? 'updated' : 'inserted'} for token ${token.symbol}`);
                } catch (error) {
                    this.logger.error(`Error processing yearly stats for token ${token.symbol}`, error as Error);
                    continue;
                }
            }

            timer.end();
            return true;
        } catch (error) {
            this.logger.error('Error processing yearly stats for all tokens', error as Error);
            return false;
        }
    }

    public async processToken(token: DimToken) {
        const tokenTimer = this.logger.time(`Process yearly stats for token ${token.symbol}`);
        this.logger.info(`Processing yearly stats for token ${token.symbol} (${token.address})`);
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const lastYear = new Date(today);
            lastYear.setFullYear(lastYear.getFullYear() - 1);

            // Get yearly events
            const yearlyEvents = await this.repository.eventRepo.createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where('(event.section = :section1 AND event.method = :method1 AND JSON_CONTAINS(event.data, :data1)) OR ' +
                       '(event.section = :section2 AND event.method = :method2 AND JSON_CONTAINS(event.data, :data2)) OR ' +
                       '(event.section = :section3 AND event.method = :method3 AND JSON_CONTAINS(event.data, :data3)) OR ' +
                       '(event.section = :section4 AND event.method = :method4 AND event.data IS NOT NULL AND JSON_CONTAINS(event.data, :data4))',
                    {
                        section1: 'Tokens', method1: 'Transfer', data1: JSON.stringify({ currencyId: token.address }),
                        section2: 'Balances', method2: 'Transfer', data2: JSON.stringify({ currencyId: token.address }),
                        section3: 'Dex', method3: 'Swap', data3: JSON.stringify({ currencyId: token.address }),
                        section4: 'Rewards', method4: 'Reward', data4: JSON.stringify({ currencyId: token.address })
                    })
                .andWhere('block.timestamp BETWEEN :start AND :end', { start: lastYear, end: today })
                .getMany();

            const yearlyVolume = yearlyEvents.reduce((sum: number, event: any) => {
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

            // 使用Redis计数器统计年交易数
            const redisKey = `token:${token.address}:yearly:txns:${today.toISOString().split('T')[0]}`;
            let yearlyTxns = yearlyEvents.length;
            
            try {
                const redisClient = this.tokenService['redisClient'];
                if (redisClient.isOpen) {
                    // 从Redis获取当前计数
                    const redisCount = await redisClient.get(redisKey);
                    if (redisCount) {
                        yearlyTxns += parseInt(redisCount);
                    }
                    // 更新Redis计数器
                    await redisClient.incrBy(redisKey, yearlyEvents.length);
                    // 设置365天过期
                    await redisClient.expire(redisKey, 31536000);
                }
            } catch (e) {
                this.logger.warn('Failed to update Redis counter, using direct count only', e as Error);
            }

            // Get token price from oracle (use default 1.0 if not available)
            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;
            const safeTokenPrice = isFinite(tokenPrice) ? tokenPrice : 1.0;

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

            // Get previous year's stats and calculate YoY changes
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: tokenRecord.id, date: new Date(today.setFullYear(today.getFullYear() - 2)) } 
            });
            
            // 检查数据完整性
            const hasFullYearData = prevYearStat && 
                (new Date().getTime() - prevYearStat.date.getTime()) > 365 * 24 * 60 * 60 * 1000;

            // 处理同比数据
            let volumeYoY = 0;
            let txnsYoY = 0;

            if (!hasFullYearData) {
                this.logger.warn(`Insufficient yearly data for ${token.symbol}, using 0% for YoY comparison`);
            } else {
                // Safe calculation with checks for zero and NaN
                const calculateChange = (current: number, previous: number) => {
                    if (previous === 0) return 0;
                    const change = ((current - previous) / previous) * 100;
                    return isFinite(change) ? change : 0;
                };

                volumeYoY = calculateChange(yearlyVolume, prevYearStat.volume);
                txnsYoY = calculateChange(yearlyTxns, prevYearStat.txnsCount);
            }

            const yearlyStat = {
                tokenId: tokenRecord.id,
                date: today,
                volume: isFinite(yearlyVolume) ? yearlyVolume : 0,
                volumeUsd: yearlyVolume * safeTokenPrice,
                txnsCount: yearlyTxns,
                priceUsd: safeTokenPrice,
                volumeYoy: volumeYoY,
                txnsYoy: txnsYoY
            };

            // Validate all numeric fields
            Object.entries(yearlyStat).forEach(([key, value]) => {
                if (typeof value === 'number' && !isFinite(value)) {
                    throw new Error(`Invalid ${key} value: ${value}`);
                }
            });

            // 使用upsert操作确保原子性
            const result = await this.repository.yearlyStatRepo.upsert(yearlyStat, {
                conflictPaths: ['tokenId', 'date'],
                skipUpdateIfNoValuesChanged: true
            });
            
            this.logger.debug(`Upserted yearly stat for ${token.symbol}:`, result);
            if (!result.identifiers[0]?.id) {
                throw new Error(`Failed to upsert yearly stat record for ${token.symbol}`);
            }

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing yearly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
