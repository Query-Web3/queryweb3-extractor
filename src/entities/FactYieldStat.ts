import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { DimToken } from './DimToken';
import { DimReturnType } from './DimReturnType';

@Entity({ name: 'fact_yield_stats' })
export class FactYieldStat {
  @PrimaryColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'token_id' })
  tokenId: number;

  @Column({ name: 'return_type_id' })
  returnTypeId: number;

  @Column({ name: 'pool_address', length: 42 })
  poolAddress: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  apy: number;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  tvl: number;

  @Column({ name: 'tvl_usd', type: 'decimal', precision: 36, scale: 18 })
  tvlUsd: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => DimToken, (token) => token.yieldStats)
  token: DimToken;

  @ManyToOne(() => DimReturnType, (returnType) => returnType.yieldStats)
  returnType: DimReturnType;
}
