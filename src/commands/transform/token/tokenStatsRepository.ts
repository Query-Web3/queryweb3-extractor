import { FactTokenDailyStat } from '../../../entities/FactTokenDailyStat';
import { FactTokenWeeklyStat } from '../../../entities/FactTokenWeeklyStat';
import { FactTokenMonthlyStat } from '../../../entities/FactTokenMonthlyStat';
import { FactTokenYearlyStat } from '../../../entities/FactTokenYearlyStat';
import { DimToken } from '../../../entities/DimToken';
import { DimStatCycle } from '../../../entities/DimStatCycle';
import { Event } from '../../../entities/Event';
import { DataSource } from 'typeorm';
import { initializeDataSource } from '../dataSource';

export class TokenStatsRepository {
    private dataSource: DataSource;
    public tokenRepo: import('typeorm').Repository<DimToken>;
    public dailyStatRepo: import('typeorm').Repository<FactTokenDailyStat>;
    public weeklyStatRepo: import('typeorm').Repository<FactTokenWeeklyStat>;
    public monthlyStatRepo: import('typeorm').Repository<FactTokenMonthlyStat>;
    public yearlyStatRepo: import('typeorm').Repository<FactTokenYearlyStat>;
    public eventRepo: import('typeorm').Repository<Event>;
    public statCycleRepo: import('typeorm').Repository<DimStatCycle>;

    public dailyCycle: DimStatCycle | null;
    public weeklyCycle: DimStatCycle | null;
    public monthlyCycle: DimStatCycle | null;
    public quarterlyCycle: DimStatCycle | null;
    public yearlyCycle: DimStatCycle | null;

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.tokenRepo = dataSource.getRepository(DimToken);
        this.dailyStatRepo = dataSource.getRepository(FactTokenDailyStat);
        this.weeklyStatRepo = dataSource.getRepository(FactTokenWeeklyStat);
        this.monthlyStatRepo = dataSource.getRepository(FactTokenMonthlyStat);
        this.yearlyStatRepo = dataSource.getRepository(FactTokenYearlyStat);
        this.eventRepo = dataSource.getRepository(Event);
        this.statCycleRepo = dataSource.getRepository(DimStatCycle);
    }

    public async initialize() {
        this.dailyCycle = await this.statCycleRepo.findOne({ where: { name: 'Daily' } });
        this.weeklyCycle = await this.statCycleRepo.findOne({ where: { name: 'Weekly' } });
        this.monthlyCycle = await this.statCycleRepo.findOne({ where: { name: 'Monthly' } });
        this.quarterlyCycle = await this.statCycleRepo.findOne({ where: { name: 'Quarterly' } });
        this.yearlyCycle = await this.statCycleRepo.findOne({ where: { name: 'Yearly' } });
    }
}
