# 区块链数据提取器

[查看英文版本](README.md)

---

![项目徽章](https://img.shields.io/badge/Blockchain-Data-blue)
![许可证](https://img.shields.io/badge/License-Apache%202.0-green)

## 目录
- [功能概述](#功能概述)
- [系统要求](#系统要求)
- [安装指南](#安装指南)
- [基本用法](#基本用法)
  - [数据提取命令](#数据提取命令) ([详情](doc/cn/extract_command.md))
  - [数据转换命令](#数据转换命令) ([详情](doc/cn/transform_command.md))
  - [区块命令](#区块命令) ([详情](doc/cn/block_command.md))
  - [清空命令](#清空命令) ([详情](doc/cn/truncate_command.md))
  - [迁移命令](#迁移命令) ([详情](doc/cn/migration_command.md))
- [数据库结构](doc/cn/database.md)
- [事件规范](doc/cn/events.md)
- [使用指南](doc/cn/usage.md)
- [许可证](#许可证)
- [查看英文版本](README.md)

## 功能概述

- 获取区块数据(区块号、哈希、时间戳)
- 提取详细的交易信息(方法、签名地址、费用等)
- 捕获并存储链上事件
- 支持指定范围内的历史数据提取
- 自动去重机制
- 数据存储在MySQL数据库
- 数据库迁移工具用于模式管理

## 系统要求

- Node.js 22.15+ (pnpm 8.10+)
- MySQL 5.7+
- Redis 5.0+
- 访问Acala节点RPC

## 安装指南

1. 克隆仓库
2. 安装依赖:
```bash
pnpm install
```

3. 配置数据库连接(复制.env.example为.env并编辑):
```env
# 批处理数据库
BATCH_DB_HOST="127.0.0.1"
BATCH_DB_PORT="3306"
BATCH_DB_USER="root"
BATCH_DB_PASSWORD="password"
BATCH_DB_NAME="QUERYWEB3_BATCH"

# 提取数据库
EXTRACT_DB_HOST="127.0.0.1"
EXTRACT_DB_PORT="3306"
EXTRACT_DB_USER="root"
EXTRACT_DB_PASSWORD="password"
EXTRACT_DB_NAME="QUERYWEB3_EXTRACT"

# 转换数据库
TRANSFORM_DB_HOST="127.0.0.1"
TRANSFORM_DB_PORT="3306"
TRANSFORM_DB_USER="root"
TRANSFORM_DB_PASSWORD="password"
TRANSFORM_DB_NAME="QUERYWEB3"

# Redis缓存配置
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
REDIS_PASSWORD=""
```

4. 运行数据库迁移:
```bash
pnpm start migration --all
```

5. 构建项目:
```bash
pnpm build
```

## 基本用法

### 启动提取器
```bash
pnpm start
```

### 从Acala网络提取数据
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

### 初始化或更新数据库模式
```bash
# 初始化所有数据库和表
ppnpm start migration --all

# 仅初始化批处理数据库
ppnpm start migration --batch

# 仅初始化提取数据库
ppnpm start migration --extract

# 仅初始化转换数据库
ppnpm start migration --transform
```

更多详细文档请参考:
- [数据库结构](doc/cn/database.md)
- [事件规范](doc/cn/events.md)
- [数据提取命令详情](doc/cn/extract_command.md)
- [数据转换命令详情](doc/cn/transform_command.md)
- [区块命令详情](doc/cn/block_command.md)
- [清空命令详情](doc/cn/truncate_command.md)
- [迁移命令详情](doc/cn/migration_command.md)
- [使用指南](doc/cn/usage.md)

## 许可证

[Apache License 2.0](LICENSE)
