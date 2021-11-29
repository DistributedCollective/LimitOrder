const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;
    if (network.name !== "mainnet") {
        const deployProxy = await deploy('OrderBookMarginProxy', {
            from: deployer,
            log: true
        });
    
        const deployLogic = await deploy('OrderBookMarginLogic', {
        from: deployer,
        log: true
        });
    
        const OrderBookMarginProxy = await deployments.get('OrderBookMarginProxy');
        const orderBookMarginProxy = new web3.eth.Contract(OrderBookMarginProxy.abi, deployProxy.address);
        let tx = await orderBookMarginProxy.methods.setImplementation(deployLogic.address).send({from: deployer});
        console.log(tx.transactionHash);
        
        const OrderBookMarginLogic = await deployments.get('OrderBookMarginLogic');
        const orderBookMargin = new web3.eth.Contract(OrderBookMarginLogic.abi, deployProxy.address);
        tx = await orderBookMargin.methods.initialize().send({from: deployer});
        console.log(tx.transactionHash);
    }
};
