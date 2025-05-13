import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Bifrost_price_table' })
export class BifrostPriceTable {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batch_id: number;

  @Column({ length: 50 })
  asset_id: string;

  @Column({ length: 50 })
  symbol: string;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  price_usdt: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
