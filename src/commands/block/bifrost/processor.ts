import { ApiPromise } from '@polkadot/api';
import { BaseBlockProcessor } from '../BaseBlockProcessor';

export class BifrostBlockProcessor extends BaseBlockProcessor {
    protected getBlockTime(): number {
        return 12; // Bifrost block time in seconds
    }

    protected async getChainSpecificInfo(api: ApiPromise): Promise<Record<string, any>> {
        return {}; // Bifrost doesn't need additional chain specific info
    }
}

export const processor = new BifrostBlockProcessor();
