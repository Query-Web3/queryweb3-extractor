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

  @Column({ name: 'batch_id' })
  batchId: string;

  @Column({ name: 'start_time', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ type: 'enum', enum: BatchStatus, default: BatchStatus.RUNNING })
  status: BatchStatus;

  @Column({ type: 'enum', enum: BatchType })
  type: BatchType;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;
}
