import { ApiPromise, WsProvider } from '@polkadot/api';
import { ApiOptions } from '@polkadot/api/types';

export abstract class BaseChainApiConnector {
    protected provider: WsProvider;
    
    protected abstract getEndpoints(): string[];
    protected abstract getApiOptions(): ApiOptions;
    protected abstract getChainName(): string;

    async createApiConnection(maxRetries: number = 3, onStatusChange?: (status: 'connected' | 'disconnected' | 'error') => void): Promise<ApiPromise> {
        const provider = new WsProvider(this.getEndpoints(), 2500);
        
        provider.on('error', (error) => {
            console.error(`${this.getChainName()} WebSocket Error:`, error);
            onStatusChange?.('error');
        });
        
        provider.on('connected', () => {
            console.log(`Connected to ${this.getChainName()} at:`, provider.endpoint);
            onStatusChange?.('connected');
        });
        
        provider.on('disconnected', () => {
            console.log(`Disconnected from ${this.getChainName()} at:`, provider.endpoint);
            onStatusChange?.('disconnected');
        });
        
        let api: ApiPromise | null = null;
        let retries = 0;
        
        while (retries < maxRetries) {
            try {
                api = await ApiPromise.create(this.getApiOptions());
                await api.isReady;
                console.log(`${this.getChainName()} API connection established successfully`);
                return api;
            } catch (e) {
                console.error(`Error connecting to ${this.getChainName()} API (attempt ${retries + 1}/${maxRetries}):`, e);
                retries++;
                if (retries >= maxRetries) {
                    throw new Error(`Failed to connect to ${this.getChainName()} API after ${maxRetries} attempts`);
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        throw new Error(`${this.getChainName()} API connection could not be established`);
    }

    async disconnectApi(api: ApiPromise): Promise<void> {
        await api.disconnect();
    }

    async getBlockHeader(api: ApiPromise, blockNumber: number) {
        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
        return api.rpc.chain.getHeader(blockHash);
    }
}
