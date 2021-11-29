const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;
    if (network.name !== "mainnet") {
        const deployProxy = await deploy('OrderBookSwapProxy', {
            from: deployer,
            log: true
        });
    
        const deployLogic = await deploy('OrderBookSwapLogic', {
        from: deployer,
        log: true
        });
    
        const OrderBookSwapProxy = await deployments.get('OrderBookSwapProxy');
        const orderBookProxy = new web3.eth.Contract(OrderBookSwapProxy.abi, deployProxy.address);
        let tx = await orderBookProxy.methods.setImplementation(deployLogic.address).send({from: deployer});
        console.log(tx.transactionHash);
        
        const OrderBookSwapLogic = await deployments.get('OrderBookSwapLogic');
        const orderBook = new web3.eth.Contract(OrderBookSwapLogic.abi, deployProxy.address);
        tx = await orderBook.methods.initialize().send({from: deployer});
        console.log(tx.transactionHash);
    }
};
