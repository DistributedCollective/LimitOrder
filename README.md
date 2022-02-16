# Sovryn Settlement

This repository contains solidity contracts to enable **limit orders** for Sovryn.

## Overview

Typically AMMs only settle orders with market price, which represents a significant limitation compared to orderbook driven exchanges. Sovryn addresses this critical AMM pain point with the release of the limit order feature.

Contracts in this repo help you submit a limit order with a lower price than what it is now. Later, when the price gets lower enough to meet the requirement of your order, it gets settled.


## Contracts
Limit orders on Sovryn work in a completely decentralized manner, without the need of any centralized authority. The system consists of two contracts: OrderBook and Settlement.

### OrderBook
`OrderBook` keeps limit orders that users have submitted. Anyone can call `createOrder()` to create a limit order with the amount to sell and the minimum price. He/she needs to approve the amount to sell for the `Settlement` contract.

To reduce users' gas fee, OrderBook isn't deployed on the mainnet. The one on **rsk testnet** is used for production.


The parameter which makes an order unique even if all input data is the same (amounts, source and destination token) is the deadline.

The user should have the choice to decide between creating a ‚good till canceled‘ order or a time-limited order, which automatically expires after a certain time was exceeded. Both orders have a deadline, just that the deadline of the former lies far in the future (1 year?).

Especially in the ‚good till canceled‘  case, it is theoretically possible that a user would like to create two identical orders. For the contract to be able to differentiate between them, the deadline must be different. In this case, the recommendation for the frontend is to check if a order is already existing and if so, tell the user that he already created exactly the same order and ask him if we wants to create it anyways. If the answer is yes, increase the deadline by one second.



### Settlement
`Settlement` is in charge of swapping tokens for orders. Anyone can call `fillOrder()` to fill the order submitted. We'll call this caller a 'relayer'. Relayers need to call it with proper parameters to meet the minimum price requirement set in the order. If the call is successful, fee will be transferred to the relayer.

The maker of an order can cancel it with `cancelOrder()` on `Settlement`.

It is possible to fill only a certain amount of tokens, not all. In most cases, submitted orders will reside on the `OrderBook` and their amount will be filled by different callers in different blocks.



## Audits
This repository has been reviewed by pessimistic. 


## License
MIT

## Install

```sh
1. yarn install
2. create a file ".env" containing 2 private keys: 
```
PRIVATE_KEY=[your-private-key]
PRIVATE_KEY_RELAYER=[your-private-key]
```
3. yarn build
4. Create a directory "secrets" and within a file account.js with the credentials of the relayer(s)

module.exports = {
    relayers: [{
        adr: "",
        privateKey: ""
    }]
}

```

### Deployment on testnet

```sh
1. yarn deploy:rsktest
2. Copy deployed address of the contracts "Settlement, OrderBook, OrderBookMargin" into the config file "src/config/testnet.js"
3. Run approval script for loan contracts on Settlement: yarn approveSettlement:testnet
3. yarn start-relay
```

### Test client
```
1. yarn build-client
2. yarn start-relay
3. Open "http://localhost:3001" on your browser
```