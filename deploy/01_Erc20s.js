const { ethers, network } = require("hardhat");
const { replaceInFile } = require("replace-in-file");
const WETH = require("canonical-weth/build/contracts/WETH9.json");
const { parseEther } = ethers.utils;

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

    if (network.name === "hardhat" || network.name === "localhost") {
        const TestWrbtc = await ethers.getContractFactory("TestWrbtc");
        const wrbtcToken = await TestWrbtc.deploy();
        await wrbtcToken.deployed();

        const TestToken = await ethers.getContractFactory("TestToken");
        const protocolToken = await TestToken.deploy('PROTOCOL', 'PROTOCOL', 18, parseEther('1000'));
        await protocolToken.deployed();

        const xusdToken = await TestToken.deploy('XUSD', 'XUSD', 18, parseEther('1000'))
        await xusdToken.deployed();
        await replaceTokenAddress("XUSD", xusdToken.address);
        console.log("usd: ",xusdToken.address)
        
        sovToken = await TestToken.deploy('SOV', 'SOV', 18, parseEther('1000'))
        await sovToken.deployed();
        await replaceTokenAddress("SOV", sovToken.address);
        console.log("sov: ", sovToken.address)  

        const simulatorPriceFeeds = await deploy("PriceFeedsLocal", {
            args: [wrbtcToken.address, protocolToken.address],
            from: deployer,
            log: true,
        });

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

    }

};
