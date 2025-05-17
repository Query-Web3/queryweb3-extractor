import { ApiPromise, WsProvider } from '@polkadot/api';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

let sharedApi: ApiPromise | null = null;
let apiUsageCount = 0;

export async function getSharedApiConnection(): Promise<ApiPromise> {
    if (!sharedApi) {
        const provider = new WsProvider(process.env.ACALA_WS_URL || 'ws://localhost:9944');
        sharedApi = await ApiPromise.create({ provider });
        logger.info('Created new shared API connection');
    }
    apiUsageCount++;
    return sharedApi;
}

export async function releaseSharedApiConnection(api: ApiPromise) {
    apiUsageCount--;
    if (apiUsageCount <= 0 && sharedApi) {
        await sharedApi.disconnect();
        sharedApi = null;
        logger.info('Released shared API connection');
    }
}

// 保持原有接口兼容
export async function createApi(): Promise<ApiPromise> {
    logger.warn('createApi() is deprecated, use getSharedApiConnection() instead');
    return getSharedApiConnection();
}

export async function disconnectApi(api: ApiPromise) {
    logger.warn('disconnectApi() is deprecated, use releaseSharedApiConnection() instead');
    await releaseSharedApiConnection(api);
}
