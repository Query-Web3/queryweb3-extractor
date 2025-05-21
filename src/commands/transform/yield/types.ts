export interface APYData {
  apy: number;
}

export interface TVLData {
  tvl: number;
  tvlUsd: number;
}

export interface TokenSupplyData {
  totalSupply: number;
  lockedRatio: number;
  usdRate: number;
}

export interface RiskFactors {
  age: number;
  liquidity: number;
  audits: number;
  tvl: number;
}

export interface RiskWeights {
  age: number;
  liquidity: number;
  audits: number;
  tvl: number;
}
