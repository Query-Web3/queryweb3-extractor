# Event Section and Method Details

The `section` and `method` fields in the event table represent the module and event type from the Acala chain. These values are dynamic and depend on the chain's runtime modules. Here are some common sections and their methods:

## System Events (section: 'system')
- ExtrinsicSuccess: Transaction execution succeeded
- ExtrinsicFailed: Transaction execution failed
- NewAccount: New account created
- KilledAccount: Account removed

## Balances Events (section: 'balances')
- Transfer: Token transfer
- Deposit: Deposit made
- Withdraw: Withdrawal made
- Endowed: Initial balance endowment

## DEX Events (section: 'dex')
- Swap: Token swap
- AddLiquidity: Liquidity added
- RemoveLiquidity: Liquidity removed
- TradingPairCreated: New trading pair created

## Homa Events (section: 'homa')
- Minted: New tokens minted
- RequestedRedeem: Redemption requested
- Redeemed: Redemption completed

## Incentives Events (section: 'incentives')
- Deposited: Incentives deposited
- Withdrawn: Incentives withdrawn
- Claimed: Rewards claimed

Note: The actual available sections and methods depend on the Acala runtime version and configuration. For the most up-to-date list, refer to the [Acala documentation](https://wiki.acala.network/).
