import { ApiPromise, WsProvider } from '@polkadot/api';
import { ApiOptions } from '@polkadot/api/types';
import { BaseChainApiConnector } from './BaseChainApiConnector';

export class HydrationApiConnector extends BaseChainApiConnector {
    protected getEndpoints(): string[] {
        return [
            'wss://rpc.hydration.dfi.technology',
            'wss://hydration-rpc.dwellir.com'
        ];
    }

    async createApiConnection(maxRetries: number = 3, onStatusChange?: (status: 'connected' | 'disconnected' | 'error') => void): Promise<ApiPromise> {
        this.provider = new WsProvider(this.getEndpoints(), 2500);
        return super.createApiConnection(maxRetries, onStatusChange);
    }

    protected getApiOptions(): ApiOptions {
        return { provider: this.provider };
    }

    protected getChainName(): string {
        return 'Hydration';
    }
}
