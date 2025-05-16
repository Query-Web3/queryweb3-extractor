# 事件类型说明

事件表中的`section`和`method`字段表示Acala链中的模块和事件类型。以下是常见模块及其事件的数据结构说明：

## 系统事件 (section: 'system')

### ExtrinsicSuccess
```typescript
interface ExtrinsicSuccess {
  blockNumber: number;      // 区块高度
  blockHash: string;        // 区块哈希
  extrinsicIndex: number;   // 交易索引
  dispatchInfo: {           // 调度信息
    weight: number;         // 权重
    class: string;          // 交易类别
    paysFee: boolean;       // 是否支付手续费
  };
}
```

### ExtrinsicFailed
```typescript
interface ExtrinsicFailed {
  blockNumber: number;      // 区块高度
  blockHash: string;        // 区块哈希
  extrinsicIndex: number;   // 交易索引
  dispatchError: {          // 错误信息
    module: string;         // 错误模块
    error: string;          // 错误代码
    documentation: string[];// 错误说明
  };
  dispatchInfo: {           // 调度信息
    weight: number;         // 权重
    class: string;          // 交易类别
    paysFee: boolean;       // 是否支付手续费
  };
}
```

## 余额事件 (section: 'balances')

### Transfer
```typescript
interface Transfer {
  blockNumber: number;      // 区块高度
  from: string;             // 发送方地址
  to: string;               // 接收方地址
  amount: string;           // 转账金额(字符串格式)
  currencyId: string;       // 代币ID
  fee: string;              // 手续费
  timestamp: number;        // 时间戳
}
```

### Deposit
```typescript
interface Deposit {
  blockNumber: number;      // 区块高度
  account: string;          // 账户地址
  amount: string;           // 存款金额
  currencyId: string;       // 代币ID
  timestamp: number;        // 时间戳
}
```

## DEX事件 (section: 'dex')

### Swap
```typescript
interface Swap {
  blockNumber: number;      // 区块高度
  trader: string;           // 交易者地址
  path: string[];           // 交易路径
  amountIn: string;         // 输入金额
  amountOut: string;        // 输出金额
  fee: string;              // 手续费
  timestamp: number;        // 时间戳
}
```

### AddLiquidity
```typescript
interface AddLiquidity {
  blockNumber: number;      // 区块高度
  provider: string;         // 流动性提供者
  tokenA: string;           // 代币A
  tokenB: string;           // 代币B
  amountA: string;          // 代币A数量
  amountB: string;          // 代币B数量
  liquidityToken: string;   // 流动性代币数量
  timestamp: number;        // 时间戳
}
```

## Homa事件 (section: 'homa')

### Minted
```typescript
interface Minted {
  blockNumber: number;      // 区块高度
  account: string;          // 账户地址
  amount: string;           // 铸造数量
  liquidAmount: string;     // 流动性代币数量
  timestamp: number;        // 时间戳
}
```

注意：实际可用的模块和方法取决于Acala运行时版本和配置。最新列表请参考[Acala文档](https://wiki.acala.network/)。
