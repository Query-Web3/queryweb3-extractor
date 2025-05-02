import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum BatchStatus {
  FAILED = 0,
  SUCCESS = 1,
  RUNNING = 2
}

export enum BatchType {
  EXTRACT = 1,
  TRANSFORM = 2
}

@Entity({ name: 'acala_batchlog' })
export class BatchLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batchId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ type: 'enum', enum: BatchStatus, default: BatchStatus.RUNNING })
  status: BatchStatus;

  @Column({ type: 'enum', enum: BatchType })
  type: BatchType;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 0 })
  processed_block_count: number;

  @Column({ nullable: true })
  last_processed_height: number | null;
}
