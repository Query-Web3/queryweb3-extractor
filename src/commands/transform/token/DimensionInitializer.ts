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
            // Initialize chain
            await this.initChain(dataSource);
            
            // Initialize asset types
            await this.initAssetTypes(dataSource);
            
            // Initialize return types
            await this.initReturnTypes(dataSource);
            
            // Initialize stat cycles
            await this.initStatCycles(dataSource);

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

            await Promise.all([
                this.redisClient.set('dim:chains', JSON.stringify(chains)),
                this.redisClient.set('dim:assetTypes', JSON.stringify(assetTypes)),
                this.redisClient.set('dim:returnTypes', JSON.stringify(returnTypes)),
                this.redisClient.set('dim:statCycles', JSON.stringify(statCycles))
            ]);

            this.logger.debug('Cached all dimension tables to Redis');
        } finally {
            cacheTimer.end();
        }
    }

    private async initChain(dataSource: any): Promise<void> {
        this.logger.debug('Initializing chain');
        const repo = dataSource.getRepository(DimChain);
        let chain = await repo.findOne({ where: { name: 'Acala' } });
        if (!chain) {
            chain = await repo.save({
                name: 'Acala',
                chainId: 1
            });
            this.logger.debug('Created new chain record');
        }
    }

    private async initAssetTypes(dataSource: any): Promise<void> {
        this.logger.debug('Initializing asset types');
        const repo = dataSource.getRepository(DimAssetType);
        const types = [
            { name: 'Native', description: 'Native token of the chain' },
            { name: 'LP Token', description: 'Liquidity pool token' },
            { name: 'Stablecoin', description: 'Stable value cryptocurrency' },
            { name: 'Governance', description: 'Governance token' }
        ];
        
        for (const type of types) {
            let existing = await repo.findOne({ where: { name: type.name } });
            if (!existing) {
                await repo.save(type);
                this.logger.debug(`Created asset type: ${type.name}`);
            }
        }
    }

    private async initReturnTypes(dataSource: any): Promise<void> {
        this.logger.debug('Initializing return types');
        const repo = dataSource.getRepository(DimReturnType);
        const types = [
            { name: 'Staking', description: 'Staking rewards' },
            { name: 'Liquidity Mining', description: 'Liquidity mining rewards' },
            { name: 'Lending', description: 'Lending interest' }
        ];
        
        for (const type of types) {
            let existing = await repo.findOne({ where: { name: type.name } });
            if (!existing) {
                await repo.save(type);
                this.logger.debug(`Created return type: ${type.name}`);
            }
        }
    }

    private async initStatCycles(dataSource: any): Promise<void> {
        this.logger.debug('Initializing stat cycles');
        const repo = dataSource.getRepository(DimStatCycle);
        const cycles = [
            { name: 'Daily', description: 'Daily statistics', days: 1 },
            { name: 'Weekly', description: 'Weekly statistics', days: 7 },
            { name: 'Monthly', description: 'Monthly statistics', days: 30 },
            { name: 'Quarterly', description: 'Quarterly statistics', days: 90 },
            { name: 'Yearly', description: 'Yearly statistics', days: 365 }
        ];
        
        for (const cycle of cycles) {
            let existing = await repo.findOne({ where: { name: cycle.name } });
            if (!existing) {
                await repo.save(cycle);
                this.logger.debug(`Created stat cycle: ${cycle.name}`);
            }
        }
    }
}
