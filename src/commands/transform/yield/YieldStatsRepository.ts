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
}
