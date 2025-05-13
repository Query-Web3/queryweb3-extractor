import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'pool_data' })
export class StellaswapPoolData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batch_id: number;

  @Column({ length: 255 })
  pool_id: string;

  @Column({ length: 255 })
  token0_id: string;

  @Column({ length: 50 })
  token0_symbol: string;

  @Column({ length: 255 })
  token0_name: string;

  @Column()
  token0_decimals: number;

  @Column({ length: 255 })
  token1_id: string;

  @Column({ length: 50 })
  token1_symbol: string;

  @Column({ length: 255 })
  token1_name: string;

  @Column()
  token1_decimals: number;

  @Column({ type: 'double' })
  liquidity: number;

  @Column({ type: 'double' })
  sqrt_price: number;

  @Column()
  tick: number;

  @Column({ type: 'double' })
  volume_usd_current: number;

  @Column({ type: 'double' })
  volume_usd_24h_ago: number;

  @Column({ type: 'double' })
  volume_usd_24h: number;

  @Column()
  tx_count: number;

  @Column({ type: 'double' })
  fees_usd_current: number;

  @Column({ type: 'double' })
  fees_usd_24h_ago: number;

  @Column({ type: 'double' })
  fees_usd_24h: number;

  @Column({ type: 'double' })
  amount_token0: number;

  @Column({ type: 'double' })
  amount_token1: number;

  @Column({ type: 'double' })
  pools_apr: number;

  @Column({ type: 'double' })
  farming_apr: number;

  @Column({ type: 'double' })
  final_apr: number;

  @Column({ type: 'text' })
  token_rewards: string;

  @Column({ length: 50 })
  timestamp: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
