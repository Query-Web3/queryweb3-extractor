import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';

const ENDPOINTS = [
    'wss://acala-rpc.aca-api.network',
    'wss://karura-rpc.dwellir.com',
    'wss://karura.polkawallet.io'
];

export async function createApiConnection(maxRetries: number = 3): Promise<ApiPromise> {
    const provider = new WsProvider(ENDPOINTS, 2500);
    
    provider.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });
    
    provider.on('connected', () => {
        console.log('WebSocket connected to:', provider.endpoint);
    });
    
    provider.on('disconnected', () => {
        console.log('WebSocket disconnected from:', provider.endpoint);
    });
    
    let api: ApiPromise | null = null;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            api = await ApiPromise.create(options({ provider }));
            await api.isReady;
            console.log('API connection established successfully to:', provider.endpoint);
            return api;
        } catch (e) {
            console.error(`Error connecting to API (attempt ${retries + 1}/${maxRetries}):`, e);
            retries++;
            if (retries >= maxRetries) {
                throw new Error(`Failed to connect to API after ${maxRetries} attempts`);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    throw new Error('API connection could not be established');
}

export async function getBlockHeader(api: ApiPromise, blockNumber: number) {
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    return api.rpc.chain.getHeader(blockHash);
}
