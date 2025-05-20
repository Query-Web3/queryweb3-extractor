import { FactYieldStat } from '../../../entities/FactYieldStat';
import { Logger } from '../../../utils/logger';
import { DimToken } from '../../../entities/DimToken';
import { DataSource } from 'typeorm';

export class YieldStatsProcessor {
  constructor(
    private dataSource: DataSource,
    private logger: Logger = Logger.getInstance()
  ) {}

  private async getTokenTotalSupply(tokenId: number): Promise<number> {
    // Implementation to get total supply from database
    const token = await this.dataSource.getRepository(DimToken).findOne({
      where: { id: tokenId }
    });
    return (token as any)?.totalSupply || 0;
  }

  private async getLockedRatio(contractAddress: string): Promise<number> {
    // Implementation to query staking contract for locked ratio
    // This would typically call a blockchain RPC
    // For now returning a default value
    return 0.7;
  }

  private async getTokenPrice(tokenId: number): Promise<number> {
    // Implementation to get price from price oracle
    const token = await this.dataSource.getRepository(DimToken).findOne({
      where: { id: tokenId }
    });
    return (token as any)?.priceUsd || 1;
  }

  get yieldStatRepo() {
    return this.dataSource.getRepository(FactYieldStat);
  }

  async processToken(token: DimToken): Promise<void> {
    try {
      const yieldStat = new FactYieldStat();
      yieldStat.token = token;
      yieldStat.date = new Date();
      
      // 1. Calculate APY (Annual Percentage Yield)
      const apyData = await this.calculateAPY(token);
      yieldStat.apy = apyData.apy;
      
      // 2. Calculate TVL (Total Value Locked)
      const tvlData = await this.calculateTVL(token);
      yieldStat.tvl = tvlData.tvl;
      yieldStat.tvlUsd = tvlData.tvlUsd;
      
      // 3. Data validation
      if (yieldStat.apy < 0 || yieldStat.apy > 1000) {
        throw new Error(`Invalid APY value: ${yieldStat.apy}`);
      }
      
      if (yieldStat.tvl < 0) {
        throw new Error(`Invalid TVL value: ${yieldStat.tvl}`);
      }

      await this.yieldStatRepo.save(yieldStat);
      this.logger.debug(`Processed yield stats for token ${token.id}`, {
        apy: yieldStat.apy,
        tvl: yieldStat.tvl,
        tvlUsd: yieldStat.tvlUsd
      });
    } catch (error) {
      this.logger.error(`Failed to process yield stats for token ${token.id}`, error as Error);
      throw error;
    }
  }

  private async calculateAPY(token: DimToken): Promise<{apy: number}> {
    try {
      // 1. Get historical yield data
      const history = await this.yieldStatRepo.find({
        where: { token: { id: token.id } },
        order: { date: 'DESC' },
        take: 30 // Get last 30 days data
      });

      // 2. Calculate 7-day average yield
      const recent = history.slice(0, 7);
      const avgDailyYield = recent.reduce((sum: number, stat: FactYieldStat) => sum + (stat.apy / 365), 0) / recent.length;

      // 3. Annualize with compounding
      const apy = (Math.pow(1 + avgDailyYield, 365) - 1) * 100;
      
      // 4. Risk adjustment (simple example)
      const riskAdjustedApy = apy * 0.9; // 10% risk discount

      return { apy: riskAdjustedApy };
    } catch (error) {
      this.logger.error(`Failed to calculate APY for token ${token.id}`, error as Error);
      throw error; // Throw error instead of returning default value
    }
  }

  private async calculateTVL(token: DimToken): Promise<{tvl: number, tvlUsd: number}> {
    try {
      // 1. Get token total supply from database
      const totalSupply = await this.getTokenTotalSupply(token.id);
      if (!totalSupply) {
        throw new Error(`Cannot get total supply for token ${token.id}`);
      }
      
      // 2. Get locked ratio from staking contract
      const lockedRatio = await this.getLockedRatio(token.contractAddress);
      if (lockedRatio <= 0 || lockedRatio > 1) {
        throw new Error(`Invalid locked ratio: ${lockedRatio}`);
      }
      
      // 3. Calculate TVL
      const tvl = totalSupply * lockedRatio;
      
      // 4. Convert to USD using price oracle
      const usdRate = await this.getTokenPrice(token.id);
      const tvlUsd = tvl * usdRate;

      return { 
        tvl: parseFloat(tvl.toFixed(2)),
        tvlUsd: parseFloat(tvlUsd.toFixed(2))
      };
    } catch (error) {
      this.logger.error(`Failed to calculate TVL for token ${token.id}`, error as Error);
      throw error; // Re-throw to let caller handle the error
    }
  }
}
