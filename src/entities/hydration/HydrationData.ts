import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Hydration_data' })
export class HydrationData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batch_id: number;

  @Column({ length: 50 })
  asset_id: string;

  @Column({ length: 50 })
  symbol: string;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  farm_apr: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  pool_apr: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  total_apr: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  tvl_usd: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  volume_usd: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
