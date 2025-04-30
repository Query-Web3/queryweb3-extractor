import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Block } from './Block';
import { Event } from './Event';

@Entity({ name: 'acala_extrinsic' })
export class Extrinsic {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  blockId: number;

  @Column()
  index: number;

  @Column({ type: 'text' })
  method: string;

  @Column({ nullable: true })
  signer?: string;

  @Column({ nullable: true })
  fee?: string;

  @Column({ nullable: true })
  status?: string;

  @Column({ type: 'json', nullable: true })
  params?: any;

  @Column()
  batchId: string;

  @ManyToOne(() => Block, (block) => block.extrinsics)
  block: Block;

  @OneToMany(() => Event, (event) => event.extrinsic)
  events: Event[];
}
