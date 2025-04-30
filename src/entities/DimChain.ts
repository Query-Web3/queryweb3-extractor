import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { DimToken } from './DimToken';

@Entity({ name: 'dim_chains' })
export class DimChain {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  name: string;

  @Column()
  chainId: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => DimToken, (token) => token.chain)
  tokens: DimToken[];
}
