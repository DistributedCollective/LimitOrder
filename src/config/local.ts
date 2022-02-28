import { tokens } from '../tokens/local.json';
import accounts from '../secrets/accounts';

export default {
    rpcNode: 'http://localhost:8545',
    db: 'limitorders_relayer_local.db',
    serverPort: 4000,
    contracts: {
        settlement: '0x9A676e781A523b5d0C0e43731313A708CB607508',
        orderBook: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
        orderBookMargin: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788',
        sovrynSwap: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    },
    tokens: tokens,
    minOrderSize: String(1e18), //1 xusd
    maxOrdersInBatch: 5,
    accounts: accounts.local,
    blockExplorer: "http://localhost",
};