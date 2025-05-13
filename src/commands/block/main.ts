import { createApi, disconnectApi } from '../common/apiConnector';
import { program } from '../../index';
import { processor as acalaProcessor } from './acala/processor';
import { processor as hydrationProcessor } from './hydration/processor';
import { processor as stellswapProcessor } from './stellaswap/processor';
import { processor as bifrostProcessor } from './bifrost/processor';

const processors: Record<string, any> = {
  acala: acalaProcessor,
  hydration: hydrationProcessor,
  stellswap: stellswapProcessor,
  bifrost: bifrostProcessor
};

export async function getBlockDetails(timeRange?: string) {
  const chain = program.opts().chain || 'acala';
  const processor = processors[chain];
  if (!processor) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  const api = await createApi();
  try {
    if (timeRange) {
      const result = await processor.processBlockRange(api, timeRange);
      await disconnectApi(api);
      return result;
    }
    const result = await processor.processBlock(api);
    await disconnectApi(api);
    return result;
  } catch (err) {
    await disconnectApi(api);
    throw err;
  }
}
