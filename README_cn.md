# Block Chain Data Extractor

## 目录
- [功能概述](#功能概述)
- [环境依赖](#环境依赖)
- [安装](#安装)
- [基本使用方法](#基本使用方法)
  - [Extract命令](#extract命令)
  - [Transform命令](#transform命令)
- [详细文档](#详细文档)
- [版权声明](#版权声明)

区块链数据提取工具，用于从基于Polkadot/Substrate网络提取和存储详细的交易信息。

## 功能概述

- 获取区块数据（区块号、哈希、时间戳）
- 提取详细交易信息（交易方法、签名地址、手续费等）
- 捕获并存储链上事件
- 支持指定范围的历史数据提取
- 自动去重机制
- 数据存储到MySQL数据库

## 环境依赖

- Node.js 16+
- MySQL 5.7+
- Acala节点RPC访问权限

## 安装

1. 克隆仓库
2. 安装依赖：
```bash
pnpm install
```

3. 配置数据库连接（修改.env文件）：
```env
DATABASE_URL="mysql://user:password@localhost:3306/db_name"
```

4. 运行数据库迁移：
```bash
pnpm exec prisma migrate dev
```

5. 构建项目：
```bash
ppnpm start build
```

## 基本使用方法

### 启动提取器
```bash
pnpm start
```

### 提取Acala网络数据
```bash
ppnpm start extract
```

### 转换原始数据为维度模型
```bash
ppnpm start transform
```

### 查看区块信息
```bash
ppnpm start block
```

更多详细文档请参考：
- [数据库结构](doc/cn/database.md)
- [事件规范](doc/cn/events.md)
- [Extract命令详解](doc/cn/extract_command.md)
- [Transform命令详解](doc/cn/transform_command.md)
- [使用指南](doc/cn/usage.md)
- [英文文档](doc/en/usage.md)

## 版权声明

[Apache License 2.0](LICENSE)

[查看英文版本](README.md)
