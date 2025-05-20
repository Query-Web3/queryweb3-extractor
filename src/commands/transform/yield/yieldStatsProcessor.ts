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

      this.logger.debug(`Token ${tokenId} query result:`, token ? {
        id: token.id,
        address: token.address,
        chain: token.chain ? {
          id: token.chain.id,
          name: token.chain.name
        } : null
      } : null);

      if (!token) {
        this.logger.warn(`Token ${tokenId} not found, using default supply value`);
        return 1000000; // Return default supply value
      }

      // Use Acala chain as fallback by default
      const chainName = token.chain?.name || 'Acala';
      const apiConnector = ApiConnectorFactory.getConnector(chainName.toLowerCase());
      const api = await apiConnector.createApiConnection();
      
      // Use different methods to get total supply based on chain type
      let totalSupply: bigint;
      try {
        if (token.chain.name === 'Acala') {
          const result = await api.query.tokens.totalIssuance(token.address);
          totalSupply = BigInt(result.toString());
        } else if (token.chain.name === 'Bifrost') {
          const result = await api.query.tokens.totalIssuance(token.address);
          totalSupply = BigInt(result.toString());
        } else if (token.address.startsWith('ForeignAsset-')) {
          // Handle ForeignAsset type tokens
          const assetId = token.address.split('-')[1];
          const result = await api.query.tokens.totalIssuance({ ForeignAsset: assetId });
          totalSupply = BigInt(result.toString());
        } else {
          // Default to using ERC20 balanceOf method
          const result = await api.query.assets.account(token.address, { owner: token.address });
          const accountInfo = result.toJSON() as { balance?: string } || {};
          totalSupply = BigInt(accountInfo.balance || '0');
        }
      } catch (error) {
        this.logger.warn(`Failed to get supply for token ${token.id} with address ${token.address}`, error as Error);
        return 1000000; // Return default supply value
      }

      await apiConnector.disconnectApi(api);
      return Number(totalSupply);
    } catch (error) {
      this.logger.error(`Failed to get total supply for token ${tokenId}`, error as Error);
      return 0; // Return 0 as default value
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
      yieldStat.poolAddress = token.address; // Use token address as pool address
      
      // Step 1: Calculate APY (Annual Percentage Yield)
      const apyData = await this.calculateAPY(token);
      yieldStat.apy = apyData.apy;
      
      // Step 2: Calculate TVL (Total Value Locked)
      const tvlData = await this.calculateTVL(token);
      yieldStat.tvl = tvlData.tvl;
      yieldStat.tvlUsd = tvlData.tvlUsd;
      
      // Step 3: Data validation
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
      // Step 1: Get historical yield data
      const history = await this.yieldStatRepo.find({
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

        // Ensure valid APY value
        finalApy = Number.isFinite(riskAdjustedApy) ? riskAdjustedApy : 0;
        if (!Number.isFinite(finalApy)) {
          this.logger.warn(`Invalid APY calculated for token ${token.id}, using 0 as fallback`);
          finalApy = 0;
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

  private async calculateTVL(token: DimToken): Promise<{tvl: number, tvlUsd: number}> {
    try {
      // Step 1: Get token total supply from database
      const totalSupply = await this.getTokenTotalSupply(token.id);
      if (!totalSupply) {
        throw new Error(`Cannot get total supply for token ${token.id}`);
      }
      
      // Step 2: Get locked ratio from staking contract
      const lockedRatio = await this.getLockedRatio(token.address);
      if (lockedRatio <= 0 || lockedRatio > 1) {
        throw new Error(`Invalid locked ratio: ${lockedRatio}`);
      }
      
      // Step 3: Calculate TVL
      const tvl = totalSupply * lockedRatio;
      
      // Step 4: Convert to USD using price oracle
      const usdRate = await this.getTokenPrice(token.id);
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
