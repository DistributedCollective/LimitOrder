const { network, getChainId, ethers } = require("hardhat");
const {WRBTC} = require('../test/tokens');

const INIT_CODE_HASH = "e18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;

    let sovrynSwapNetwork;
    let wrbtcAddress;
    const chainId = network.name === "mainnet" ? 30 : await getChainId();
    let orderBookChainId = chainId;
    let orderBookAdr, orderBookMarginAdr;
  
    if (network.name === "hardhat" || network.name === "localhost") {
        const sSwn = await ethers.getContract("TestSovrynSwap", deployer);
        sovrynSwapNetwork = sSwn.address;
        wrbtcAddress = WRBTC[chainId].address;
    }
    else if(network.name === "rsktestnet") {
        sovrynSwapNetwork =  "0x61172B53423E205a399640e5283e51FE60EC2256";
        wrbtcAddress = "0x69FE5cEC81D5eF92600c1A0dB1F11986AB3758Ab";
    } else if (network.name === "mainnet") {
        sovrynSwapNetwork = "0x98ace08d2b759a265ae326f010496bcd63c15afc";
        wrbtcAddress = "0x542fDA317318eBF1d3DEAf76E0b632741A7e677d";
        orderBookChainId = 31;
    }

    if (network.name === 'mainnet') {
        orderBookAdr = require('../deployments/rsktestnet/OrderBookSwapProxy.json').address;
        orderBookMarginAdr = require('../deployments/rsktestnet/OrderBookMarginProxy.json').address;
    } else {
        const orderBook = await deployments.get('OrderBookSwapProxy');
        const orderBookMargin = await deployments.get('OrderBookMarginProxy');
        orderBookAdr = orderBook.address;
        orderBookMarginAdr = orderBookMargin.address;
    }

    console.log('OrderBook', orderBookAdr);
    console.log('OrderBookMargin', orderBookMarginAdr);

    const deployProxy = await deploy('SettlementProxy', {
        from: deployer,
        log: true
    });

    const deployLogic = await deploy('SettlementLogic', {
        from: deployer,
        log: true
    });

    const SettlementProxy = await deployments.get('SettlementProxy');
    const settlementProxy = new web3.eth.Contract(SettlementProxy.abi, deployProxy.address);
    let tx = await settlementProxy.methods.setImplementation(deployLogic.address).send({from: deployer});
    console.log(tx.transactionHash);
    
    const SettlementLogic = await deployments.get('SettlementLogic');
    const settlement = new web3.eth.Contract(SettlementLogic.abi, deployProxy.address);
    tx = await settlement.methods.initialize(chainId, orderBookAdr, orderBookMarginAdr, sovrynSwapNetwork, wrbtcAddress).send({from: deployer});
    console.log(tx.transactionHash);
};
