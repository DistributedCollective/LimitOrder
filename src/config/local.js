module.exports = {
    port: 3001,
    chainId: 31337,
    orderBookChainId: 31337,
    baseAPIUrl: 'http://localhost:3001',
    networkUrl: 'http://localhost:8545',
    orderBookNetwork: 'http://localhost:8545',
    contracts: {
        settlement: '0x68B1D87F95878fE05B998F19b66F4baba5De1aed',
        orderBook: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788',
        orderBookMargin: '0x9A676e781A523b5d0C0e43731313A708CB607508',
        swap: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707'
    },
    loanContracts: {
        iXUSD: "0x5fc748f1FEb28d7b76fa1c6B07D8ba2d5535177c",
        iRBTC: "0x6F6f570F45833E249e27022648a26F4076F48f78",
    },
    tokens: {
        SOV: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        XUSD: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        WRBTC: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    }
};
