import { ApiPromise, WsProvider } from '@polkadot/api';

export async function createApi(): Promise<ApiPromise> {
  const provider = new WsProvider('wss://acala-rpc-0.aca-api.network');
  return ApiPromise.create({ provider });
}

export async function disconnectApi(api: ApiPromise): Promise<void> {
  await api.disconnect();
}
