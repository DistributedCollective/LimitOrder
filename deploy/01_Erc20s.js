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
	return result.filter((file) => file.hasChanged);
};

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deployer } = await getNamedAccounts();
	const { deploy, getOrNull, get } = deployments;
	const bn = ethers.BigNumber;
	console.log("deploying 01erc20", network.name);

	if (network.name === "hardhat" || network.name === "localhost") {
		//const TestWrbtc = await deploy("TestWrbtc");
		const wrbtcTokenDeployment = await deploy("TestWrbtc", { from: deployer });
		//const wrbtcToken = await TestWrbtc.deploy();
		//await wrbtcToken.deployed();
		await replaceTokenAddress("WRBTC", wrbtcTokenDeployment.address);
		console.log("wrbtc:", wrbtcTokenDeployment.address);

		//const TestToken = await ethers.getContractFactory("TestToken");
		const protocolTokenDeployment = await deploy("TestToken", {
			from: deployer,
			//gasLimit: 4000000,
			args: ["PROTOCOL", "PROTOCOL", 18, parseEther("1000")],
		});

		const xusdTokenDeployment = await deploy("TestToken", {
			from: deployer,
			args: ["XUSD", "XUSD", 18, parseEther("10000000")],
		});

		await replaceTokenAddress("XUSD", xusdTokenDeployment.address);
		console.log("usd: ", xusdTokenDeployment.address);

		const sovTokenDeployment = await deploy("TestToken", {
			from: deployer,
			//gasLimit: 4000000,
			args: ["SOV", "SOV", 18, parseEther("10000000")],
		});
		await replaceTokenAddress("SOV", sovTokenDeployment.address);
		console.log("sov: ", sovTokenDeployment.address);

		const simulatorPriceFeeds = await deploy("PriceFeedsLocal", {
			args: [wrbtcTokenDeployment.address, protocolTokenDeployment.address],
			from: deployer,
			log: true,
		});
		const priceFeeds = await ethers.getContract("PriceFeedsLocal", deployer);

		const wei = web3.utils.toWei;
		const oneEth = new BN(wei("1", "ether"));
		await priceFeeds.setRates(wrbtcTokenDeployment.address, protocolTokenDeployment.address, oneEth.toString());
		await priceFeeds.setRates(wrbtcTokenDeployment.address, xusdTokenDeployment.address, new BN(10).pow(new BN(21)).toString());
		await priceFeeds.setRates(protocolTokenDeployment.address, xusdTokenDeployment.address, new BN(10).pow(new BN(21)).toString());
		await priceFeeds.setRates(sovTokenDeployment.address, xusdTokenDeployment.address, new BN(10).pow(new BN(18)).toString());

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
		const path = await swap.conversionPath(wrbtcTokenDeployment.address, xusdTokenDeployment.address);
		const rbtcRate = await swap.rateByPath(path, parseEther("1"));
		console.log("rbtc rate", formatEther(rbtcRate));
	}
};
