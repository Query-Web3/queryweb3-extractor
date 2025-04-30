import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { DimToken } from './DimToken';

@Entity({ name: 'dim_asset_types' })
export class DimAssetType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  name: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => DimToken, (token) => token.assetType)
  tokens: DimToken[];
}
