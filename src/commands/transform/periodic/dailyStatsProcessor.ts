import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class DailyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {}

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
                    (event.section = 'Tokens' AND event.method = 'Transfer' AND JSON_EXTRACT(event.data, '$.currencyId') = :tokenAddress) OR
                    (event.section = 'Balances' AND event.method = 'Transfer' AND JSON_EXTRACT(event.data, '$.currencyId') = :tokenAddress) OR
                    (event.section = 'Dex' AND event.method = 'Swap' AND JSON_CONTAINS(event.data, :tokenAddress, '$.path')) OR
                    (event.section = 'Homa' AND event.method = 'Minted' AND JSON_EXTRACT(event.data, '$.currencyId') = :tokenAddress) OR
                    (event.section = 'Homa' AND event.method = 'Redeemed' AND JSON_EXTRACT(event.data, '$.currencyId') = :tokenAddress) OR
                    (event.section = 'Rewards' AND event.method = 'Reward' AND JSON_EXTRACT(event.data, '$.currencyId') = :tokenAddress)
                )`, { tokenAddress: token.address })
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
            let tokenPrice = 1.0;
            try {
                const price = await getTokenPriceFromOracle(token.address);
                if (price !== null && price !== undefined) {
                    tokenPrice = price;
                }
            } catch (error) {
                this.logger.warn(`Failed to get price for token ${token.symbol}, using default 1.0`, error as Error);
            }
            
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

            // Calculate YoY/QoQ changes
            const volumeYoY = prevYearStat ? 
                ((dailyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
            const volumeQoQ = prevDayStat ? 
                ((dailyVolume - prevDayStat.volume) / prevDayStat.volume * 100) : 0;
            const txnsYoY = prevYearStat ? 
                ((dailyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;

            // Get or create today's stat
            const existingStat = await this.repository.dailyStatRepo.findOne({
                where: { tokenId: token.id, date: today }
            });

            try {
                // First ensure token exists in dim_tokens table
                const tokenRecord = await this.repository.tokenRepo.findOne({ 
                    where: { id: token.id } 
                });
                if (!tokenRecord) {
                    throw new Error(`Token with ID ${token.id} not found in dim_tokens table`);
                }

                // Calculate txns_qoq based on previous day's stats
                const txnsQoQ = prevDayStat ? 
                    ((dailyTxns - prevDayStat.txnsCount) / prevDayStat.txnsCount * 100) : 0;

                const statData = {
                    token_id: tokenRecord.id, // Use the ID from dim_tokens
                    date: today,
                    cycle_id: this.repository.dailyCycle?.id,
                    volume: dailyVolume,
                    volume_usd: dailyVolume * tokenPrice,
                    txns_count: dailyTxns,
                    price_usd: tokenPrice,
                    volume_yoy: volumeYoY,
                    volume_qoq: volumeQoQ,
                    txns_yoy: txnsYoY,
                    txns_qoq: txnsQoQ,
                    volume_wow: prevWeekStat ?
                        ((dailyVolume - prevWeekStat.volume) / prevWeekStat.volume * 100) : 0,
                    volume_mom: prevMonthStat ?
                        ((dailyVolume - prevMonthStat.volume) / prevMonthStat.volume * 100) : 0
                };

                if (!existingStat) {
                    this.logger.debug(`Inserting new daily stat record for ${token.symbol}`, {
                        ...statData,
                        token_symbol: tokenRecord.symbol,
                        token_address: tokenRecord.address
                    });
                    const result = await this.repository.dailyStatRepo.insert(statData);
                    if (!result.identifiers[0]?.id) {
                        throw new Error(`Failed to insert daily stat record for ${token.symbol}`);
                    }
                } else if (existingStat.id) {
                    this.logger.debug(`Updating existing daily stat record for ${token.symbol}`, statData);
                    const result = await this.repository.dailyStatRepo.update(existingStat.id, statData);
                    if (result.affected === 0) {
                        throw new Error(`Failed to update daily stat record for ${token.symbol}`);
                    }
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
