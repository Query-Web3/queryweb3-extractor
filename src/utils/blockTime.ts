import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import type { BlockHash } from '@polkadot/types/interfaces';

export function parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/^(\d+)([hdwmMy])$/);
    if (!match) {
        throw new Error(`Invalid time range format: ${timeRange}. Expected format like 2h, 3d, 1w, 1m, 1y`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 'h': return value * 60 * 60 * 1000; // hours to ms
        case 'd': return value * 24 * 60 * 60 * 1000; // days to ms
        case 'w': return value * 7 * 24 * 60 * 60 * 1000; // weeks to ms
        case 'm': return value * 30 * 24 * 60 * 60 * 1000; // months to ms
        case 'y': return value * 365 * 24 * 60 * 60 * 1000; // years to ms
        default: throw new Error(`Unknown time unit: ${unit}`);
    }
}

export async function createApi(): Promise<ApiPromise> {
    const provider = new WsProvider('wss://acala-rpc.aca-api.network');
    return ApiPromise.create(options({ provider }));
}

export async function disconnectApi(api: ApiPromise): Promise<void> {
    await api.disconnect();
}

export async function getLatestBlockNumber(api: ApiPromise): Promise<number> {
    const header = await api.rpc.chain.getHeader();
    return header.number.toNumber();
}

export async function getBlockTimestamp(api: ApiPromise, blockHash: string | BlockHash): Promise<number> {
    const hashStr = typeof blockHash === 'string' ? blockHash : blockHash.toString();
    return parseInt((await api.query.timestamp.now.at(hashStr)).toString());
}
