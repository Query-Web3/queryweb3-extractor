import dotenv from 'dotenv';
dotenv.config();
import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@acala-network/api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INTERVAL_MS = process.env.INTERVAL_MS ? Number(process.env.INTERVAL_MS) : 3600000;

async function processBlock() {
    // 通过WebSocket连接Acala网络
    const wsProvider = new WsProvider('wss://acala-rpc.aca-api.network');
    const provider = new WsProvider('wss://karura.api.onfinality.io/public-ws');
    const api = new ApiPromise(options({ provider }));
    await api.isReady;
    
    // 获取最新区块头信息
    const header = await api.rpc.chain.getHeader();
    console.log(`Connected to Acala network - Block Number: ${header.number}, Block Hash: ${header.hash}`);
    
    // 获取块详情，包括extrinsics
    const signedBlock = await api.rpc.chain.getBlock(header.hash);
    
    // 处理extrinsics数据
    const extrinsics = signedBlock.block.extrinsics.map((ext: any, index: number) => ({
        index: index,
        method: ext.method.toString(),
        signer: ext.signer ? ext.signer.toString() : null
    }));
    
    // 将块数据保存到MySQL数据库中
    const blockRecord = await prisma.block.create({
      data: {
        number: header.number.toNumber(),
        hash: header.hash.toString()
      }
    });
    console.log('Block saved:', blockRecord);
    
    // 将extrinsics数据保存到MySQL数据库中
    if (extrinsics.length > 0) {
      const extrinsicResult = await prisma.extrinsic.createMany({
        data: extrinsics.map(ext => ({
          blockId: blockRecord.id,
          index: ext.index,
          method: ext.method,
          signer: ext.signer
        }))
      });
      console.log('Extrinsics saved:', extrinsicResult);
    }
    
    // 断开API连接
    await api.disconnect();
}

async function run() {
    while (true) {
        try {
            await processBlock();
        } catch (e) {
            console.error(e);
        }
        console.log(`等待 ${INTERVAL_MS / 3600000} 小时后继续运行...`);
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    }
}

run().finally(async () => {
    await prisma.$disconnect();
});