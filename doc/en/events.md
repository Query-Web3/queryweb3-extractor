# Event Types Specification

The `section` and `method` fields in event tables represent modules and event types in Acala chain. Below are data structure specifications for common modules and events:

## System Events (section: 'system')

### ExtrinsicSuccess
```typescript
interface ExtrinsicSuccess {
  blockNumber: number;      // Block height
  blockHash: string;        // Block hash
  extrinsicIndex: number;   // Extrinsic index
  dispatchInfo: {           // Dispatch info
    weight: number;         // Weight
    class: string;          // Dispatch class
    paysFee: boolean;       // Whether pays fee
  };
}
```

### ExtrinsicFailed
```typescript
interface ExtrinsicFailed {
  blockNumber: number;      // Block height
  blockHash: string;        // Block hash
  extrinsicIndex: number;   // Extrinsic index
  dispatchError: {          // Error info
    module: string;         // Error module
    error: string;          // Error code
    documentation: string[];// Error docs
  };
  dispatchInfo: {           // Dispatch info
    weight: number;         // Weight
    class: string;          // Dispatch class
    paysFee: boolean;       // Whether pays fee
  };
}
```

## Balance Events (section: 'balances')

### Transfer
```typescript
interface Transfer {
  blockNumber: number;      // Block height
  from: string;             // Sender address
  to: string;               // Receiver address
  amount: string;           // Transfer amount (string format)
  currencyId: string;       // Token ID
  fee: string;              // Transaction fee
  timestamp: number;        // Timestamp
}
```

### Deposit
```typescript
interface Deposit {
  blockNumber: number;      // Block height
  account: string;          // Account address
  amount: string;           // Deposit amount
  currencyId: string;       // Token ID
  timestamp: number;        // Timestamp
}
```

## DEX Events (section: 'dex')

### Swap
```typescript
interface Swap {
  blockNumber: number;      // Block height
  trader: string;           // Trader address
  path: string[];           // Swap path
  amountIn: string;         // Input amount
  amountOut: string;        // Output amount
  fee: string;              // Transaction fee
  timestamp: number;        // Timestamp
}
```

### AddLiquidity
```typescript
interface AddLiquidity {
  blockNumber: number;      // Block height
  provider: string;         // Liquidity provider
  tokenA: string;           // Token A
  tokenB: string;           // Token B
  amountA: string;          // Amount of token A
  amountB: string;          // Amount of token B
  liquidityToken: string;   // Liquidity token amount
  timestamp: number;        // Timestamp
}
```

## Homa Events (section: 'homa')

### Minted
```typescript
interface Minted {
  blockNumber: number;      // Block height
  account: string;          // Account address
  amount: string;           // Minted amount
  liquidAmount: string;     // Liquid token amount
  timestamp: number;        // Timestamp
}
```

Note: Available modules and methods depend on Acala runtime version and configuration. For latest list please refer to [Acala Documentation](https://wiki.acala.network/).
