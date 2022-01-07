module.exports = {
    port: 3001,
    chainId: 31337,
    orderBookChainId: 31337,
    baseAPIUrl: 'http://localhost:3001',
    networkUrl: 'http://localhost:8545',
    orderBookNetwork: 'http://localhost:8545',
    contracts: {
        settlement: '0x9A676e781A523b5d0C0e43731313A708CB607508',
        orderBook: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
        orderBookMargin: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788',
        swap: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707'
    },
    loanContracts: {
        iXUSD: "0xAD523115cd35a8d4E60B3C0953E0E0ac10418309",
        iRBTC: "0x8F4ec854Dd12F1fe79500a1f53D0cbB30f9b6134",
    },
    tokens: {
        SOV: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        XUSD: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        WRBTC: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    }
};
