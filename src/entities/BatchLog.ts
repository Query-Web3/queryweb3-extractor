import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum LockStatus {
  UNLOCKED = 0,
  LOCKED = 1,
  FAILED = 2
}

export enum BatchStatus {
  FAILED = 0,
  SUCCESS = 1,
  RUNNING = 2,
  STOPPED = 3,
  PAUSED = 4,
  RESUMED = 5,
  CANCELED = 6,
  COMPLETED = 7,
  SKIPPED = 8,
  RETRYING = 9
}

export enum BatchType {
  EXTRACT = 1,
  TRANSFORM = 2
}

@Entity({ name: 'batch_log' })
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

  @Column({ type: 'int', nullable: true })
  last_processed_height: number | null;

  @Column({ name: 'lock_key', nullable: true })
  lockKey?: string;

  @Column({ name: 'lock_time', type: 'timestamp', nullable: true })
  lockTime?: Date;

  @Column({ name: 'lock_status', type: 'enum', enum: LockStatus, nullable: true })
  lockStatus?: LockStatus;

  @Column({ type: 'json', nullable: true })
  logs?: Array<{
    timestamp: Date;
    level: string;
    message: string;
    details?: any;
  }>;

  @Column({ type: 'text', nullable: true })
  errorDetails?: string;
}
