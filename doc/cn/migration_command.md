# 迁移命令

迁移命令用于初始化和更新提取器系统的数据库模式。

## 命令语法

```bash
pnpm start migration [选项]
```

## 选项

| 选项         | 描述 |
|--------------|------|
| --all        | 初始化所有数据库(批处理、提取和转换) |
| --batch      | 仅初始化批处理数据库 |
| --extract    | 仅初始化提取数据库 |
| --transform  | 仅初始化转换数据库 |

## 功能描述

迁移命令执行以下操作：

1. 连接到指定的数据库
2. 如果数据库不存在则创建
3. 执行SQL脚本创建所有需要的表
4. 设置初始索引和约束
5. 记录所有操作以供审计

## 数据库配置

命令使用以下环境变量：

- 批处理数据库：
  - BATCH_DB_HOST
  - BATCH_DB_PORT
  - BATCH_DB_USER
  - BATCH_DB_PASSWORD
  - BATCH_DB_NAME

- 提取数据库：
  - EXTRACT_DB_HOST
  - EXTRACT_DB_PORT
  - EXTRACT_DB_USER
  - EXTRACT_DB_PASSWORD
  - EXTRACT_DB_NAME

- 转换数据库：
  - TRANSFORM_DB_HOST
  - TRANSFORM_DB_PORT
  - TRANSFORM_DB_USER
  - TRANSFORM_DB_PASSWORD
  - TRANSFORM_DB_NAME

## 使用示例

初始化所有数据库：
```bash
pnpm start migration --all
```

仅初始化批处理数据库：
```bash
pnpm start migration --batch
```

仅初始化提取数据库：
```bash
pnpm start migration --extract
```

仅初始化转换数据库：
```bash
pnpm start migration --transform
```

## 注意事项

1. 需要数据库管理员凭证，执行时会提示输入
2. 除非明确指定，否则不会删除现有表
3. 所有操作都会记录到batch_log表
4. 检查日志获取详细执行结果
