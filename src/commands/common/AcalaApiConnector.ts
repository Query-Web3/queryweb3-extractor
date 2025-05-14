import { ApiPromise, WsProvider } from '@polkadot/api';
import { ApiOptions } from '@polkadot/api/types';
import { options } from '@acala-network/api';
import { BaseChainApiConnector } from './BaseChainApiConnector';

export class AcalaApiConnector extends BaseChainApiConnector {
    protected getEndpoints(): string[] {
        return [
            'wss://acala-rpc.aca-api.network',
            'wss://karura-rpc.dwellir.com',
            'wss://karura.polkawallet.io'
        ];
    }

    async createApiConnection(maxRetries: number = 3, onStatusChange?: (status: string) => void): Promise<ApiPromise> {
        this.provider = new WsProvider(this.getEndpoints(), 2500);
        return super.createApiConnection(maxRetries, onStatusChange);
    }

    protected getApiOptions(): ApiOptions {
        return options({ provider: this.provider });
    }

    protected getChainName(): string {
        return 'Acala/Karura';
    }
}
