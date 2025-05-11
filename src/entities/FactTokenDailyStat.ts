import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { DimToken } from './DimToken';

@Entity({ name: 'fact_token_daily_stats' })
export class FactTokenDailyStat {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'token_id', type: 'int', nullable: false })
  tokenId: number;

  @Column({ name: 'date', type: 'date', nullable: false })
  date: Date;

  @Column({ name: 'volume', type: 'decimal', precision: 65, scale: 18, nullable: false })
  volume: number;

  @Column({ name: 'volume_usd', type: 'decimal', precision: 65, scale: 18, nullable: false })
  volumeUsd: number;

  @Column({ name: 'txns_count', type: 'int', nullable: false })
  txnsCount: number;

  @Column({ name: 'price_usd', type: 'decimal', precision: 36, scale: 18, nullable: false })
  priceUsd: number;

  @Column({ name: 'volume_yoy', type: 'decimal', precision: 65, scale: 18, nullable: true })
  volumeYoy?: number;

  @Column({ name: 'volume_qoq', type: 'decimal', precision: 65, scale: 18, nullable: true })
  volumeQoq?: number;

  @Column({ name: 'txns_yoy', type: 'decimal', precision: 10, scale: 2, nullable: true })
  txnsYoy?: number;

  @Column({ name: 'txns_qoq', type: 'decimal', precision: 10, scale: 2, nullable: true })
  txnsQoq?: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => DimToken, (token) => token.dailyStats)
  @JoinColumn({ name: 'token_id' })
  token: DimToken;
}
