const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;

    if (network.name === "hardhat" || network.name === "localhost") {
        multisig = deployer;
    }
    else if (network.name === "rsktestnet") {
        multisig = "0x189ecD23E9e34CFC07bFC3b7f5711A23F43F8a57";
    } else if (network.name === "mainnet") {
        multisig = "0x924f5ad34698Fd20c90Fe5D5A8A0abd3b42dc711";
    }
    
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

        // Transfer ownership
        tx = await orderBookMarginProxy.methods.setProxyOwner(multisig).send({from: deployer});
        console.log(tx.transactionHash);
        tx = await orderBookMargin.methods.transferOwnership(multisig).send({from: deployer});
        console.log(tx.transactionHash);
    }
};
