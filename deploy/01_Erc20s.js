const { formatEther } = require("ethers/lib/utils");
const { ethers, network } = require("hardhat");
const { replaceInFile } = require("replace-in-file");
const { parseEther } = ethers.utils;
const { BN } = require("@openzeppelin/test-helpers");

const replaceTokenAddress = async (name, address) => {
    address = await ethers.utils.getAddress(address);
    const result = await replaceInFile({
        files: "test/tokens/" + name + ".json",
        from: new RegExp('"31337": "0x([0-9a-fA-F]{40})"'),
        to: '"31337": "' + address + '"',
    });
    return result.filter(file => file.hasChanged);
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;
    console.log("deploying 01erc20", network.name);

    if (network.name === "hardhat" || network.name === "localhost") {
        const TestWrbtc = await ethers.getContractFactory("TestWrbtc");
        const wrbtcToken = await TestWrbtc.deploy();
        await wrbtcToken.deployed();
        await replaceTokenAddress("WRBTC", wrbtcToken.address);
        console.log("wrbtc:", wrbtcToken.address)

        const TestToken = await ethers.getContractFactory("TestToken");
        const protocolToken = await TestToken.deploy('PROTOCOL', 'PROTOCOL', 18, parseEther('1000'));
        await protocolToken.deployed();

        const xusdToken = await TestToken.deploy('XUSD', 'XUSD', 18, parseEther('1000'))
        await xusdToken.deployed();
        await replaceTokenAddress("XUSD", xusdToken.address);
        console.log("usd: ",xusdToken.address)
        
        const sovToken = await TestToken.deploy('SOV', 'SOV', 18, parseEther('1000'))
        await sovToken.deployed();
        await replaceTokenAddress("SOV", sovToken.address);
        console.log("sov: ", sovToken.address)  

        const simulatorPriceFeeds = await deploy("PriceFeedsLocal", {
            args: [wrbtcToken.address, protocolToken.address],
            from: deployer,
            log: true,
        });
        const priceFeeds = await ethers.getContract("PriceFeedsLocal", deployer);

        const wei = web3.utils.toWei;
        const oneEth = new BN(wei("1", "ether"));
        await priceFeeds.setRates(wrbtcToken.address, protocolToken.address, oneEth.toString());
        await priceFeeds.setRates(wrbtcToken.address, xusdToken.address, new BN(10).pow(new BN(22)).toString());
        await priceFeeds.setRates(protocolToken.address, xusdToken.address, new BN(10).pow(new BN(22)).toString());
        await priceFeeds.setRates(sovToken.address, xusdToken.address, new BN(10).pow(new BN(18)).toString());

        const artifact = await deployments.getArtifact("TestSovrynSwap");
        const contract = {
            abi: artifact.abi,
            bytecode: artifact.bytecode,
        };
    
        await deploy("TestSovrynSwap", {
            contract,
            args: [simulatorPriceFeeds.address],
            from: deployer,
            log: true,
        });

        const swap = await ethers.getContract("TestSovrynSwap", deployer);
        const path = await swap.conversionPath(wrbtcToken.address, xusdToken.address);
        const rbtcRate = await swap.rateByPath(path, parseEther('1'));
        console.log('rbtc rate', formatEther(rbtcRate));
    }

};
