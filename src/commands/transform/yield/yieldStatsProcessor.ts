import { Logger } from '../../../utils/logger';
import { DimToken } from '../../../entities/DimToken';
import { DimReturnType } from '../../../entities/DimReturnType';
import { DataSource } from 'typeorm';
import { YieldStatsService } from './YieldStatsService';
import { YieldStatsRepository } from './YieldStatsRepository';
import { YieldStatsCalculator } from './YieldStatsCalculator';
import { FactYieldStat } from '../../../entities/FactYieldStat';
import { ApiConnectorFactory } from '../../common/ApiConnectorFactory';

export class YieldStatsProcessor {
  private service: YieldStatsService;
  private repository: YieldStatsRepository;
  private calculator: YieldStatsCalculator;

  constructor(
    private dataSource: DataSource,
    private logger: Logger = Logger.getInstance()
  ) {
    this.service = new YieldStatsService(dataSource, logger);
    this.repository = new YieldStatsRepository(dataSource, logger);
    this.calculator = new YieldStatsCalculator(logger);
  }


  async processToken(token: DimToken): Promise<void> {
    try {
      // Process daily stats
      await this.processDailyStats(token);
      
      // Process weekly stats (only on Sundays)
      if (new Date().getDay() === 0) {
        await this.processWeeklyStats(token);
      }
      
      // Process monthly stats (only on last day of month)
      const today = new Date();
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      if (today.getDate() === lastDay) {
        await this.processMonthlyStats(token);
      }
      
      // Process yearly stats (only on last day of year)
      if (today.getMonth() === 11 && today.getDate() === 31) {
        await this.processYearlyStats(token);
      }
    } catch (error) {
      this.logger.error(`Failed to process yield stats for token ${token.id}`, error as Error);
      throw error;
    }
  }

  private async calculateAPY(token: DimToken): Promise<{apy: number}> {
    try {
      // Step 1: Get historical yield data
      const history = await this.repository.yieldStatRepo.find({
        where: { token: { id: token.id } },
        order: { date: 'DESC' },
        take: 30 // Get last 30 days data
      });

      // Step 2: Calculate 7-day average yield
      let apy = 0;
      if (history.length > 0) {
        const recent = history.slice(0, Math.min(7, history.length));
        const avgDailyYield = recent.reduce((sum: number, stat: FactYieldStat) => sum + (stat.apy / 365), 0) / recent.length;
        
        // Step 3: Annualize with compounding
        apy = (Math.pow(1 + avgDailyYield, 365) - 1) * 100;
      } else {
        this.logger.warn(`No historical data found for token ${token.id}, using default APY`);
        apy = 5; // Default APY when no history
      }
      
      // Step 4: Comprehensive risk assessment
      let riskFactors = {
        age: 1.0,
        liquidity: 1.0,
        audits: 1.0,
        tvl: 1.0
      };
      
      // Age factor
      const createdAt = token.createdAt instanceof Date ? token.createdAt : new Date(token.createdAt);
      const tokenAgeDays = (new Date().getTime() - createdAt.getTime()) / (1000 * 3600 * 24);
      riskFactors.age = tokenAgeDays < 180 ? 0.8 : tokenAgeDays < 365 ? 0.9 : 1.0;
      
      // Liquidity factor (simplified - would normally query DEX pools)
      const liquidityScore = await this.getLiquidityScore(token.address);
      riskFactors.liquidity = liquidityScore < 0.5 ? 0.8 : liquidityScore < 0.8 ? 0.9 : 1.0;
      
      // Audit factor (simplified - would check audit reports)
      const hasAudits = await this.checkTokenAudits(token.address);
      riskFactors.audits = hasAudits ? 1.0 : 0.85;
      
      // TVL factor (use existing TVL data)
      const tvlData = await this.calculateTVL(token);
      riskFactors.tvl = tvlData.tvlUsd < 1000000 ? 0.9 : 1.0;
      
      // Calculate weighted risk factor
      const weights = { age: 0.3, liquidity: 0.3, audits: 0.2, tvl: 0.2 };
      const riskFactor = 
        riskFactors.age * weights.age +
        riskFactors.liquidity * weights.liquidity +
        riskFactors.audits * weights.audits +
        riskFactors.tvl * weights.tvl;

      let finalApy = 0;
      try {
        const riskAdjustedApy = apy * riskFactor;
        this.logger.debug(`APY risk adjustment for token ${token.id}`, {
          rawApy: apy,
          riskFactor,
          adjustedApy: riskAdjustedApy,
          tokenAgeDays
        });

        // Ensure valid APY value with reasonable limits
        finalApy = Number.isFinite(riskAdjustedApy) ? riskAdjustedApy : 0;
        if (!Number.isFinite(finalApy)) {
          this.logger.warn(`Invalid APY calculated for token ${token.id}, using 0 as fallback`);
          finalApy = 0;
        }
        
        // Apply reasonable APY limits (0-1000%)
        if (finalApy < 0) {
          finalApy = 0;
        } else if (finalApy > 1000) {
          this.logger.warn(`APY ${finalApy}% exceeds maximum allowed value, capping at 1000%`);
          finalApy = 1000;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(`APY calculation error for token ${token.id}`, error);
        } else {
          this.logger.error(`APY calculation error for token ${token.id}`, new Error(String(error)));
        }
        finalApy = 0;
      }

      return { apy: finalApy };
    } catch (error) {
      this.logger.error(`Failed to calculate APY for token ${token.id}`, error as Error);
      throw error; // Throw error instead of returning default value
    }
  }

