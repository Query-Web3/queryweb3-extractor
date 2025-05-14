import { ApiPromise, WsProvider } from '@polkadot/api';
import { ApiOptions } from '@polkadot/api/types';

// Connection pool settings
const MAX_POOL_SIZE = 5;
const CONNECTION_TIMEOUT = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

export abstract class BaseChainApiConnector {
    private static connectionPools: Record<string, ApiPromise[]> = {};
    private static healthCheckIntervals: Record<string, NodeJS.Timeout> = {};
    protected provider?: WsProvider;
    
    protected abstract getEndpoints(): string[];
    protected abstract getApiOptions(): ApiOptions;
    protected abstract getChainName(): string;

    private async initConnectionPool() {
        const chainName = this.getChainName();
        if (!BaseChainApiConnector.connectionPools[chainName]) {
            BaseChainApiConnector.connectionPools[chainName] = [];
            
            // Start health check for this pool
            BaseChainApiConnector.healthCheckIntervals[chainName] = setInterval(
                () => this.healthCheckPool(chainName),
                HEALTH_CHECK_INTERVAL
            );
        }
    }

    private async healthCheckPool(chainName: string) {
        const pool = BaseChainApiConnector.connectionPools[chainName] || [];
        for (const api of pool) {
            try {
                await api.rpc.chain.getBlockHash(1); // Simple health check
            } catch (e) {
                console.warn(`Removing unhealthy connection from ${chainName} pool`);
                await api.disconnect();
                pool.splice(pool.indexOf(api), 1);
            }
        }
    }

    async createApiConnection(maxRetries: number = 3, onStatusChange?: (status: string) => void): Promise<ApiPromise> {
        await this.initConnectionPool();
        const chainName = this.getChainName();
        const pool = BaseChainApiConnector.connectionPools[chainName];
        
        // Try to get an available connection
        for (const api of pool) {
            if (api.isConnected) {
                return api;
            }
        }
        
        // Create new connection if pool not full
        if (pool.length < MAX_POOL_SIZE) {
            const provider = new WsProvider(this.getEndpoints(), 2500);
            let api: ApiPromise | null = null;
            let retries = 0;
            
            while (retries < maxRetries) {
                try {
                    api = await ApiPromise.create(this.getApiOptions());
                    await api.isReady;
                    pool.push(api);
                    console.log(`Added new connection to ${chainName} pool (total: ${pool.length})`);
                    return api;
                } catch (e) {
                    console.error(`Error connecting to ${chainName} API (attempt ${retries + 1}/${maxRetries}):`, e);
                    retries++;
                    if (retries >= maxRetries) {
                        throw new Error(`Failed to connect to ${chainName} API after ${maxRetries} attempts`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        
        // Wait for available connection if pool is full
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for ${chainName} API connection`));
            }, CONNECTION_TIMEOUT);
            
            const checkPool = () => {
                const available = pool.find(api => api.isConnected);
                if (available) {
                    clearTimeout(timeout);
                    resolve(available);
                } else {
                    setTimeout(checkPool, 100);
                }
            };
            
            checkPool();
        });
    }

    async disconnectApi(api: ApiPromise): Promise<void> {
        const chainName = this.getChainName();
        const pool = BaseChainApiConnector.connectionPools[chainName] || [];
        
        // Only disconnect if pool is full
        if (pool.length >= MAX_POOL_SIZE) {
            await api.disconnect();
            pool.splice(pool.indexOf(api), 1);
        }
    }

    async getBlockHeader(api: ApiPromise, blockNumber: number) {
        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
        return api.rpc.chain.getHeader(blockHash);
    }
}
