import { ApiPromise, WsProvider } from '@polkadot/api';
import { ApiOptions } from '@polkadot/api/types';
import { BaseChainApiConnector } from './BaseChainApiConnector';

export class BifrostApiConnector extends BaseChainApiConnector {
    protected getEndpoints(): string[] {
        return [
            'wss://bifrost-rpc.liebi.com/ws',
            'wss://bifrost-rpc.dwellir.com'
        ];
    }

    async createApiConnection(maxRetries: number = 3, onStatusChange?: (status: string) => void): Promise<ApiPromise> {
        this.provider = new WsProvider(this.getEndpoints(), 2500);
        return super.createApiConnection(maxRetries, onStatusChange);
    }

    protected getApiOptions(): ApiOptions {
        return { provider: this.provider };
    }

    protected getChainName(): string {
        return 'Bifrost';
    }
}
