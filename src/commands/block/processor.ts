import { ApiPromise } from '@polkadot/api';
import { 
    parseTimeRange,
    getLatestBlockNumber,
    getBlockTimestamp
} from '../../utils/blockTime';

export async function processBlockRange(api: ApiPromise, timeRange: string) {
    const timeMs = parseTimeRange(timeRange);
    const now = Date.now();
    const targetTime = now - timeMs;
    
    // Get current block number and timestamp
    const latestBlock = await getLatestBlockNumber(api);
    const latestTimestamp = await getBlockTimestamp(api, await api.rpc.chain.getBlockHash(latestBlock));
    
    // Use binary search to find the exact block matching target time
    let low = 0;
    let high = latestBlock;
    let startBlock = latestBlock;
    
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const hash = await api.rpc.chain.getBlockHash(mid);
        const timestamp = await getBlockTimestamp(api, hash);
        
        if (timestamp >= targetTime) {
            startBlock = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    
    // Get the first block in time range
    try {
        const hash = await api.rpc.chain.getBlockHash(startBlock);
        const header = await api.rpc.chain.getHeader(hash);
        const timestamp = await api.query.timestamp.now.at(hash);
        
        return {
            timeRange: timeRange,
            firstBlock: {
                number: startBlock,
                hash: hash.toString(),
                timestamp: new Date(Number(timestamp.toString())).toISOString(),
                parentHash: header.parentHash.toString()
            },
            latestBlock: latestBlock,
            blockDiff: latestBlock - startBlock
        };
    } catch (err) {
        console.error(`Error processing first block ${startBlock}:`, err);
        throw err;
    }
}

export async function processBlock(api: ApiPromise) {
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
}
