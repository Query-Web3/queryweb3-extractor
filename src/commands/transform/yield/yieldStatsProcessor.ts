import { FactYieldStat } from '../../../entities/FactYieldStat';
import { Logger } from '../../../utils/logger';
import { DimToken } from '../../../entities/DimToken';
import { DataSource } from 'typeorm';
import { ApiConnectorFactory } from '../../common/ApiConnectorFactory';

export class YieldStatsProcessor {
  constructor(
    private dataSource: DataSource,
    private logger: Logger = Logger.getInstance()
  ) {}

  private async getTokenTotalSupply(tokenId: number): Promise<number> {
    try {
      const token = await this.dataSource.getRepository(DimToken).findOne({
        where: { id: tokenId },
        relations: ['chain']
      });

      if (!token || !token.chain) {
        throw new Error(`Token ${tokenId} or its chain not found`);
      }

      const apiConnector = ApiConnectorFactory.getConnector(token.chain.name.toLowerCase());
      const api = await apiConnector.createApiConnection();
      
      // 根据不同的链使用不同的方法获取总供应量
      let totalSupply: bigint;
      if (token.chain.name === 'Acala') {
        const result = await api.query.tokens.totalIssuance(token.address);
        totalSupply = BigInt(result.toString());
      } else if (token.chain.name === 'Bifrost') {
        const result = await api.query.tokens.totalIssuance(token.address);
        totalSupply = BigInt(result.toString());
      } else {
        // 默认使用ERC20 balanceOf方法
        const result = await api.query.assets.account(token.address, { owner: token.address });
        const accountInfo = result.toJSON() as { balance?: string } || {};
        totalSupply = BigInt(accountInfo.balance || '0');
      }

      await apiConnector.disconnectApi(api);
      return Number(totalSupply);
    } catch (error) {
      this.logger.error(`Failed to get total supply for token ${tokenId}`, error as Error);
      return 0; // 返回0作为默认值
    }
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
      
      // 4. Comprehensive risk assessment
      let riskFactors = {
        age: 1.0,
        liquidity: 1.0,
        audits: 1.0,
        tvl: 1.0
      };
      
      // Age factor
      const tokenAgeDays = (new Date().getTime() - token.createdAt.getTime()) / (1000 * 3600 * 24);
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

      const riskAdjustedApy = apy * riskFactor;
      this.logger.debug(`APY risk adjustment for token ${token.id}`, {
        rawApy: apy,
        riskFactor,
        adjustedApy: riskAdjustedApy,
        tokenAgeDays
      });

      return { apy: riskAdjustedApy };
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

  private async calculateTVL(token: DimToken): Promise<{tvl: number, tvlUsd: number}> {
    try {
      // 1. Get token total supply from database
      const totalSupply = await this.getTokenTotalSupply(token.id);
      if (!totalSupply) {
        throw new Error(`Cannot get total supply for token ${token.id}`);
      }
      
      // 2. Get locked ratio from staking contract
      const lockedRatio = await this.getLockedRatio(token.address);
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
