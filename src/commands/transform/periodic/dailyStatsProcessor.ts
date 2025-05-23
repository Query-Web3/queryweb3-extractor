import { TokenStatsRepository } from '../token/tokenStatsRepository';
import { Logger, LogLevel } from '../../../utils/logger';
import { TokenService } from '../token/TokenService';
import { getTokenPriceFromOracle } from '../utils';
import { DimToken } from '../../../entities/DimToken';
import { FactTokenDailyStat } from '../../../entities/FactTokenDailyStat';
import { DataSource, QueryRunner } from 'typeorm';

export class DailyStatsProcessor {
    constructor(
        private repository: TokenStatsRepository, 
        private logger: Logger,
        private tokenService: TokenService
    ) {
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async processAllTokens() {
        const timer = this.logger.time('Process daily stats for all tokens');
        this.logger.info('Processing daily stats for all tokens');
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // 1. 获取数据源确保连接正常
            const dataSource = this.repository.eventRepo.manager.connection;
            if (!dataSource.isInitialized) {
                await dataSource.initialize();
            }

            // 2. 创建事务
            const queryRunner = dataSource.createQueryRunner();
            await queryRunner.connect();
            await queryRunner.startTransaction();

            try {
                // 3. 按天聚合所有token的区块数据 - 使用repository的queryBuilder
                const dailyEvents = await this.repository.eventRepo
                    .createQueryBuilder('event')
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

                // 4. 按token分组计算日统计
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

                // 5. 保存所有token的日统计
                const tokens = await queryRunner.manager.find(DimToken);
                for (const token of tokens) {
                    const stats = tokenStats.get(token.address);
                    if (!stats) continue;
                    
                    await this.processTokenStats(queryRunner, token, stats.volume, stats.txns, today);
                }

                // 6. 提交事务
                await queryRunner.commitTransaction();
                timer.end();
                return true;
            } catch (error) {
                // 7. 回滚事务
                await queryRunner.rollbackTransaction();
                this.logger.error('Transaction rolled back', error as Error);
                throw error;
            } finally {
                // 8. 释放连接
                await queryRunner.release();
            }
        } catch (error) {
            this.logger.error('Error processing daily stats for all tokens', error as Error);
            return false;
        }
    }

    private async processTokenStats(
        queryRunner: QueryRunner,
        token: DimToken,
        volume: number,
        txns: number,
        date: Date
    ): Promise<boolean> {
        try {
            // 1. 获取token价格
            const tokenPrice = await getTokenPriceFromOracle(token.address) ?? 1.0;
            const safeTokenPrice = isFinite(tokenPrice) ? tokenPrice : 1.0;

            // 2. 准备统计数据
            const statData = {
                tokenId: token.id,
                date,
                volume: isFinite(volume) ? volume : 0,
                volumeUsd: isFinite(volume * safeTokenPrice) ? volume * safeTokenPrice : 0,
                txnsCount: txns,
                priceUsd: safeTokenPrice
            };

            // 3. 使用事务保存数据
            const result = await queryRunner.manager
                .createQueryBuilder()
                .insert()
                .into(FactTokenDailyStat)
                .values(statData)
                .orUpdate(['volume', 'volume_usd', 'txns_count', 'price_usd'], ['token_id', 'date'])
                .execute();

            // 4. 验证写入结果
            if (!result.identifiers?.length) {
                throw new Error(`Failed to save daily stats for token ${token.symbol}`);
            }

            return true;
        } catch (error) {
            this.logger.error(`Error saving daily stats for token ${token.symbol}`, error as Error);
            return false;
        }
    }

    private extractTokenAddress(event: any): string | null {
        if (event.data?.currencyId) return event.data.currencyId;
        if (event.data?.token) return event.data.token;
        if (event.data?.assetId) return event.data.assetId;
        return null;
    }

    public async processToken(token: DimToken): Promise<boolean> {
        const dataSource = this.repository.eventRepo.manager.connection;
        if (!dataSource.isInitialized) {
            await dataSource.initialize();
        }

        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // 获取当日交易数据 - 使用repository的queryBuilder
            const events = await this.repository.eventRepo
                .createQueryBuilder('event')
                .leftJoinAndSelect('event.block', 'block')
                .where(`(
                    (event.section = 'Tokens' AND event.method = 'Transfer') OR
                    (event.section = 'Balances' AND event.method = 'Transfer') OR
                    (event.section = 'Dex' AND event.method = 'Swap')
                )`)
                .andWhere('event.data LIKE :tokenLike', { tokenLike: `%"${token.address}"%` })
                .andWhere('block.timestamp >= :start AND block.timestamp < :end', {
                    start: today,
                    end: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                })
                .getMany();

            // 计算交易量和交易数
            const volume = events.reduce((sum, event) => {
                let amount = 0;
                if (event.section === 'Dex' && event.method === 'Swap') {
                    amount = parseFloat(event.data.amountIn || '0') + parseFloat(event.data.amountOut || '0');
                } else if (event.data.amount) {
                    amount = parseFloat(event.data.amount);
                }
                return sum + amount;
            }, 0);

            const txns = events.length;

            // 保存统计数据
            await this.processTokenStats(queryRunner, token, volume, txns, today);
            await queryRunner.commitTransaction();
            return true;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Error processing daily stats for token ${token.symbol}`, error as Error);
            return false;
        } finally {
            await queryRunner.release();
        }
    }
}
