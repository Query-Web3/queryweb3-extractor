import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { DimToken } from './DimToken';

@Entity({ name: 'fact_token_yearly_stats' })
export class FactTokenYearlyStat {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'token_id' })
  tokenId: number; // 添加name映射

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

  @Column({ name: 'txns_qoq', type: 'decimal', precision: 10, scale: 2, nullable: true })
  txnsQoq?: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => DimToken, (token) => token.yearlyStats)
  @JoinColumn({ name: 'token_id' })
  token: DimToken;
}
