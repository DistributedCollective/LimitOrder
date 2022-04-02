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
        const oldImplement = await orderBookProxy.methods.getImplementation().call();

        console.log('OrderBookSwapProxy implementation', oldImplement);

        if (oldImplement && oldImplement.toLowerCase() != deployLogic.address.toLowerCase()) {
            let tx = await orderBookProxy.methods.setImplementation(deployLogic.address).send({from: deployer});
            console.log(tx.transactionHash);
            
            const proxyNotInititalized = oldImplement == ethers.constants.AddressZero;
            const OrderBookSwapLogic = await deployments.get('OrderBookSwapLogic');
            const orderBook = new web3.eth.Contract(OrderBookSwapLogic.abi, proxyNotInititalized ? deployProxy.address : deployLogic.address);
            tx = await orderBook.methods.initialize().send({from: deployer});
            console.log(tx.transactionHash);

            // Transfer ownership
            await orderBook.methods.transferOwnership(multisig).send({from: deployer});
        }

        await orderBookProxy.methods.setProxyOwner(multisig).send({from: deployer});
    }
};
