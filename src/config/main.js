module.exports = {
    port: 3005,
    chainId: 30,
    orderBookChainId: 30,
    baseAPIUrl: 'http://18.118.207.238:3005/',
    networkUrl: 'https://rsk-internal.sovryn.app/rpc',
    orderBookNetwork: 'https://testnet.sovryn.app/rpc',
    contracts: {
        settlement: '0x823e55322a395516ac3930F4C1ad9C7c2Fe2EACd',
        orderBook: '0x1c910918d6D05feC83e2376D57226d1b08324028',
        orderBookMargin: '0x3677e8a679536d80F0b33ED2d1d0bC01a6634a4D',
        swap: '0x98ace08d2b759a265ae326f010496bcd63c15afc'
    },
    loanContracts: {
        iXUSD: "0x8f77ecf69711a4b346f23109c40416be3dc7f129",
        iRBTC: "0xa9dcdc63eabb8a2b6f39d7ff9429d88340044a7a",
        iDOC: "0xd8d25f03ebba94e15df2ed4d6d38276b595593c1",
        iUSDT: "0x849c47f9c259e9d62f289bf1b2729039698d8387",
        iBPRo: "0x6E2fb26a60dA535732F8149b25018C9c0823a715",
    },
    tokens: {
        SOV: "0xefc78fc7d48b64958315949279ba181c2114abbd",
        XUSD: "0xb5999795be0ebb5bab23144aa5fd6a02d080299f",
        WRBTC: "0x542fda317318ebf1d3deaf76e0b632741a7e677d",
        BPRO: "0x440cd83c160de5c96ddb20246815ea44c7abbca8",
        DOC: "0xe700691da7b9851f2f35f8b8182c69c53ccad9db",
        USDT: "0xef213441a85df4d7acbdae0cf78004e1e486bb96",
        ETHs: "0x1d931bf8656d795e50ef6d639562c5bd8ac2b78f",
        BNBs: "0x6d9659bdf5b1a1da217f7bbaf7dbaf8190e2e71b",
        DLR: "0xc1411567d2670e24d9C4DaAa7CdA95686e1250AA"
    }
};