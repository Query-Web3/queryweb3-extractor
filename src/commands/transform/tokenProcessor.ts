import { DimToken } from '../../entities/DimToken';
import { DimAssetType } from '../../entities/DimAssetType';
import { DimChain } from '../../entities/DimChain';
import { DimReturnType } from '../../entities/DimReturnType';
import { DimStatCycle } from '../../entities/DimStatCycle';
import { initializeDataSource } from './dataSource';
import { Logger, LogLevel } from '../../utils/logger';

// Cache for processed tokens to avoid repeated database operations
const tokenCache = new Map<string, DimToken>();

export async function upsertToken(currencyId: any) {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const tokenTimer = logger.time('Upsert token');
    const dataSource = await initializeDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        const assetTypeRepo = queryRunner.manager.getRepository(DimAssetType);
        const tokenRepo = queryRunner.manager.getRepository(DimToken);
        
        // Handle object input by extracting relevant fields or stringifying
        let currencyIdStr: string;
        let symbol: string;
        let name: string;
        
        if (typeof currencyId === 'object' && currencyId !== null) {
            currencyIdStr = currencyId.address || currencyId.id || JSON.stringify(currencyId);
            symbol = currencyId.symbol || currencyIdStr.slice(0, 20);
            name = currencyId.name || currencyIdStr.slice(0, 100);
        } else {
            currencyIdStr = String(currencyId);
            symbol = currencyIdStr;
            name = currencyIdStr;
        }
        
        // Check cache first
        if (tokenCache.has(currencyIdStr)) {
            return tokenCache.get(currencyIdStr)!;
        }

        // Determine token type and metadata
        let assetTypeName = 'Native';
        let decimals = 12; // Default for most Substrate chains
        
        if (currencyIdStr.startsWith('LP-')) {
            assetTypeName = 'LP Token';
            symbol = 'LP-' + currencyIdStr.split('-')[1].slice(0, 15);
            name = 'Liquidity Pool ' + currencyIdStr.split('-')[1];
        } else if (currencyIdStr === 'AUSD') {
            assetTypeName = 'Stablecoin';
            symbol = 'AUSD';
            name = 'Acala Dollar';
            decimals = 12;
        } else if (currencyIdStr === 'ACA') {
            symbol = 'ACA';
            name = 'Acala';
            decimals = 12;
        }

        // Get or create asset type
        let assetType = await assetTypeRepo.findOne({ where: { name: assetTypeName } });
        if (!assetType) {
            assetType = await assetTypeRepo.save({
                name: assetTypeName,
                description: assetTypeName === 'LP Token' ? 'Liquidity Pool Token' : 'Native Token'
            });
        }

        // Prepare token data
        const tokenData = {
            chainId: 1,
            address: currencyIdStr,
            symbol: symbol.slice(0, 20),
            name: name.slice(0, 100),
            decimals: decimals,
            assetTypeId: assetType!.id,
            updatedAt: new Date()
        };

        // Upsert token
        const result = await tokenRepo.upsert(tokenData, ['chainId', 'address']);
        const token = Array.isArray(result.identifiers) ? 
            result.identifiers[0] as DimToken : 
            result.identifiers as DimToken;
        
        // Add to cache
        tokenCache.set(currencyIdStr, token);
        
        logger.info(`Token ${symbol} (${currencyIdStr}) processed`);
        return token;
    } finally {
        await queryRunner.release();
        tokenTimer.end();
    }
}

export async function initializeDimensionTables() {
    const logger = Logger.getInstance();
    logger.setLogLevel(process.env.LOG_LEVEL as LogLevel || LogLevel.INFO);
    
    const initTimer = logger.time('Initialize dimension tables');
    const dataSource = await initializeDataSource();
    
    // Initialize chain
    logger.debug('Initializing chain');
    const chainRepo = dataSource.getRepository(DimChain);
    let chain = await chainRepo.findOne({ where: { name: 'Acala' } });
    if (!chain) {
        chain = await chainRepo.save({
            name: 'Acala',
            chainId: 1
        });
        logger.debug('Created new chain record');
    }

    // Initialize asset types
    logger.debug('Initializing asset types');
    const assetTypeRepo = dataSource.getRepository(DimAssetType);
    const assetTypes = [
        { name: 'Native', description: 'Native token of the chain' },
        { name: 'LP Token', description: 'Liquidity pool token' },
        { name: 'Stablecoin', description: 'Stable value cryptocurrency' },
        { name: 'Governance', description: 'Governance token' }
    ];
    
    for (const type of assetTypes) {
        let existing = await assetTypeRepo.findOne({ where: { name: type.name } });
        if (!existing) {
            await assetTypeRepo.save(type);
            logger.debug(`Created asset type: ${type.name}`);
        }
    }

    // Initialize return types
    logger.debug('Initializing return types');
    const returnTypeRepo = dataSource.getRepository(DimReturnType);
    const returnTypes = [
        { name: 'Staking', description: 'Staking rewards' },
        { name: 'Liquidity Mining', description: 'Liquidity mining rewards' },
        { name: 'Lending', description: 'Lending interest' }
    ];
    
    for (const type of returnTypes) {
        let existing = await returnTypeRepo.findOne({ where: { name: type.name } });
        if (!existing) {
            await returnTypeRepo.save(type);
            logger.debug(`Created return type: ${type.name}`);
        }
    }

    // Initialize stat cycles
    logger.debug('Initializing stat cycles');
    const statCycleRepo = dataSource.getRepository(DimStatCycle);
    const statCycles = [
        { name: 'Daily', description: 'Daily statistics', days: 1 },
        { name: 'Weekly', description: 'Weekly statistics', days: 7 },
        { name: 'Monthly', description: 'Monthly statistics', days: 30 },
        { name: 'Quarterly', description: 'Quarterly statistics', days: 90 },
        { name: 'Yearly', description: 'Yearly statistics', days: 365 }
    ];
    
    for (const cycle of statCycles) {
        let existing = await statCycleRepo.findOne({ where: { name: cycle.name } });
        if (!existing) {
            await statCycleRepo.save(cycle);
            logger.debug(`Created stat cycle: ${cycle.name}`);
        }
    }
    
    initTimer.end();
}
