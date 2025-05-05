import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class DimStatCycle {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50 })
    name: string; // e.g. 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'

    @Column({ length: 100 })
    description: string;

    @Column({ type: 'int' })
    days: number; // Number of days in this cycle
}