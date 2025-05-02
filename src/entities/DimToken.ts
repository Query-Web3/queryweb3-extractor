import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { DimChain } from './DimChain';
import { DimAssetType } from './DimAssetType';
import { FactTokenDailyStat } from './FactTokenDailyStat';
import { FactYieldStat } from './FactYieldStat';

@Entity({ name: 'dim_tokens' })
export class DimToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chainId: number;

  @Column({ length: 42 })
  address: string;

  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 100 })
  name: string;

  @Column()
  decimals: number;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  priceUsd: number;

  @Column()
  assetTypeId: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => DimChain, (chain) => chain.tokens)
  chain: DimChain;

  @ManyToOne(() => DimAssetType, (assetType) => assetType.tokens)
  assetType: DimAssetType;

  @OneToMany(() => FactTokenDailyStat, (dailyStat) => dailyStat.token)
  dailyStats: FactTokenDailyStat[];

  @OneToMany(() => FactYieldStat, (yieldStat) => yieldStat.token)
  yieldStats: FactYieldStat[];
}
