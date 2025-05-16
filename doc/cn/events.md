# 事件类型说明

事件表中的`section`和`method`字段表示Acala链中的模块和事件类型。这些值是动态的，取决于链的运行时模块。以下是一些常见模块及其方法：

## 系统事件 (section: 'system')
- ExtrinsicSuccess: 交易执行成功
- ExtrinsicFailed: 交易执行失败
- NewAccount: 新账户创建
- KilledAccount: 账户销毁

## 余额事件 (section: 'balances')
- Transfer: 转账
- Deposit: 存款
- Withdraw: 取款
- Endowed: 初始余额分配

## DEX事件 (section: 'dex')
- Swap: 代币交换
- AddLiquidity: 添加流动性
- RemoveLiquidity: 移除流动性
- TradingPairCreated: 交易对创建

## Homa事件 (section: 'homa')
- Minted: 铸造新代币
- RequestedRedeem: 请求赎回
- Redeemed: 赎回完成

## 激励事件 (section: 'incentives')
- Deposited: 存入激励
- Withdrawn: 取出激励
- Claimed: 领取奖励

注意：实际可用的模块和方法取决于Acala运行时版本和配置。最新列表请参考[Acala文档](https://wiki.acala.network/)。
