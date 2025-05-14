import { ApiPromise } from '@polkadot/api';
import { ApiConnectorFactory } from './ApiConnectorFactory';

export async function createApiConnection(maxRetries: number = 3, onStatusChange?: (status: string) => void): Promise<ApiPromise> {
    const chain = process.env.CHAIN || 'acala';
    const connector = ApiConnectorFactory.getConnector(chain);
    return connector.createApiConnection(maxRetries, onStatusChange);
}

export async function createApi(): Promise<ApiPromise> {
    return createApiConnection(1);
}

export async function disconnectApi(api: ApiPromise): Promise<void> {
    const chain = process.env.CHAIN || 'acala';
    const connector = ApiConnectorFactory.getConnector(chain);
    return connector.disconnectApi(api);
}

export async function getBlockHeader(api: ApiPromise, blockNumber: number) {
    const chain = process.env.CHAIN || 'acala';
    const connector = ApiConnectorFactory.getConnector(chain);
    return connector.getBlockHeader(api, blockNumber);
}
