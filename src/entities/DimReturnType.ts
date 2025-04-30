import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { FactYieldStat } from './FactYieldStat';

@Entity({ name: 'dim_return_types' })
export class DimReturnType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  name: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => FactYieldStat, (yieldStat) => yieldStat.returnType)
  yieldStats: FactYieldStat[];
}
