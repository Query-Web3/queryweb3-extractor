import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';

export class YearlyStatsProcessor {
    constructor(private repository: TokenStatsRepository, private logger: Logger) {}

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
                .where('(event.section = :section1 AND event.method = :method1 AND event.data LIKE :data1) OR ' +
                       '(event.section = :section2 AND event.method = :method2 AND event.data LIKE :data2) OR ' +
                       '(event.section = :section3 AND event.method = :method3 AND event.data LIKE :data3)',
                    {
                        section1: 'Tokens', method1: 'Transfer', data1: `%${token.address}%`,
                        section2: 'Balances', method2: 'Transfer', data2: `%${token.address}%`, 
                        section3: 'Dex', method3: 'Swap', data3: `%${token.address}%`
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
            const volumeYoY = prevYearStat ? 
                ((yearlyVolume - prevYearStat.volume) / prevYearStat.volume * 100) : 0;
            const txnsYoY = prevYearStat ? 
                ((yearlyTxns - prevYearStat.txnsCount) / prevYearStat.txnsCount * 100) : 0;

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

            const existingYearlyStat = await this.repository.yearlyStatRepo.findOne({
                where: { tokenId: token.id, date: today }
            });

            if (!existingYearlyStat) {
                this.logger.debug(`Inserting new yearly stat record for ${token.symbol}`, yearlyStat);
                await this.repository.yearlyStatRepo.insert(yearlyStat);
            } else {
                this.logger.debug(`Updating existing yearly stat record for ${token.symbol}`, yearlyStat);
                await this.repository.yearlyStatRepo.update(existingYearlyStat.id, yearlyStat);
            }

            tokenTimer.end();
            return true;
        } catch (error) {
            this.logger.error(`Error processing yearly stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }
}
