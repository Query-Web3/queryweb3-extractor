import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Bifrost_batchID_table' })
export class BifrostBatchIDTable {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batch_id: number;

  @Column({ length: 25 })
  chain: string;

  @Column({ length: 10 })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
