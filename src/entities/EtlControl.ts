import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'etl_control' })
export class EtlControl {
  @PrimaryColumn({ length: 100 })
  taskName: string;

  @Column({ type: 'datetime', nullable: true })
  lastRun: Date;
}
