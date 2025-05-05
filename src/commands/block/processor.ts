import { ApiPromise } from '@polkadot/api';

function parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/^(\d+)([dwmMy])$/);
    if (!match) {
        throw new Error(`Invalid time range format: ${timeRange}. Expected format like 2d, 3w, 1m, 1y`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 'd': return value * 24 * 60 * 60 * 1000; // days to ms
        case 'w': return value * 7 * 24 * 60 * 60 * 1000; // weeks to ms
        case 'm': return value * 30 * 24 * 60 * 60 * 1000; // months to ms
        case 'y': return value * 365 * 24 * 60 * 60 * 1000; // years to ms
        default: throw new Error(`Unknown time unit: ${unit}`);
    }
}

export async function processBlockRange(api: ApiPromise, timeRange: string) {
    const timeMs = parseTimeRange(timeRange);
    const now = Date.now();
    const targetTime = now - timeMs;
    
    // Get current block number and timestamp
    const header = await api.rpc.chain.getHeader();
    const latestBlock = header.number.toNumber();
    const latestTimestamp = parseInt((await api.query.timestamp.now()).toString());
    
    // Estimate block time (ms per block)
    const blockTime = 12000; // Acala has ~12s block time
    
    // Calculate approximate block number at target time
    const timeDiff = latestTimestamp - targetTime;
    const blocksDiff = Math.floor(timeDiff / blockTime);
    const startBlock = Math.max(0, latestBlock - blocksDiff);
    
    // Process each block in range
    const results = [];
    for (let blockNum = startBlock; blockNum <= latestBlock; blockNum++) {
        const hash = await api.rpc.chain.getBlockHash(blockNum);
        const header = await api.rpc.chain.getHeader(hash);
        const timestamp = await api.query.timestamp.now.at(hash);
        
        results.push({
            number: blockNum,
            hash: hash.toString(),
            timestamp: new Date(Number(timestamp.toString())).toISOString(),
            parentHash: header.parentHash.toString()
        });
    }
    
    return {
        blocks: results,
        timeRange: timeRange,
        fromBlock: startBlock,
        toBlock: latestBlock
    };
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
