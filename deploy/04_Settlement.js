const { network, getChainId, ethers } = require("hardhat");
const {WRBTC} = require('../test/tokens');

const INIT_CODE_HASH = "e18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { call, deploy, deterministic } = deployments;

    const artifact = await deployments.getArtifact("Settlement");
    const contract = {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
    };

    let sovrynSwapNetwork;
    let wrbtcAddress;
    const chainId = network.name === "mainnet" ? 30 : await getChainId();
  
    if (network.name === "hardhat" || network.name === "localhost") {
        const sSwn = await ethers.getContract("TestSovrynSwap", deployer);
        sovrynSwapNetwork = sSwn.address;
        wrbtcAddress = WRBTC[chainId].address;
    }
    else if(network.name === "rsktestnet") {
        sovrynSwapNetwork =  "0x61172B53423E205a399640e5283e51FE60EC2256";
        wrbtcAddress = "0x69FE5cEC81D5eF92600c1A0dB1F11986AB3758Ab";
    } else if (network.name === "mainnet") {
        wrbtcAddress = "0x542fDA317318eBF1d3DEAf76E0b632741A7e677d";
    }

    const { address: orderBook } = await deterministic("OrderBook", {
        from: deployer,
        log: true,
    });
    const { address: orderBookMargin } = await deterministic("OrderBookMargin", {
        from: deployer,
        log: true,
    });

    await deploy("Settlement", {
        contract,
        args: [chainId, orderBook, orderBookMargin, sovrynSwapNetwork, wrbtcAddress],
        from: deployer,
        log: true,
        gasLimit: 5000000,
    });
};
