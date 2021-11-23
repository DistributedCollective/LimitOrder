module.exports = {
    port: 3001,
    chainId: 31,
    baseAPIUrl: 'http://localhost:3001',
    networkUrl: 'https://testnet.sovryn.app/rpc',
    contracts: {
        settlement: '0xC8075574A89b991921171c37a929dff299861b65',
        orderBook: '0x55C850Eb67C4fbD9c0C36FDcDea0111D6cAf7A93',
        orderBookMargin: '0x67796fC67221928BF3e15039c31b2127EDC661bf',
    },
    loanContracts: {
        iXUSD: "0x9bd0ce087b14ef67c3d37c891139aae7d94a961a",
        iRBTC: "0xe67fe227e0504e8e96a34c3594795756dc26e14b",
    },
    tokens: {
        SOV: "0x6a9A07972D07e58F0daf5122d11E069288A375fb",
        XUSD: "0x74858FE37d391f81F89472e1D8BC8Ef9CF67B3b1",
        WRBTC: "0x69FE5cEC81D5eF92600c1A0dB1F11986AB3758Ab",
    }
};