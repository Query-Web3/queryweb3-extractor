import { initializeDataSource } from '../dataSource';
import { Logger, LogLevel } from '../../../utils/logger';
import { TokenStatsRepository } from './tokenStatsRepository';
import { DailyStatsProcessor } from '../periodic/dailyStatsProcessor';
import { WeeklyStatsProcessor } from '../periodic/weeklyStatsProcessor';
import { MonthlyStatsProcessor } from '../periodic/monthlyStatsProcessor';
import { YearlyStatsProcessor } from '../periodic/yearlyStatsProcessor';
import { DimToken } from '../../../entities/DimToken';

export async function processTokenStats() {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const statsTimer = logger.time('Process token stats');
    const dataSource = await initializeDataSource();
    
    // Initialize repositories and processors
    const repository = new TokenStatsRepository(dataSource);
    await repository.initialize();
    
    const dailyProcessor = new DailyStatsProcessor(repository, logger);
    const weeklyProcessor = new WeeklyStatsProcessor(repository, logger);
    const monthlyProcessor = new MonthlyStatsProcessor(repository, logger);
    const yearlyProcessor = new YearlyStatsProcessor(repository, logger);

    const tokens = await repository.tokenRepo.find();
    logger.info(`Processing stats for ${tokens.length} tokens`);
    
    for (const token of tokens) {
        try {
            // Process stats sequentially with retry
            const processors = [
                () => dailyProcessor.processToken(token),
                () => weeklyProcessor.processToken(token),
                () => monthlyProcessor.processToken(token),
                () => yearlyProcessor.processToken(token)
            ];

            for (const processor of processors) {
                let retries = 3;
                while (retries > 0) {
                    try {
                        await processor();
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) {
                            throw error;
                        }
                        logger.warn(`Retrying (${retries} left) for token ${token.symbol}`, error as Error);
                        await new Promise(resolve => setTimeout(resolve, 100 * (4 - retries)));
                    }
                }
            }
        } catch (error) {
            logger.error(`Error processing token ${token.symbol}`, error as Error);
            continue;
        }
    }
    
    logger.info('Finished processing all token stats');
    statsTimer.end();
}
