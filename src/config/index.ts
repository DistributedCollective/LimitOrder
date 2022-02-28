import TokenEntry from "src/types/TokenEntry";
import Log from "../Log";

let { default: config } = require('./testnet');

if (process.argv.indexOf('--local') >= 0) {
    config = require('./local').default;
    Log.d('Using local config');
} else if (process.argv.indexOf('--mainnet') >= 0) {
    config = require('./main').default;
    Log.d('Using mainnet config');
} else {
    Log.d('Using testnet config');
}

interface Config {
    rpcNode: string;
    mainnet: boolean;
    db: string;
    serverPort: number;
    contracts: {
        settlement: string;
        orderBook: string;
        orderBookMargin: string;
        sovrynSwap: string;
    };
    tokens: TokenEntry[];
    minOrderSize: number;
    maxOrdersInBatch: number;
    accounts: RelayerAccount[];
    blockExplorer: string;
    loanContracts: { [x: string]: string };
}

export interface RelayerAccount {
    address: string;
    pKey: string;
}

export default config as Config;