  private async getLiquidityScore(tokenAddress: string): Promise<number> {
    // Simplified implementation - would normally query DEX pools
    // Returns a score between 0-1 based on liquidity depth
    return 0.7; // Default value
  }

  private async checkTokenAudits(tokenAddress: string): Promise<boolean> {
    // Simplified implementation - would query audit databases
    // Returns true if token has at least one audit
    return true; // Default value
  }

  private async processDailyStats(token: DimToken): Promise<void> {
    const today = new Date();
    
    // Get or create daily stat
    const existingStat = await this.repository.findExistingDailyStat(token.id, today);
    const yieldStat = existingStat || new FactYieldStat();
    
    // Set basic stat info
    yieldStat.token = token;
    yieldStat.date = today;
    yieldStat.poolAddress = token.address;
    
    // Get return type
    const returnType = await this.dataSource.getRepository<DimReturnType>('DimReturnType')
      .findOne({ where: { id: 1 }, relations: ['yieldStats'] });
    if (!returnType) throw new Error('Default return type not found');
    yieldStat.returnType = returnType;
    
    // Calculate APY using service
    const history = await this.repository.yieldStatRepo.find({
      where: { token: { id: token.id } },
      order: { date: 'DESC' },
      take: 30
    });
    const { apy } = await this.calculator.calculateAPY(history);
    yieldStat.apy = apy;
    
    // Calculate TVL using service
    const totalSupply = await this.service.getTokenTotalSupply(token.id);
    const lockedRatio = await this.service.getLockedRatio(token.address);
    const usdRate = await this.service.getTokenPrice(token.id);
    const tvlData = await this.calculator.calculateTVL(totalSupply, lockedRatio, usdRate);
    yieldStat.tvl = tvlData.tvl;
    yieldStat.tvlUsd = tvlData.tvlUsd;
    
    // Validate data
    if (yieldStat.apy < 0 || yieldStat.apy > 1000) {
      throw new Error(`Invalid APY value: ${yieldStat.apy}`);
    }
    if (yieldStat.tvl < 0) {
      throw new Error(`Invalid TVL value: ${yieldStat.tvl}`);
    }

    // Save the stat
    await this.repository.saveDailyStat(yieldStat);
  }

  private async processWeeklyStats(token: DimToken): Promise<void> {
    // Delegate to service layer
    await this.service.processWeeklyStats(token);
  }

  private async processMonthlyStats(token: DimToken): Promise<void> {
    // Delegate to service layer
    await this.service.processMonthlyStats(token);
  }

  private async processYearlyStats(token: DimToken): Promise<void> {
    // Delegate to service layer
    await this.service.processYearlyStats(token);
  }

  private async calculateTVL(token: DimToken): Promise<{tvl: number, tvlUsd: number}> {
    try {
      // Step 1: Get token total supply from database
      const totalSupply = await this.service.getTokenTotalSupply(token.id);
      if (!totalSupply) {
        throw new Error(`Cannot get total supply for token ${token.id}`);
      }
      
      // Step 2: Get locked ratio from staking contract
      const lockedRatio = await this.service.getLockedRatio(token.address);
      if (lockedRatio <= 0 || lockedRatio > 1) {
        throw new Error(`Invalid locked ratio: ${lockedRatio}`);
      }
      
      // Step 3: Calculate TVL
      const tvl = totalSupply * lockedRatio;
      
      // Step 4: Convert to USD using price oracle
      const usdRate = await this.service.getTokenPrice(token.id);
      const tvlUsd = tvl * usdRate;

      // Ensure valid TVL values
      const finalTvl = Number.isFinite(tvl) ? parseFloat(tvl.toFixed(2)) : 0;
      const finalTvlUsd = Number.isFinite(tvlUsd) ? parseFloat(tvlUsd.toFixed(2)) : 0;
      
      if (!Number.isFinite(finalTvl) || !Number.isFinite(finalTvlUsd)) {
        this.logger.warn(`Invalid TVL values calculated for token ${token.id}, using 0 as fallback`);
      }

      return { 
        tvl: finalTvl,
        tvlUsd: finalTvlUsd
      };
    } catch (error) {
      this.logger.error(`Failed to calculate TVL for token ${token.id}`, error as Error);
      throw error; // Re-throw to let caller handle the error
    }
  }
}
