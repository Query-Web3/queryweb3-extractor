import { initializeDataSource } from './dataSource';
import { Logger, LogLevel } from '../../utils/logger';
import { TokenStatsRepository } from './tokenStatsRepository';
import { DailyStatsProcessor } from './dailyStatsProcessor';
import { WeeklyStatsProcessor } from './weeklyStatsProcessor';
import { MonthlyStatsProcessor } from './monthlyStatsProcessor';
import { YearlyStatsProcessor } from './yearlyStatsProcessor';
import { DimToken } from '../../entities/DimToken';

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
            // Process all stats in parallel
            await Promise.all([
                dailyProcessor.processToken(token),
                weeklyProcessor.processToken(token),
                monthlyProcessor.processToken(token),
                yearlyProcessor.processToken(token)
            ]);
        } catch (error) {
            logger.error(`Error processing token ${token.symbol}`, error as Error);
            continue;
        }
    }
    
    logger.info('Finished processing all token stats');
    statsTimer.end();
}
