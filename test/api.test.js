const ethers = require('ethers');
const axios = require('axios');
const { _TypedDataEncoder } = require("@ethersproject/hash");
const { keccak256 } = require("@ethersproject/keccak256");
const Tx = require("@ethersproject/transactions");
const Web3 = require('web3');
const { getAccountsPrivateKeys } = require("./Utils/hardhat_utils");

const config = require('../src/config');
const { SOV, XUSD } = require('./tokens');
const { abi: orderBookAbi } = require('../deployments/localhost/OrderBookSwapLogic.json');
const { abi: orderBookMarginAbi } = require('../deployments/localhost/OrderBookMarginLogic.json');
const { abi: settlementAbi } = require('../deployments/localhost/SettlementLogic.json');
const { ERC20: ERC20Abi } = require("../src/config/abis");
const Order = require('../src/Order');
const helpers = require("./helpers");
const relayer = require('../src/relayer');

const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(Date.now() / 1000 + hoursFromNow * 3600));

const privateKey = 'd3d0d94035b81e3200eb070ee3250e7e567a0f97d1ad15f333860a292e5c7c20';
// const privateKey = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; //local
const privateKeyOwner = 'd3d0d94035b81e3200eb070ee3250e7e567a0f97d1ad15f333860a292e5c7c20';
const provider = new ethers.providers.JsonRpcProvider(config.networkUrl)
let owner = new ethers.Wallet(privateKeyOwner, provider);
let trader = new ethers.Wallet(privateKey, provider);

const web3 = new Web3(config.networkUrl);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

async function createOrder(needApprove = true){
    const apiUrl = 'http://localhost:3001/api/createOrder';
    
    const contract = new ethers.Contract(config.contracts.orderBook, orderBookAbi, trader);
    const fromToken = SOV[config.chainId];
    const toToken = XUSD[config.chainId];
    const amountIn = ethers.utils.parseEther((Math.random()*10+5).toString());

    const contractToken = new ethers.Contract(fromToken.address, ERC20Abi, provider);
    const toTokenContract = new ethers.Contract(toToken.address, ERC20Abi, provider);

    // const ownerBal = await toTokenContract.balanceOf(owner.address);
    // console.log('balance trader', trader.address, Number(await toTokenContract.balanceOf(trader.address)));
    // console.log('balance taker', owner.address, Number(ownerBal));

    // await owner.sendTransaction({ to: trader.address, value: ethers.utils.parseEther("0.01"),gasLimit:50000 });
    // await contractToken.connect(owner).transfer(trader.address, amountIn,{gasLimit:50000});

    // const allowance = await contractToken.allowance(trader.address, config.contracts.settlement,{gasLimit:200000});
    if (needApprove) {
        const bal = await contractToken.balanceOf(trader.address);
        console.log(`approving ${ethers.utils.formatEther(bal)} ${fromToken.symbol}`)
        const approveTx = await contractToken.connect(trader).approve(config.contracts.settlement, bal, {gasLimit:200000});
        console.log('approve tx', approveTx.hash);
        await approveTx.wait();
    }

    const order = new Order(
        trader.address,
        fromToken.address,
        toToken.address,
        amountIn,
        ethers.utils.parseEther('0.003'),
        trader.address,
        getDeadline(24),
        ethers.BigNumber.from(Math.floor(Date.now() / 1000))
    );
    const args = await order.toArgs(config.chainId, config.contracts.orderBook, "0x" + privateKey);

    const unsignedTx = await contract.populateTransaction.createOrder(args);

    try {
        console.log('order hash', await order.hash());
        const { status, data } = await axios.post(apiUrl, {
            data: unsignedTx.data,
            from: trader.address
        }, { json: true });

        // console.log(data);
        return data;
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
    const canceled = await settlement.allCanceledHashes();
    const canceledHashes = (canceled || []).reduce((obj, hash) => ({
        ...obj,
        [hash]: 1
    }), {});
    return canceledHashes;
}

async function listAllOpenLimitOrders() {
    console.time("listAllOpenLimitOrders");
    const orderBook = new ethers.Contract(config.contracts.orderBook, orderBookAbi, provider);
    const total = (await orderBook.numberOfAllHashes()).toNumber();

    const url = `${config.baseAPIUrl}/api/orders/${trader.address}?offset=0&limit=${total}`;
    const res = await axios.get(url, { json: true });
    console.log(res && res.data.data);

    console.timeEnd("listAllOpenLimitOrders");
}

async function listAllOpenMarginOrders() {
    console.time("listAllOpenMarginOrders");
    const marginBook = new ethers.Contract(config.contracts.orderBookMargin, orderBookMarginAbi, provider);
    const total = (await marginBook.numberOfAllHashes()).toNumber();

    const url = `${config.baseAPIUrl}/api/orders/${trader.address}?offset=0&limit=${total}&isMargin=1`;
    const res = await axios.get(url, { json: true });
    console.log(res && res.data.data);

    console.timeEnd("listAllOpenMarginOrders");

}

async function createMultiOrders(nr) {
    for (let index = 0; index < nr; index++) {
        console.log("Creating order #%s", index);
        createOrder(index == 0).then(result => {
            console.log(result)
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function testRelayer() {
    relayer.init(provider);
    const tokenAdr = config.tokens.XUSD;
    const token = new web3.eth.Contract(ERC20Abi, tokenAdr, trader);

    const nrTest = 7;
    for (let i = 0; i < nrTest; i++) {
        const txData = token.methods.approve(config.contracts.settlement, ethers.utils.parseEther((Math.random() + 1).toFixed(2))).encodeABI();
        relayer.sendTx({
            data: txData,
            to: tokenAdr,
            gasLimit: 100000
        }).then(tx => {
            tx && console.log('send tx', tx.hash, 'nonce', tx.nonce);
        }).catch(console.log);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

(async function start () {
    // createOrder();
    // await createMultiOrders(4);

    
    // cancelOrder("0x8b2a3f654e3ff9c191bc2e23b8801ebc92d169a28d186721745263422e209c2d");
    // await listAllOpenLimitOrders();
    // listAllOpenMarginOrders();

    testRelayer();
})();
