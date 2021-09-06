const { network, getChainId } = require("hardhat");

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
  
    if (network.name === "hardhat" || network.name === "localhost") {
        const sSwn = await ethers.getContract("TestSovrynSwap", deployer);
        sovrynSwapNetwork = sSwn.address;
    }
    else if(network.name === "rsktestnet") sovrynSwapNetwork =  "0x61172B53423E205a399640e5283e51FE60EC2256";

    const chainId = network.name === "mainnet" ? 30 : await getChainId();
    const { address: orderBook } = await deterministic("OrderBook", {
        from: deployer,
        log: true,
    });

    await deploy("Settlement", {
        contract,
        args: [chainId, orderBook, sovrynSwapNetwork],
        from: deployer,
        log: true,
        gasLimit: 5000000,
    });
};
