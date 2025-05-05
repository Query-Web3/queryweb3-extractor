import { createApi, disconnectApi } from './apiConnector';
import { processBlock, processBlockRange } from './processor';

export async function getBlockDetails(timeRange?: string) {
  const api = await createApi();
  try {
    if (timeRange) {
      const result = await processBlockRange(api, timeRange);
      await disconnectApi(api);
      return result;
    }
    const result = await processBlock(api);
    await disconnectApi(api);
    return result;
  } catch (err) {
    await disconnectApi(api);
    throw err;
  }
}
