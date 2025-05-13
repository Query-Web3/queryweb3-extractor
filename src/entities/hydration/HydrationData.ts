import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'hydration_data' })
export class HydrationData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batch_id: number;

  @Column({ length: 50 })
  asset_id: string;

  @Column({ length: 50 })
  symbol: string;

  @Column({ type: 'double' })
  farm_apr: number;

  @Column({ type: 'double' })
  pool_apr: number;

  @Column({ type: 'double' })
  total_apr: number;

  @Column({ type: 'double' })
  tvl_usd: number;

  @Column({ type: 'double' })
  volume_usd: number;

  @Column({ length: 50 })
  timestamp: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
