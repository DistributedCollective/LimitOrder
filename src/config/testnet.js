module.exports = {
    port: 3001,
    chainId: 31,
    baseAPIUrl: 'http://localhost:3001',
    networkUrl: 'https://testnet.sovryn.app/rpc',
    orderBookNetwork: 'https://testnet.sovryn.app/rpc',
    contracts: {
        settlement: '0xce6f382DE5A761A29960ED612BD7153611AC1fCb',
        orderBook: '0xCA6322eabe8Bf0B08f06Ba749A7338FCce220D8A',
        orderBookMargin: '0x1a2E1eBb998511d6b090CFC493B0f22D6DcB56f7',
        swap: '0x61172b53423e205a399640e5283e51fe60ec2256'
    },
    loanContracts: {
        iXUSD: "0x9bd0ce087b14ef67c3d37c891139aae7d94a961a",
        iRBTC: "0xe67fe227e0504e8e96a34c3594795756dc26e14b",
    },
    tokens: {
        SOV: "0x6a9A07972D07e58F0daf5122d11E069288A375fb",
        XUSD: "0x74858FE37d391f81F89472e1D8BC8Ef9CF67B3b1",
        WRBTC: "0x69FE5cEC81D5eF92600c1A0dB1F11986AB3758Ab",
        BPRO: "0x4dA7997A819bb46B6758B9102234c289dD2Ad3bf",
        DOC: "0xCB46c0ddc60D18eFEB0E586C17Af6ea36452Dae0",
        USDT: "0x4d5A316d23EBe168D8f887b4447BF8DBfA4901cc",
        ETHs: "0x499bb1355b36adeb93706b08a897ce6022de6ac9",
        BNBs: "0x801f223def9a4e3a543eaccefb79dce981fa2fb5",
    }
};