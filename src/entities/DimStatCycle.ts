import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'dim_stat_cycles' })
export class DimStatCycle {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50 })
    name: string; // e.g. 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'

    @Column({ type: 'int' })
    days: number; // Number of days in this cycle
}