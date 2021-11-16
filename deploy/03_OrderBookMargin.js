const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deployer } = await getNamedAccounts();
  const { deterministic, deploy } = deployments;
  if (network.name !== "mainnet") {
    await deploy("OrderBookMargin", {
      from: deployer,
      log: true,
    });
  }
};
