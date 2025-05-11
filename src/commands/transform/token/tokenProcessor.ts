import { DimToken } from '../../../entities/DimToken';
import { DimAssetType } from '../../../entities/DimAssetType';
import { DimChain } from '../../../entities/DimChain';
import { DimReturnType } from '../../../entities/DimReturnType';
import { DimStatCycle } from '../../../entities/DimStatCycle';
import { initializeDataSource } from '../dataSource';
import { Logger, LogLevel } from '../../../utils/logger';

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
        
        // Handle currencyId input - extract actual token address
        let currencyIdStr: string;
        let symbol: string;
        let name: string;
        
        if (typeof currencyId === 'object' && currencyId !== null) {
            // Handle ForeignAsset format
            if (currencyId.ForeignAsset) {
                currencyIdStr = `ForeignAsset-${currencyId.ForeignAsset}`;
                symbol = currencyId.symbol || `FA${currencyId.ForeignAsset}`;
                name = currencyId.name || `Foreign Asset ${currencyId.ForeignAsset}`;
            }
            // Handle Token format
            else if (currencyId.Token) {
                currencyIdStr = `Token-${currencyId.Token}`;
                symbol = currencyId.symbol || currencyId.Token;
                name = currencyId.name || `Token ${currencyId.Token}`;
            }
            // Handle DexShare format
            else if (currencyId.DexShare) {
                const [token1, token2] = currencyId.DexShare;
                const token1Str = token1.Token ? `Token-${token1.Token}` : `ForeignAsset-${token1.ForeignAsset}`;
                const token2Str = token2.Token ? `Token-${token2.Token}` : `ForeignAsset-${token2.ForeignAsset}`;
                currencyIdStr = `DexShare-${token1Str}-${token2Str}`;
                symbol = currencyId.symbol || `LP-${token1Str.slice(0,5)}-${token2Str.slice(0,5)}`;
                name = currencyId.name || `Dex Share ${token1Str} ${token2Str}`;
            }
            // Handle plain address
            else if (currencyId.address || currencyId.id) {
                currencyIdStr = currencyId.address || currencyId.id;
                symbol = currencyId.symbol || currencyIdStr.slice(0, 20);
                name = currencyId.name || currencyIdStr.slice(0, 100);
            }
            // Handle JSON string input
            else if (currencyId.data) {
                try {
                    const data = typeof currencyId.data === 'string' ? 
                        JSON.parse(currencyId.data) : currencyId.data;
                    return upsertToken(data);
                } catch (e: any) {
                    throw new Error(`Invalid currencyId JSON: ${e?.message || 'Unknown error'}`);
                }
            }
            // Fallback to string representation
            else {
                currencyIdStr = JSON.stringify(currencyId).slice(0, 100);
                symbol = currencyIdStr.slice(0, 20);
                name = currencyIdStr;
            }
        } else {
            // Handle string/number input
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

        // Get or create asset type with transaction safety
        let assetType = await assetTypeRepo.findOne({ where: { name: assetTypeName } });
        if (!assetType) {
            try {
                assetType = await assetTypeRepo.save({
                    name: assetTypeName,
                    description: assetTypeName === 'LP Token' ? 'Liquidity Pool Token' : 'Native Token'
                });
            } catch (error) {
                // Handle race condition - another process may have created it
                assetType = await assetTypeRepo.findOne({ where: { name: assetTypeName } });
                if (!assetType) {
                    throw new Error(`Failed to create asset type ${assetTypeName}: ${error}`);
                }
            }
        }

        // Prepare token data with standardized address format
        const tokenData = {
            chainId: 1,
            address: currencyIdStr.replace(/[^a-zA-Z0-9-]/g, ''), // Sanitize address
            symbol: symbol.slice(0, 20),
            name: name.slice(0, 100),
            decimals: decimals,
            assetTypeId: assetType!.id,
            updatedAt: new Date()
        };

        // Validate address format
        if (!tokenData.address || tokenData.address.length > 100) {
            throw new Error(`Invalid token address format: ${tokenData.address}`);
        }

        // Upsert token and get full entity with transaction
        await queryRunner.startTransaction();
        try {
            await tokenRepo.upsert(tokenData, ['chainId', 'address']);
            // Force fresh query with all fields
            const token = await tokenRepo.createQueryBuilder('token')
                .where('token.chainId = :chainId AND token.address = :address', {
                    chainId: 1,
                    address: currencyIdStr
                })
                .leftJoinAndSelect('token.assetType', 'assetType')
                .setLock('pessimistic_write')
                .getOne();
            
            if (!token?.id) {
                throw new Error(`Failed to get valid token entity after upsert: ${currencyIdStr}`);
            }
            
            // Log full token details for debugging
            logger.debug('Retrieved token entity:', {
                id: token.id,
                chainId: token.chainId,
                address: token.address,
                symbol: token.symbol,
                assetType: token.assetType?.name
            });
            
            // Verify all required fields
            if (!token.id || !token.chainId || !token.address) {
                throw new Error(`Invalid token entity: missing required fields`);
            }
            
            // Add to cache
            tokenCache.set(currencyIdStr, token);
            await queryRunner.commitTransaction();
            return token;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
        
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
