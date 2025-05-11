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

  @Column({ name: 'acala_data', type: 'json', nullable: true })
  acalaData: {
    dexPools: Array<{
      poolId: string;
      liquidity: string;
    }>;
    stableCoinBalances: Array<{
      accountId: string;
      position: string;
    }>;
  } | null;

  @OneToMany(() => Extrinsic, (extrinsic) => extrinsic.block)
  extrinsics: Extrinsic[];

  @OneToMany(() => Event, (event) => event.block)
  events: Event[];
}
