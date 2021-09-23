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
const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(new Date('2021-09-15').getTime() / 1000 + hoursFromNow * 3600));

const privateKey = 'd3d0d94035b81e3200eb070ee3250e7e567a0f97d1ad15f333860a292e5c7c20';
const privateKeyOwner = 'd3d0d94035b81e3200eb070ee3250e7e567a0f97d1ad15f333860a292e5c7c20';
const provider = new ethers.providers.JsonRpcProvider(config.networkUrl)
let owner = new ethers.Wallet(privateKeyOwner, provider);
let trader = new ethers.Wallet(privateKey, provider);

const web3 = new Web3(config.networkUrl);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

async function createOrder(){
    const apiUrl = 'http://localhost:3001/api/createOrder';
    
    const contract = new ethers.Contract(config.contracts.orderBook, orderBookAbi, trader);
    const fromToken = SOV[config.chainId];
    const toToken = XUSD[config.chainId];
    const amountIn = ethers.utils.parseEther('10');

    const contractToken = new ethers.Contract(fromToken.address, ERC20Abi, provider);
    const toTokenContract = new ethers.Contract(toToken.address, ERC20Abi, provider);

    const ownerBal = await toTokenContract.balanceOf(owner.address);
    console.log('balance trader', trader.address, Number(await toTokenContract.balanceOf(trader.address)));
    console.log('balance taker', owner.address, Number(ownerBal));

    await owner.sendTransaction({ to: trader.address, value: ethers.utils.parseEther("0.01"),gasLimit:50000 });
    await contractToken.connect(owner).transfer(trader.address, amountIn,{gasLimit:50000});

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
    const args = await order.toArgs(config.chainId, config.contracts.orderBook, "0x" + privateKey);

    console.log(args);
    const unsignedTx = await contract.populateTransaction.createOrder(args);

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
    const contract = new ethers.Contract(config.contracts.settlement, settlementAbi, trader);
    const unsignedTx = await contract.populateTransaction.cancelOrder(orderHash);
    
    const nonce = await trader.getTransactionCount();
    const tx = {
        ...unsignedTx,
        gasLimit: 100000,
        gasPrice: ethers.utils.parseUnits('1', 'gwei'),
        nonce
    };
    console.log(tx);
    const sent = await trader.sendTransaction(tx);
    console.log('sent tx', sent);
    const receipt = await sent.wait();
    console.log('receipt', receipt);
}

async function getCanceledHashes() {
    const settlement = new ethers.Contract(config.contracts.settlement, settlementAbi, provider);
    const filter = settlement.filters.OrderCanceled(null);
    const events = await settlement.queryFilter(filter);
    return events.map(event => event.args && event.args[0]).filter(h => !!h);
}

async function listAllOpenOrders() {
    const orderBook = new ethers.Contract(config.contracts.orderBook, orderBookAbi, provider);
    const total = (await orderBook.numberOfAllHashes()).toNumber();
    const pageSize = 20;
    const openHashes = [];
    const canceled = await getCanceledHashes();
    const canceledHashes = (canceled || []).reduce((obj, hash) => ({
        ...obj,
        [hash]: 1
    }), {});
    console.log('canceledHashes', canceledHashes);

    for (let page = 0; page * pageSize < total; page++) {
        const hashes = await orderBook.allHashes(page, pageSize);
        openHashes.push(
            ...(hashes || []).filter(h => h != ethers.constants.HashZero && !canceledHashes[h])
        );
    }
    
    console.log(openHashes);
    if (openHashes.length > 0) {
        const orderHash = openHashes[0];
        const url = `${config.baseAPIUrl}/api/orders/${orderHash}`;
        const res = await axios.get(url, { json: true });
        console.log('order detail of', orderHash);
        console.log(res && res.data);
    }

}

// createOrder();
// cancelOrder("0x8b2a3f654e3ff9c191bc2e23b8801ebc92d169a28d186721745263422e209c2d");
listAllOpenOrders();