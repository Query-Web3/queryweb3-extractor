# 详细使用说明

## 主要命令

### 运行提取器
```bash
pnpm start
```

### 提取Acala网络数据
```bash
pnpm start extract
```

### 清空指定前缀的表
```bash
pnpm start truncate -- --schema=前缀
# 多前缀示例:
pnpm start truncate -- --schema=dim,fact  # 将清空dim_*和fact_*表
```

### 转换原始数据为维度模型
```bash
pnpm start transform
```

### 获取当前区块链信息
```bash
pnpm start block
```

## 区块命令详情

`block`命令提供实时区块链信息，包括:

- 当前区块详情:
  - 区块号
  - 区块哈希
  - 时间戳
  - 父哈希
- 链信息:
  - 链名称
  - 节点名称
  - 节点版本
- 链统计:
  - 总区块数
  - 最终确认区块号

示例输出:
```json
{
  "currentBlock": {
    "number": 1234567,
    "hash": "0x123...abc",
    "timestamp": "2025-04-30T13:42:00.000Z",
    "parentHash": "0x456...def"
  },
  "chainInfo": {
    "chain": "Acala",
    "nodeName": "acala-node",
    "nodeVersion": "1.2.3"
  },
  "chainStats": {
    "totalBlocks": 1234567,
    "finalizedBlock": 1234560
  }
}
```

## 历史数据提取选项

运行提取命令时可指定:

- `-s|--startBlock`: 起始区块号(包含)
- `-e|--endBlock`: 结束区块号(包含)

参数组合:
1. 同时指定`-s`和`-e`: 处理指定范围内的区块
2. 仅指定`-s`: 从startBlock处理到最新区块
3. 仅指定`-e`: 从区块0处理到endBlock
4. 无参数: 自动从数据库最高区块+1到最新区块

示例:
```bash
# 提取区块1000000到1000100
pnpm start extract -- --startBlock=1000000 --endBlock=1000100

# 从区块1000000提取到最新
pnpm start extract -- --startBlock=1000000

# 从区块0提取到1000100
pnpm start extract -- --endBlock=1000100

# 自动检测范围(从数据库最高区块+1到最新)
pnpm start extract
```

注意: 提取历史数据时:
1. 仅运行一次(非持续运行)
2. 跳过数据库中已存在的区块
3. 跳过数据库中已存在的交易/事件

## 使用PM2运行生产环境

使用PM2将提取和转换进程作为后台服务运行:

1. 全局安装PM2(如未安装):
```bash
pnpm install -g pm2
```

2. 启动服务进程:
```bash
./start_service.sh
```

3. 查看进程状态:
```bash
pm2 list
```

4. 查看日志:
```bash
pm2 logs
```

## 重建项目
```bash
./rebuild.sh
./start_service.sh
```

## 配置选项(.env文件)

- 数据库连接(必填):
  - 提取进程(必须使用EXTRACT_DB_前缀):
    - `EXTRACT_DB_HOST`: 提取数据库主机(必填)
    - `EXTRACT_DB_PORT`: 提取数据库端口(默认: "3306")
    - `EXTRACT_DB_USER`: 提取数据库用户名(必填)
    - `EXTRACT_DB_PASSWORD`: 提取数据库密码(必填)
    - `EXTRACT_DB_NAME`: 提取数据库名称(必填)
  
  - 转换进程(必须使用TRANSFORM_DB_前缀):
    - `TRANSFORM_DB_HOST`: 转换数据库主机(必填)
    - `TRANSFORM_DB_PORT`: 转换数据库端口(默认: "3306")
    - `TRANSFORM_DB_USER`: 转换数据库用户名(必填)
    - `TRANSFORM_DB_PASSWORD`: 转换数据库密码(必填)
    - `TRANSFORM_DB_NAME`: 转换数据库名称(必填)

注意: 提取和转换进程现在需要各自的数据库连接。已移除对通用DB_变量的回退以防止配置错误。

- 任务调度:
  - `EXTRACT_INTERVAL_MS`: 提取轮询间隔(毫秒)(默认: 3600000 - 1小时)
  - `TRANSFORM_INTERVAL_MS`: 转换轮询间隔(毫秒)(默认: 3600000 - 1小时)

- 网络端点:
  - `ACALA_RPC_URL`: Acala网络RPC端点(默认: wss://acala-rpc.aca-api.network)
  - `KARURA_RPC_URL`: Karura网络RPC端点(默认: wss://karura.api.onfinality.io/public-ws)
