import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Bifrost_site_table' })
export class BifrostSiteTable {
  @PrimaryGeneratedColumn()
  auto_id: number;

  @Column()
  batch_id: number;

  @Column({ length: 255 })
  Asset: string;

  @Column({ type: 'decimal', precision: 20, scale: 3 })
  Value: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  tvl: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  tvm: number;

  @Column()
  holders: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  apy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  apyBase: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  apyReward: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  totalIssuance: number;

  @Column({ type: 'text' })
  holdersList: string;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  annualized_income: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  bifrost_staking_7day_apy: number;

  @Column({ type: 'datetime' })
  created: Date;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  daily_reward: number;

  @Column()
  exited_node: number;

  @Column()
  exited_not_transferred_node: number;

  @Column()
  exiting_online_node: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  gas_fee_income: number;

  @Column()
  id: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  mev_7day_apy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  mev_apy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  mev_income: number;

  @Column()
  online_node: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  slash_balance: number;

  @Column()
  slash_num: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  staking_apy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  staking_income: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  total_apy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  total_balance: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  total_effective_balance: number;

  @Column()
  total_node: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  total_reward: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  total_withdrawals: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  stakingApy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  stakingIncome: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  mevApy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  mevIncome: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  gasFeeApy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  gasFeeIncome: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  totalApy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  totalIncome: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  baseApy: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  farmingAPY: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  veth2TVS: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  apyMev: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  apyGas: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
