import { FactYieldStat } from '../../../entities/FactYieldStat';
import { DataSource } from 'typeorm';
import { Logger } from '../../../utils/logger';
import { DimToken } from '../../../entities/DimToken';

export class YieldStatsRepository {
  constructor(
    private dataSource: DataSource,
    private logger: Logger = Logger.getInstance()
  ) {}

  get yieldStatRepo() {
    return this.dataSource.getRepository(FactYieldStat);
  }

  async saveDailyStat(stat: FactYieldStat): Promise<FactYieldStat> {
    return this.yieldStatRepo.save(stat);
  }

  async findExistingDailyStat(tokenId: number, date: Date): Promise<FactYieldStat | null> {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    return this.yieldStatRepo
      .createQueryBuilder('stat')
      .where('stat.token_id = :tokenId', { tokenId })
      .andWhere('DATE(stat.date) = :date', { date: dateStr })
      .getOne();
  }

  async getTokenById(tokenId: number): Promise<DimToken | null> {
    return this.dataSource.getRepository(DimToken).findOne({
      where: { id: tokenId },
      relations: ['chain']
    });
  }

  async findOrCreateWeeklyStat(tokenId: number, date: Date): Promise<any> {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    const repo = this.dataSource.getRepository('FactTokenWeeklyStat');
    let stat = await repo.findOne({
      where: { tokenId: tokenId, date: dateStr }
    });

    if (!stat) {
      stat = repo.create({
        tokenId: tokenId,
        date: dateStr,
        volume: '0',
        volumeUsd: '0',
        txnsCount: 0,
        priceUsd: '0'
      });
    }

    return stat;
  }

  async saveWeeklyStat(stat: any): Promise<void> {
    await this.dataSource.getRepository('FactTokenWeeklyStat').save(stat);
  }

  async findOrCreateMonthlyStat(tokenId: number, date: Date): Promise<any> {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    const repo = this.dataSource.getRepository('FactTokenMonthlyStat');
    let stat = await repo.findOne({
      where: { tokenId: tokenId, date: dateStr }
    });

    if (!stat) {
      stat = repo.create({
        tokenId: tokenId,
        date: dateStr,
        volume: '0',
        volumeUsd: '0',
        txnsCount: 0,
        priceUsd: '0'
      });
    }

    return stat;
  }

  async saveMonthlyStat(stat: any): Promise<void> {
    await this.dataSource.getRepository('FactTokenMonthlyStat').save(stat);
  }

  async findOrCreateYearlyStat(tokenId: number, date: Date): Promise<any> {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    const repo = this.dataSource.getRepository('FactTokenYearlyStat');
    let stat = await repo.findOne({
      where: { tokenId: tokenId, date: dateStr }
    });

    if (!stat) {
      stat = repo.create({
        tokenId: tokenId,
        date: dateStr,
        volume: '0',
        volumeUsd: '0',
        txnsCount: 0,
        priceUsd: '0'
      });
    }

    return stat;
  }

  async saveYearlyStat(stat: any): Promise<void> {
    await this.dataSource.getRepository('FactTokenYearlyStat').save(stat);
  }
}
