import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Block } from './Block';
import { Extrinsic } from './Extrinsic';

@Entity({ name: 'acala_event' })
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'block_id' })
  blockId: number;

  @Column({ name: 'extrinsic_id', nullable: true })
  extrinsicId?: number;

  @Column()
  index: number;

  @Column()
  section: string;

  @Column()
  method: string;

  @Column({ type: 'json', nullable: true })
  data?: any;

  @Column({ name: 'batch_id' })
  batchId: string;

  @ManyToOne(() => Block, (block) => block.events)
  block: Block;

  @ManyToOne(() => Extrinsic, (extrinsic) => extrinsic.events)
  extrinsic?: Extrinsic;
}
