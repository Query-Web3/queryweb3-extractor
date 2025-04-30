import { ApiPromise, WsProvider } from '@polkadot/api';

export async function getBlockDetails() {
  // 连接到Acala节点
  const provider = new WsProvider('wss://acala-rpc-0.aca-api.network');
  const api = await ApiPromise.create({ provider });

  try {
    // 获取最新区块哈希和区块头
    const hash = await api.rpc.chain.getBlockHash();
    const header = await api.rpc.chain.getHeader(hash);
    
    // 获取区块时间戳
    const timestamp = await api.query.timestamp.now.at(hash);

    // 获取链上元数据
    const [chain, nodeName, nodeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version()
    ]);

    // 获取链上统计信息
    const totalBlocks = await api.query.system.number();
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHead);

    return {
      currentBlock: {
        number: header.number.toNumber(),
        hash: hash.toString(),
        timestamp: new Date(Number(timestamp.toString())).toISOString(),
        parentHash: header.parentHash.toString()
      },
      chainInfo: {
        chain: chain.toString(),
        nodeName: nodeName.toString(),
        nodeVersion: nodeVersion.toString()
      },
      chainStats: {
        totalBlocks: Number(totalBlocks.toString()),
        finalizedBlock: finalizedHeader.number.toNumber()
      }
    };
  } finally {
    await api.disconnect();
  }
}
