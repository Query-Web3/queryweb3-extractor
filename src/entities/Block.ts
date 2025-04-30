import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Extrinsic } from './Extrinsic';
import { Event } from './Event';

@Entity({ name: 'acala_block' })
export class Block {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  number: number;

  @Column()
  hash: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @Column()
  batchId: string;

  @OneToMany(() => Extrinsic, (extrinsic) => extrinsic.block)
  extrinsics: Extrinsic[];

  @OneToMany(() => Event, (event) => event.block)
  events: Event[];
}
