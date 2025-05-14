import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { AcalaExtrinsic } from './AcalaExtrinsic';
import { AcalaEvent } from './AcalaEvent';

@Entity({ name: 'acala_block' })
export class AcalaBlock {
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
    events: Array<{
      currencyId: string;
      [key: string]: any;
    }>;
  } | null;

  @OneToMany(() => AcalaExtrinsic, (extrinsic) => extrinsic.block)
  extrinsics: AcalaExtrinsic[];

  @OneToMany(() => AcalaEvent, (event) => event.block)
  events: AcalaEvent[];
}
