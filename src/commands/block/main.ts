import { createApi, disconnectApi } from './apiConnector';
import { processBlock, processBlockRange } from './processor';

export async function getBlockDetails(timeRange?: string) {
  const api = await createApi();
  try {
    if (timeRange) {
      return await processBlockRange(api, timeRange);
    }
    return await processBlock(api);
  } finally {
    await disconnectApi(api);
  }
}
