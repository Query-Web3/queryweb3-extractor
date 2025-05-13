import { ApiPromise } from '@polkadot/api';
import { BaseBlockProcessor } from '../BaseBlockProcessor';

export class AcalaBlockProcessor extends BaseBlockProcessor {
    protected getBlockTime(): number {
        return 12; // Acala block time in seconds
    }

    protected async getChainSpecificInfo(api: ApiPromise): Promise<Record<string, any>> {
        return {}; // Acala doesn't need additional chain specific info
    }
}

export const processor = new AcalaBlockProcessor();
