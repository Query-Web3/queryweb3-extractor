import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class MonthlyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {}

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
                    amount = parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
                } else if (event.data.amount) {
                    amount = parseFloat(event.data.amount);
                }
                return sum + amount;
            }, 0);

            const monthlyTxns = monthlyEvents.length;

            // Get token price from oracle or use default 1.0 if not available
            const tokenPrice = token.priceUsd ?? await getTokenPriceFromOracle(token.address) ?? 1.0;

            // Get previous stats for comparisons
            const prevMonthStat = await this.repository.monthlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setMonth(today.getMonth() - 2)) } 
            });
            const prevYearStat = await this.repository.yearlyStatRepo.findOne({ 
                where: { tokenId: token.id, date: new Date(today.setFullYear(today.getFullYear() - 1)) } 
            });

            // Calculate YoY changes
            const volumeYoY = prevYearStat ? 
                ((monthlyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
            const txnsYoY = prevYearStat ? 
                ((monthlyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;

            const monthlyStat = {
                tokenId: token.id,
                date: today,
                cycleId: this.repository.monthlyCycle?.id,
                volume: monthlyVolume,
                volumeUsd: monthlyVolume * tokenPrice,
                txnsCount: monthlyTxns,
                priceUsd: tokenPrice,
                volumeYoY,
                txnsYoY
            };

            const existingMonthlyStat = await this.repository.monthlyStatRepo.findOne({
                where: { tokenId: token.id, date: today }
            });

            if (!existingMonthlyStat) {
                this.logger.debug(`Inserting new monthly stat record for ${token.symbol}`, monthlyStat);
                await this.repository.monthlyStatRepo.insert(monthlyStat);
            } else {
                this.logger.debug(`Updating existing monthly stat record for ${token.symbol}`, monthlyStat);
                await this.repository.monthlyStatRepo.update(existingMonthlyStat.id, monthlyStat);
            }

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing monthly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
