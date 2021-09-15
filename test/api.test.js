const ethers = require('ethers');
const axios = require('axios');
const { _TypedDataEncoder } = require("@ethersproject/hash");
const { keccak256 } = require("@ethersproject/keccak256");
const Tx = require("@ethersproject/transactions");
const Web3 = require('web3');

const config = require('../src/config');
const { SOV, XUSD } = require('./tokens');
const { abi: orderBookAbi } = require('../deployments/localhost/OrderBook.json');
const { abi: settlementAbi } = require('../deployments/localhost/Settlement.json');
const ERC20Abi  = require("../src/ERC20.json");
const Order = require('../src/Order');
const helpers = require("./helpers");

// const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(Date.now() / 1000 + hoursFromNow * 3600));
const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(new Date('2021-09-14').getTime() / 1000 + hoursFromNow * 3600));

const privateKey = 'd3d0d94035b81e3200eb070ee3250e7e567a0f97d1ad15f333860a292e5c7c20';
const privateKeyOwner = 'd3d0d94035b81e3200eb070ee3250e7e567a0f97d1ad15f333860a292e5c7c20';
const provider = new ethers.providers.JsonRpcProvider(config.networkUrl)
let owner = new ethers.Wallet(privateKeyOwner, provider);
let trader = new ethers.Wallet(privateKey, provider);

const web3 = new Web3(config.networkUrl);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

async function createOrder_old(){
    const apiUrl = 'http://localhost:3001/api/createOrder';
    
    const contract = new ethers.Contract(config.contracts.orderBook, orderBookAbi, trader);
    const fromToken = SOV[config.chainId];
    const toToken = XUSD[config.chainId];
    const amountIn = ethers.utils.parseEther('10');

    const contractToken = new ethers.Contract(fromToken.address, ERC20Abi, provider);
    const toTokenContract = new ethers.Contract(toToken.address, ERC20Abi, provider);

    const ownerBal = await toTokenContract.balanceOf(owner.address);
    console.log('balance trader', Number(await toTokenContract.balanceOf(trader.address)));
    console.log('balance taker', Number(ownerBal));
    // return;// just check balance

    // await owner.sendTransaction({ to: trader.address, value: ethers.utils.parseEther("0.01"),gasLimit:50000 });
    // await contractToken.connect(owner).transfer(trader.address, amountIn,{gasLimit:50000});

    const allowance = await contractToken.allowance(trader.address, config.contracts.settlement,{gasLimit:200000});
    console.log("pre allowance", Number(allowance))
    await contractToken.connect(trader).approve(config.contracts.settlement, amountIn.add(allowance), {gasLimit:200000});

    const order = new Order(
        trader.address,
        fromToken.address,
        toToken.address,
        amountIn,
        ethers.utils.parseEther('0.003'),
        trader.address,
        getDeadline(24),
    );
    const args = await order.toArgs(config.chainId, config.contracts.orderBook, privateKey);
    // console.log(args);
    const unsignedTx = await contract.populateTransaction.createOrder(args);
    
    const nonce = await trader.getTransactionCount();
    const tx = {
        ...unsignedTx,
        gasLimit: 600000,
        gasPrice: ethers.utils.parseUnits('10', 'gwei'),
        nonce,
    };
    // console.log(req);
    const signedTx = await trader.signTransaction(tx);

    try {
        console.log('order hash', await order.hash());
        const { status, data } = await axios.post(apiUrl, {
            data: signedTx,
            from: trader.from
        }, { json: true });

        console.log(data);
    } catch(e) {
        console.log(e);
    }
    
}

async function createOrderWeb3(){
    const apiUrl = 'http://localhost:3001/api/createOrder';
    
    const contract = new ethers.Contract(config.contracts.orderBook, orderBookAbi, trader);
    const fromToken = SOV[config.chainId];
    const toToken = XUSD[config.chainId];
    const amountIn = ethers.utils.parseEther('10');

    const contractToken = new ethers.Contract(fromToken.address, ERC20Abi, provider);
    const toTokenContract = new ethers.Contract(toToken.address, ERC20Abi, provider);

    // const ownerBal = await toTokenContract.balanceOf(owner.address);
    // console.log('balance trader', trader.address, Number(await toTokenContract.balanceOf(trader.address)));
    // console.log('balance taker', owner.address, Number(ownerBal));

    // await owner.sendTransaction({ to: trader.address, value: ethers.utils.parseEther("0.01"),gasLimit:50000 });
    // await contractToken.connect(owner).transfer(trader.address, amountIn,{gasLimit:50000});

    // const allowance = await contractToken.allowance(trader.address, config.contracts.settlement,{gasLimit:200000});
    // console.log("pre allowance", Number(allowance))
    // await contractToken.connect(trader).approve(config.contracts.settlement, amountIn.add(allowance), {gasLimit:200000});

    const order = new Order(
        trader.address,
        fromToken.address,
        toToken.address,
        amountIn,
        ethers.utils.parseEther('0.003'),
        trader.address,
        getDeadline(24),
    );

    const chainId = config.chainId;

    const msg = order.messageHash(chainId, config.contracts.orderBook);
    console.log(msg);
    const signature = await web3.eth.personal.sign(msg, trader.address);

    console.log(signature);
    const sig = ethers.utils.splitSignature(signature);
    console.log(sig)
    console.log(web3.currentProvider)

    // web3.currentProvider.send({
    //     method: 'eth_sign',
    //     params: [trader.address, msg],
    //     from: trader.address
    // }, (err, sig) => {
    //     console.log(err, sig);
    //     console.log(ethers.utils.splitSignature(sig.result))
    // });

    // return;

    const args = [
        order.maker,
        order.fromToken,
        order.toToken,
        order.amountIn,
        order.amountOutMin,
        order.recipient,
        order.deadline,
        sig.v,
        sig.r,
        sig.s,
    ];

    console.log(args);
    const unsignedTx = await contract.populateTransaction.createOrder(args);

    
    // const nonce = await trader.getTransactionCount();
    // const tx = {
    //     ...unsignedTx,
    //     gasLimit: 600000,
    //     gasPrice: ethers.utils.parseUnits('10', 'gwei'),
    //     nonce
    // };
    // // console.log(req);
    // const signedTx = await trader.signTransaction(tx);

    try {
        console.log('order hash', await order.hash());
        const { status, data } = await axios.post(apiUrl, {
            data: unsignedTx.data,
            from: trader.address
        }, { json: true });

        console.log(data);
    } catch(e) {
        console.log(e);
    }
    
}

async function cancelOrder(orderHash) {
    const apiUrl = 'http://localhost:3001/api/cancelOrder';
    
    // const contract = new ethers.Contract(config.contracts.settlement, settlementAbi, trader);
    // const unsignedTx = await contract.populateTransaction.cancelOrder(orderHash);
    
    // const nonce = await trader.getTransactionCount();
    // const tx = {
    //     ...unsignedTx,
    //     gasLimit: 100000,
    //     gasPrice: ethers.utils.parseUnits('1', 'gwei'),
    //     nonce
    // };
    // console.log(tx);
    // const signedTx = await trader.signTransaction(tx);
    // const { from, ...withoutFrom } = tx;
    // console.log(Tx.serialize(withoutFrom));

    try {
        const { status, data } = await axios.post(apiUrl, {
            data: orderHash,
            from: trader.address
        }, { json: true });

        console.log(data);
    } catch(e) {
        console.log(e);
    }
}

// createOrder();
// cancelOrder("0x8b2a3f654e3ff9c191bc2e23b8801ebc92d169a28d186721745263422e209c2d");
createOrderWeb3();