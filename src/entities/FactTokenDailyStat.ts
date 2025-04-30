import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { DimToken } from './DimToken';

@Entity({ name: 'fact_token_daily_stats' })
export class FactTokenDailyStat {
  @PrimaryColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'token_id' })
  tokenId: number;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  volume: number;

  @Column({ name: 'volume_usd', type: 'decimal', precision: 36, scale: 18 })
  volumeUsd: number;

  @Column({ name: 'txns_count' })
  txnsCount: number;

  @Column({ name: 'price_usd', type: 'decimal', precision: 36, scale: 18 })
  priceUsd: number;

  @Column({ name: 'volume_yoy', type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeYoy?: number;

  @Column({ name: 'volume_qoq', type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeQoq?: number;

  @Column({ name: 'txns_yoy', type: 'decimal', precision: 10, scale: 2, nullable: true })
  txnsYoy?: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => DimToken, (token) => token.dailyStats)
  token: DimToken;
}
