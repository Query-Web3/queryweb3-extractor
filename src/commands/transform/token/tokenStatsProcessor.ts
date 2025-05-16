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

    // 1. 先处理所有token的日统计（按天聚合）
    await dailyProcessor.processAllTokens();
    
    // 2. 获取所有token列表
    const tokens = await repository.tokenRepo.find();
    logger.info(`Processing weekly/monthly/yearly stats for ${tokens.length} tokens`);
    
    // 3. 基于日统计结果处理周统计
    await weeklyProcessor.processAllTokens();
    
    // 4. 基于周统计结果处理月统计
    await monthlyProcessor.processAllTokens();
    
    // 5. 基于月统计结果处理年统计
    await yearlyProcessor.processAllTokens();
    
    logger.info('Finished processing all token stats');
    statsTimer.end();
}
