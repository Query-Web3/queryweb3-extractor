import { createApi, disconnectApi } from './apiConnector';
import { processBlock } from './processor';

export async function getBlockDetails() {
  const api = await createApi();
  try {
    return await processBlock(api);
  } finally {
    await disconnectApi(api);
  }
}
