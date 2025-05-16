import { DimChain } from '../../../entities/DimChain';
import { DimAssetType } from '../../../entities/DimAssetType';
import { DimReturnType } from '../../../entities/DimReturnType';
import { DimStatCycle } from '../../../entities/DimStatCycle';
import { initializeDataSource } from '../dataSource';
import { Logger, LogLevel } from '../../../utils/logger';
import { createClient } from 'redis';

export class DimensionInitializer {
    private logger = Logger.getInstance();
    private redisClient: ReturnType<typeof createClient>;
    private hasTableUpdates = false;

    constructor() {
        this.redisClient = createClient({
            url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
        });
        this.redisClient.on('error', err => this.logger.error('Redis error:', err));
        this.logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    }

    public async initialize(): Promise<void> {
        const initTimer = this.logger.time('Initialize dimension tables');
        const dataSource = await initializeDataSource();
        
        if (!this.redisClient.isOpen) {
            await this.redisClient.connect();
        }
        
        try {
            // Initialize all dimension tables and get records
            const chain = await this.initChain(dataSource);
            const assetTypes = await this.initAssetTypes(dataSource);
            const returnTypes = await this.initReturnTypes(dataSource);
            const statCycles = await this.initStatCycles(dataSource);

            this.logger.debug(`Initialized chain: ${chain.name} (ID: ${chain.chainId})`);
            this.logger.debug(`Initialized ${assetTypes.length} asset types`);
            this.logger.debug(`Initialized ${returnTypes.length} return types`);
            this.logger.debug(`Initialized ${statCycles.length} stat cycles`);

            // Cache all dimension data to Redis
            await this.cacheDimensionsToRedis(dataSource);
        } finally {
            initTimer.end();
        }
    }

    private async cacheDimensionsToRedis(dataSource: any): Promise<void> {
        const cacheTimer = this.logger.time('Cache dimensions to Redis');
        try {
            const chainRepo = dataSource.getRepository(DimChain);
            const assetTypeRepo = dataSource.getRepository(DimAssetType);
            const returnTypeRepo = dataSource.getRepository(DimReturnType);
            const statCycleRepo = dataSource.getRepository(DimStatCycle);

            const [chains, assetTypes, returnTypes, statCycles] = await Promise.all([
                chainRepo.find(),
                assetTypeRepo.find(),
                returnTypeRepo.find(),
                statCycleRepo.find()
            ]);

            // 强制更新Redis缓存，即使表为空
            await Promise.all([
                this.redisClient.set('dim:chains', JSON.stringify(chains)),
                this.redisClient.set('dim:assetTypes', JSON.stringify(assetTypes)),
                this.redisClient.set('dim:returnTypes', JSON.stringify(returnTypes)),
                this.redisClient.set('dim:statCycles', JSON.stringify(statCycles))
            ]);

            if (this.hasTableUpdates || chains.length === 0 || assetTypes.length === 0 || 
                returnTypes.length === 0 || statCycles.length === 0) {
                this.logger.warn('Forced Redis cache update due to table updates or empty tables');
            } else {
                this.logger.debug('Cached all dimension tables to Redis');
            }
            this.hasTableUpdates = false; // 重置标志位
        } finally {
            cacheTimer.end();
        }
    }

    private async initChain(dataSource: any): Promise<DimChain> {
        this.logger.debug('Initializing chain');
        const repo = dataSource.getRepository(DimChain);
        let chain = await repo.findOne({ where: { name: 'Acala' } });
        if (!chain) {
            chain = await repo.save({
                name: 'Acala',
                chainId: 1
            });
            this.hasTableUpdates = true;
            this.logger.debug('Created new chain record');
        } else {
            this.logger.debug('Using existing chain record');
        }
        return chain;
    }

    private async initAssetTypes(dataSource: any): Promise<DimAssetType[]> {
        this.logger.debug('Initializing asset types');
        const repo = dataSource.getRepository(DimAssetType);
        const types = [
            { name: 'Native', description: 'Native token of the chain' },
            { name: 'LP Token', description: 'Liquidity pool token' },
            { name: 'Stablecoin', description: 'Stable value cryptocurrency' },
            { name: 'Governance', description: 'Governance token' }
        ];
        
        const results: DimAssetType[] = [];
        for (const type of types) {
            let existing = await repo.findOne({ where: { name: type.name } });
            if (!existing) {
                existing = await repo.save(type);
                this.hasTableUpdates = true;
                this.logger.debug(`Created asset type: ${type.name}`);
            } else {
                this.logger.debug(`Using existing asset type: ${type.name}`);
            }
            results.push(existing);
        }
        return results;
    }

    private async initReturnTypes(dataSource: any): Promise<DimReturnType[]> {
        this.logger.debug('Initializing return types');
        const repo = dataSource.getRepository(DimReturnType);
        const types = [
            { name: 'Staking', description: 'Staking rewards' },
            { name: 'Liquidity Mining', description: 'Liquidity mining rewards' },
            { name: 'Lending', description: 'Lending interest' }
        ];
        
        const results: DimReturnType[] = [];
        for (const type of types) {
            let existing = await repo.findOne({ where: { name: type.name } });
            if (!existing) {
                existing = await repo.save(type);
                this.hasTableUpdates = true;
                this.logger.debug(`Created return type: ${type.name}`);
            } else {
                this.logger.debug(`Using existing return type: ${type.name}`);
            }
            results.push(existing);
        }
        return results;
    }

    private async initStatCycles(dataSource: any): Promise<DimStatCycle[]> {
        this.logger.debug('Initializing stat cycles');
        const repo = dataSource.getRepository(DimStatCycle);
        const cycles = [
            { name: 'Daily', description: 'Daily statistics', days: 1 },
            { name: 'Weekly', description: 'Weekly statistics', days: 7 },
            { name: 'Monthly', description: 'Monthly statistics', days: 30 },
            { name: 'Quarterly', description: 'Quarterly statistics', days: 90 },
            { name: 'Yearly', description: 'Yearly statistics', days: 365 }
        ];
        
        const results: DimStatCycle[] = [];
        for (const cycle of cycles) {
            let existing = await repo.findOne({ where: { name: cycle.name } });
            if (!existing) {
                existing = await repo.save(cycle);
                this.hasTableUpdates = true;
                this.logger.debug(`Created stat cycle: ${cycle.name}`);
            } else {
                this.logger.debug(`Using existing stat cycle: ${cycle.name}`);
            }
            results.push(existing);
        }
        return results;
    }
}
