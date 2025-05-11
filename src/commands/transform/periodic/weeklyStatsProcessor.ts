import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class WeeklyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {}

    public async processToken(token: DimToken) {
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
                ((weeklyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
            const txnsYoY = prevYearStat ? 
                ((weeklyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;

            const weeklyStat = {
                tokenId: token.id,
                date: today,
                cycleId: this.repository.weeklyCycle?.id,
                volume: weeklyVolume,
                volumeUsd: weeklyVolume * tokenPrice,
                txnsCount: weeklyTxns,
                priceUsd: tokenPrice,
                volumeYoY,
                txnsYoY
            };

            const existingWeeklyStat = await this.repository.weeklyStatRepo.findOne({
                where: { tokenId: token.id, date: today }
            });

            if (!existingWeeklyStat) {
                this.logger.debug(`Inserting new weekly stat record for ${token.symbol}`, weeklyStat);
                await this.repository.weeklyStatRepo.insert(weeklyStat);
            } else {
                this.logger.debug(`Updating existing weekly stat record for ${token.symbol}`, weeklyStat);
                await this.repository.weeklyStatRepo.update(existingWeeklyStat.id, weeklyStat);
            }

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing weekly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
