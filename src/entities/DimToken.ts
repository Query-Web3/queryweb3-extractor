import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { DimChain } from './DimChain';
import { DimAssetType } from './DimAssetType';
import { FactTokenDailyStat } from './FactTokenDailyStat';
import { FactTokenMonthlyStat } from './FactTokenMonthlyStat';
import { FactTokenWeeklyStat } from './FactTokenWeeklyStat';
import { FactTokenYearlyStat } from './FactTokenYearlyStat';
import { FactYieldStat } from './FactYieldStat';

@Entity({ name: 'dim_tokens' })
export class DimToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'chain_id' })
  chainId: number; // 与SQL表结构一致

  @Column({ length: 42 })
  address: string;

  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 100 })
  name: string;

  @Column()
  decimals: number;

  @Column({ name: 'asset_type_id' })
  assetTypeId: number; // 与SQL表结构一致

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => DimChain, (chain) => chain.tokens)
  @JoinColumn({ name: 'chain_id' }) // 简化映射，使用默认id
  chain: DimChain;

  @ManyToOne(() => DimAssetType, (assetType) => assetType.tokens)
  @JoinColumn({ name: 'asset_type_id' }) // 简化映射，使用默认id
  assetType: DimAssetType;

  @OneToMany(() => FactTokenDailyStat, (dailyStat) => dailyStat.token)
  dailyStats: FactTokenDailyStat[];

  @OneToMany(() => FactYieldStat, (yieldStat) => yieldStat.token)
  yieldStats: FactYieldStat[];

  @OneToMany(() => FactTokenMonthlyStat, (monthlyStat) => monthlyStat.token)
  monthlyStats: FactTokenMonthlyStat[];

  @OneToMany(() => FactTokenWeeklyStat, (weeklyStat) => weeklyStat.token)
  weeklyStats: FactTokenWeeklyStat[];

  @OneToMany(() => FactTokenYearlyStat, (yearlyStat) => yearlyStat.token)
  yearlyStats: FactTokenYearlyStat[];
}
