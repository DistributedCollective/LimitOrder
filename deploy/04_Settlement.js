const { network, getChainId, ethers, web3 } = require("hardhat");
const {WRBTC, XUSD} = require('../test/tokens');
const swapAbi = require('../src/config/abis/SovrynSwap.json');
const { replaceInFile } = require("replace-in-file");

const INIT_CODE_HASH = "e18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;

    let sovrynSwapNetwork;
    let wrbtcAddress, xusdAddress;
    const chainId = network.name === "mainnet" ? 30 : await getChainId();
    let orderBookChainId = chainId;
    let orderBookAdr, orderBookMarginAdr;
    let priceFeedAdr;
  
    if (network.name === "hardhat" || network.name === "localhost") {
        const sSwn = await ethers.getContract("TestSovrynSwap", deployer);
        const priceFeeds = await ethers.getContract("PriceFeedsLocal", deployer);
        sovrynSwapNetwork = sSwn.address;
        priceFeedAdr = priceFeeds.address;
        wrbtcAddress = WRBTC[chainId].address;
        xusdAddress = XUSD[chainId].address;
        multisig = deployer;
    }
    else if (network.name === "rsktestnet") {
        sovrynSwapNetwork =  "0x61172B53423E205a399640e5283e51FE60EC2256";
        wrbtcAddress = "0x69FE5cEC81D5eF92600c1A0dB1F11986AB3758Ab";
        multisig = "0x189ecD23E9e34CFC07bFC3b7f5711A23F43F8a57";
        xusdAddress = "0x74858FE37d391f81F89472e1D8BC8Ef9CF67B3b1";
        priceFeedAdr = "0x7f38c422b99075f63C9c919ECD200DF8d2Cf5BD4";
    } else if (network.name === "mainnet") {
        sovrynSwapNetwork = "0x98ace08d2b759a265ae326f010496bcd63c15afc";
        wrbtcAddress = "0x542fDA317318eBF1d3DEAf76E0b632741A7e677d";
        multisig = "0x924f5ad34698Fd20c90Fe5D5A8A0abd3b42dc711";
        xusdAddress = "0xb5999795be0ebb5bab23144aa5fd6a02d080299f";
        priceFeedAdr = "0x437AC62769f386b2d238409B7f0a7596d36506e4";
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
    const oldImplement = await settlementProxy.methods.getImplementation().call();

    console.log('SettlementProxy implementation', oldImplement);

    if (oldImplement && oldImplement.toLowerCase() != deployLogic.address.toLowerCase()) {
        let tx = await settlementProxy.methods.setImplementation(deployLogic.address).send({from: deployer});
        console.log(tx.transactionHash);
        const proxyNotInititalized = oldImplement == ethers.constants.AddressZero;

        const SettlementLogic = await deployments.get('SettlementLogic');
        const settlement = new web3.eth.Contract(SettlementLogic.abi, proxyNotInititalized ? deployProxy.address : deployLogic.address);
        tx = await settlement.methods.initialize(
            orderBookChainId,
            orderBookAdr,
            orderBookMarginAdr,
            sovrynSwapNetwork,
            priceFeedAdr,
            wrbtcAddress
        ).send({from: deployer});
        console.log(tx.transactionHash);

        const swapContract = new web3.eth.Contract(swapAbi, sovrynSwapNetwork);
        const xusdWrbtcPath = await swapContract.methods.conversionPath(xusdAddress, wrbtcAddress).call();
        const amn = ethers.utils.parseEther('0.001');
        const rbtcPrice = await swapContract.methods.rateByPath(xusdWrbtcPath, amn).call();
        const minSwapOrderSize = ethers.utils.parseEther('100').mul(rbtcPrice).div(amn); // min 100$ for swap order
        const minMarginOrderSize = ethers.utils.parseEther('200').mul(rbtcPrice).div(amn); // min 200$ for margin order
    
        await settlement.methods.setMinSwapOrderSize(minSwapOrderSize).send({from: deployer});
        await settlement.methods.setMinMarginOrderSize(minMarginOrderSize).send({from: deployer});

        // Transfer ownership
        await settlement.methods.transferOwnership(multisig).send({from: deployer});
    }

    await settlementProxy.methods.setProxyOwner(multisig).send({from: deployer});

    if (network.name === "hardhat" || network.name === "localhost") {
        await replaceInFile({
            files: 'src/config/local.js',
            from: new RegExp('settlement: "0x([0-9a-fA-F]{40})"'),
            to: 'settlement: "' + deployProxy.address + '"',
        });
        await replaceInFile({
            files: 'src/config/local.js',
            from: new RegExp('orderBook: "0x([0-9a-fA-F]{40})"'),
            to: 'orderBook: "' + orderBookAdr + '"',
        });
        await replaceInFile({
            files: 'src/config/local.js',
            from: new RegExp('orderBookMargin: "0x([0-9a-fA-F]{40})"'),
            to: 'orderBookMargin: "' + orderBookMarginAdr + '"',
        });
    }
};
