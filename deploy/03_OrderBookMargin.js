const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deterministic } = deployments;
    if (network.name !== "mainnet") {
        if (network.name == 'rsktestnet') {
            await deployments.deploy("OrderBookMargin", {
                from: deployer,
                log: true,
            });
        } else {
            const { deploy } = await deterministic("OrderBookMargin", {
                from: deployer,
                log: true,
            });
            await deploy();
        }
    }
};
