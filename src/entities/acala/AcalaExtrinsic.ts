import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { AcalaBlock } from './AcalaBlock';
import { AcalaEvent } from './AcalaEvent';

@Entity({ name: 'acala_extrinsic' })
export class AcalaExtrinsic {
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

  @ManyToOne(() => AcalaBlock, (block) => block.extrinsics)
  block: AcalaBlock;

  @OneToMany(() => AcalaEvent, (event) => event.extrinsic)
  events: AcalaEvent[];
}
