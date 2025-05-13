import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Bifrost_staking_table' })
export class BifrostStakingTable {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batch_id: number;

  @Column({ length: 255 })
  contractAddress: string;

  @Column({ length: 50 })
  symbol: string;

  @Column({ length: 100 })
  slug: string;

  @Column({ length: 100 })
  baseSlug: string;

  @Column()
  unstakingTime: number;

  @Column()
  users: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  apr: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  fee: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  price: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  exchangeRatio: number;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  supply: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
