import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class YearlyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
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
                volume: yearlyVolume,
                volumeUsd: yearlyVolume * tokenPrice,
                txnsCount: yearlyTxns,
                priceUsd: tokenPrice,
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
