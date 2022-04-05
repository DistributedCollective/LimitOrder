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
        swap: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318'
    },
    loanContracts: {
        iXUSD: "0xC976c932092ECcD8f328FfD85066C0c05ED54044",
        iRBTC: "0x3D63c50AD04DD5aE394CAB562b7691DD5de7CF6f",
    },
    tokens: {
        SOV: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        XUSD: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        WRBTC: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    }
};
