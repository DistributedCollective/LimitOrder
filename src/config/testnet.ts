import {tokens} from '../tokens/testnet.json';
import accounts from '../secrets/accounts';

export default {
    rpcNode: 'https://testnet.sovryn.app/rpc',
    db: 'limitorders_relayer_test.db',
    serverPort: 3000,
    contracts: {
        settlement: '0xb80B8AbF3674F7ace310d1EFF9546abAC7Cee9a4',
        orderBook: '0x3aEAABbcc0b15d8Ad85dD6941AC86Fa8C97A00fa',
        orderBookMargin: '0x8c10d2fB5BB144203751B496d6f7e746377cb50E',
        sovrynSwap: '0x61172b53423e205a399640e5283e51fe60ec2256',
    },
    tokens: tokens,
    minOrderSize: String(1e18), //xusd
    maxOrdersInBatch: 5,
    accounts: accounts.testnet,
    blockExplorer: "https://explorer.testnet.rsk.com/",
    loanContracts: {
        iXUSD: "0x9bd0ce087b14ef67c3d37c891139aae7d94a961a",
        iRBTC: "0xe67fe227e0504e8e96a34c3594795756dc26e14b",
    },
};