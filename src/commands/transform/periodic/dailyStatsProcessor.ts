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
            const events = await this.repository.eventRepo.find({
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

            // Get token price from oracle (use default 1.0 if not available)
            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;
            
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

            const statData = {
                token_id: token.id,
                date: today,
                cycle_id: this.repository.dailyCycle?.id,
                volume: dailyVolume,
                volume_usd: dailyVolume * tokenPrice,
                txns_count: dailyTxns,
                price_usd: tokenPrice,
                volume_yoy: volumeYoY,
                volume_qoq: volumeQoQ,
                txns_yoy: txnsYoY,
                volume_wow: prevWeekStat ?
                    ((dailyVolume - prevWeekStat.volume) / prevWeekStat.volume * 100) : 0,
                volume_mom: prevMonthStat ?
                    ((dailyVolume - prevMonthStat.volume) / prevMonthStat.volume * 100) : 0
            };

            if (!existingStat) {
                this.logger.debug(`Inserting new daily stat record for ${token.symbol}`, statData);
                await this.repository.dailyStatRepo.insert(statData);
            } else {
                this.logger.debug(`Updating existing daily stat record for ${token.symbol}`, statData);
                await this.repository.dailyStatRepo.update(existingStat.id, statData);
            }

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing daily stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
