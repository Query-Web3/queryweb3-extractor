import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class WeeklyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {}

    public async processToken(token: DimToken) {
        this.logger.setLogLevel(process.env.LOGGER_LEVEL as LogLevel || LogLevel.INFO);
        const tokenTimer = this.logger.time(`Process weekly stats for token ${token.symbol}`);
        this.logger.info(`Processing weekly stats for token ${token.symbol} (${token.address})`);
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);

            // Get weekly events
            const weeklyEvents = await this.repository.eventRepo.createQueryBuilder('event')
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

            // Get token price from oracle (use default 1.0 if not available)
            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;

            // Get previous stats for comparisons
            const prevWeekStat = await this.repository.weeklyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setDate(today.getDate() - 14)) } 
            });
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setFullYear(today.getFullYear() - 1)) } 
            });

            // Calculate YoY changes
            const volumeYoY = prevYearStat ? 
                ((weeklyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : undefined;
            const txnsYoY = prevYearStat ? 
                ((weeklyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : undefined;

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

            // Calculate QoQ changes
            const volumeQoQ = prevWeekStat ? 
                ((weeklyVolume - prevWeekStat.volume) / prevWeekStat.volume * 100) : 0;
            const txnsQoQ = prevWeekStat ? 
                ((weeklyTxns - prevWeekStat.txnsCount) / prevWeekStat.txnsCount * 100) : 0;

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

            const existingWeeklyStat = await this.repository.weeklyStatRepo.findOne({
                where: { tokenId: tokenRecord.id, date: today }
            });

            if (!existingWeeklyStat) {
                this.logger.debug(`Inserting new weekly stat record for ${token.symbol}`, {
                    ...weeklyStat,
                    tokenSymbol: tokenRecord.symbol,
                    tokenAddress: tokenRecord.address
                });
                const result = await this.repository.weeklyStatRepo.insert(weeklyStat);
                if (!result.identifiers[0]?.id) {
                    throw new Error(`Failed to insert weekly stat record for ${token.symbol}`);
                }
            } else if (existingWeeklyStat.id) {
                this.logger.debug(`Updating existing weekly stat record for ${token.symbol}`, weeklyStat);
                const result = await this.repository.weeklyStatRepo.update(existingWeeklyStat.id, weeklyStat);
                if (result.affected === 0) {
                    throw new Error(`Failed to update weekly stat record for ${token.symbol}`);
                }
            } else {
                throw new Error(`Existing weekly stat record has no ID for ${token.symbol}`);
            }

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing weekly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
