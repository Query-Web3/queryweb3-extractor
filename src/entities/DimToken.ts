import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { DimChain } from './DimChain';
import { DimAssetType } from './DimAssetType';
import { FactTokenDailyStat } from './FactTokenDailyStat';
import { FactYieldStat } from './FactYieldStat';

@Entity({ name: 'dim_tokens' })
export class DimToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'chain_id' })
  chainId: number;

  @Column({ length: 42 })
  address: string;

  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 100 })
  name: string;

  @Column()
  decimals: number;

  @Column({ name: 'price_usd', type: 'decimal', precision: 36, scale: 18, nullable: true })
  priceUsd: number;

  @Column({ name: 'asset_type_id' })
  assetTypeId: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => DimChain, (chain) => chain.tokens)
  @JoinColumn({ name: 'chain_id', referencedColumnName: 'chainId' })
  chain: DimChain;

  @ManyToOne(() => DimAssetType, (assetType) => assetType.tokens)
  @JoinColumn({ name: 'asset_type_id', referencedColumnName: 'id' })
  assetType: DimAssetType;

  @OneToMany(() => FactTokenDailyStat, (dailyStat) => dailyStat.token)
  dailyStats: FactTokenDailyStat[];

  @OneToMany(() => FactYieldStat, (yieldStat) => yieldStat.token)
  yieldStats: FactYieldStat[];
}
