import { ApiPromise } from '@polkadot/api';
import { BaseBlockProcessor } from '../BaseBlockProcessor';

export class HydrationBlockProcessor extends BaseBlockProcessor {
    protected getBlockTime(): number {
        return 6; // Hydration block time in seconds
    }

    protected async getChainSpecificInfo(api: ApiPromise): Promise<Record<string, any>> {
        return {}; // Hydration doesn't need additional chain specific info
    }
}

export const processor = new HydrationBlockProcessor();
