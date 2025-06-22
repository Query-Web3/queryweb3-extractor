import { DimToken } from '../../../entities/DimToken';
import { FactYieldStat } from '../../../entities/FactYieldStat';
import { Logger } from '../../../utils/logger';

export class YieldStatsCalculator {
  constructor(
    private logger: Logger = Logger.getInstance()
  ) {}

  async calculateAPY(history: FactYieldStat[]): Promise<{apy: number}> {
    if (history.length === 0) {
      this.logger.warn('No historical data found, using default APY');
      return { apy: 5 }; // Default APY when no history
    }

    // Calculate 7-day average yield
    const recent = history.slice(0, Math.min(7, history.length));
    const avgDailyYield = recent.reduce((sum, stat) => sum + (stat.apy / 365), 0) / recent.length;
    
    // Annualize with compounding
    let apy = (Math.pow(1 + avgDailyYield, 365) - 1) * 100;

    // Apply risk factors if token data exists
    apy = history[0].token ? await this.applyRiskFactors(apy, history[0].token) : apy;

    // Ensure valid APY value
    return { apy: this.validateAPY(apy) };
  }

  private async applyRiskFactors(apy: number, token: DimToken): Promise<number> {
    const riskFactors = {
      age: 1.0,
      liquidity: 1.0,
      audits: 1.0,
      tvl: 1.0
    };
    
    // Age factor
    const createdAt = token.createdAt instanceof Date ? token.createdAt : new Date(token.createdAt);
    const tokenAgeDays = (new Date().getTime() - createdAt.getTime()) / (1000 * 3600 * 24);
    riskFactors.age = tokenAgeDays < 180 ? 0.8 : tokenAgeDays < 365 ? 0.9 : 1.0;
    
    // Calculate weighted risk factor
    const weights = { age: 0.3, liquidity: 0.3, audits: 0.2, tvl: 0.2 };
    const riskFactor = 
      riskFactors.age * weights.age +
      riskFactors.liquidity * weights.liquidity +
      riskFactors.audits * weights.audits +
      riskFactors.tvl * weights.tvl;

    return apy * riskFactor;
  }

  private validateAPY(apy: number): number {
    if (!Number.isFinite(apy)) {
      this.logger.warn('Invalid APY calculated, using 0 as fallback');
      return 0;
    }
    
    // Apply reasonable APY limits (0-1000000%)
    if (apy < 0) return 0;
    if (apy > 1000000) {
      this.logger.warn(`APY ${apy}% exceeds maximum allowed value, capping at 1000000%`);
      return 1000000;
    }
    
    return apy;
  }

  async calculateTVL(totalSupply: number, lockedRatio: number, usdRate: number): Promise<{tvl: number, tvlUsd: number}> {
    const tvl = totalSupply * lockedRatio;
    const tvlUsd = tvl * usdRate;

    return {
      tvl: Number.isFinite(tvl) ? parseFloat(tvl.toFixed(2)) : 0,
      tvlUsd: Number.isFinite(tvlUsd) ? parseFloat(tvlUsd.toFixed(2)) : 0
    };
  }
}
