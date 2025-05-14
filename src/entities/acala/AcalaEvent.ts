import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { AcalaBlock } from './AcalaBlock';
import { AcalaExtrinsic } from './AcalaExtrinsic';

@Entity({ name: 'acala_event' })
export class AcalaEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  blockId: number;

  @Column({ nullable: true })
  extrinsicId?: number;

  @Column()
  index: number;

  @Column()
  section: string;

  @Column()
  method: string;

  @Column({ type: 'json', nullable: true })
  data?: any;

  @Column()
  batchId: string;

  @ManyToOne(() => AcalaBlock, (block) => block.events)
  block: AcalaBlock;

  @ManyToOne(() => AcalaExtrinsic, (extrinsic) => extrinsic.events)
  extrinsic?: AcalaExtrinsic;
}
