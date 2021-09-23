const path = require('path');
const express = require('express');
const ethers = require('ethers');
const bodyParser = require('body-parser');
const Tx = require("@ethersproject/transactions");
const { keccak256 } = require("@ethersproject/keccak256");
const { toUtf8Bytes } = require("@ethersproject/strings");
const { verifyMessage } = require("@ethersproject/wallet");
const Web3 = require('web3');

const config = require('./config');
const { abi: orderBookABI } = require('../deployments/localhost/OrderBook.json');
const { abi: settlementABI } = require('../deployments/localhost/Settlement.json');
const Order = require('./Order');
const { relayer: relayerAcc } = require('../secret/account');

const app = express();
const port = config.port;
const provider = new ethers.providers.JsonRpcProvider(config.networkUrl);
const relayer = new ethers.Wallet(relayerAcc.privateKey, provider);
const orderBookContract = new ethers.Contract(config.contracts.orderBook, orderBookABI, provider);
const settlementContract = new ethers.Contract(config.contracts.settlement, settlementABI, provider);
const web3 = new Web3(config.networkUrl);

app.use(bodyParser.json());

app.use('/public', express.static(path.resolve(__dirname, '../public')));

app.listen(port, () => {
    console.log("Server started listening on port", port);
});

const validateContractParams = (res, rawTx, from, contractAddress) => {
    const parsedTx = Tx.parse(rawTx);
    console.log(parsedTx);

    const msg = keccak256(Tx.serialize({
        to: parsedTx.to,
        data: parsedTx.data,
        gasLimit: parsedTx.gasLimit,
        gasPrice: parsedTx.gasPrice,
        nonce: parsedTx.nonce
    }));
    const signer = Tx.recoverAddress(msg, {
        r: parsedTx.r,
        s: parsedTx.s,
        v: parsedTx.v
    });
    // console.log(signer, parsedTx.from);
    if (signer !== from) {
        res.status(500).json({ error: 'Invalid signature' });
        return false;
    }

    if (parsedTx.to !== contractAddress) {
        res.status(500).json({ error: 'Wrong contract address' });
        return false;
    }

    return parsedTx;
}

app.post('/api/createOrder', async (req, res) => {
    try {
        const { data, from } = req.body;
        console.log('data', data);

        let iface = new ethers.utils.Interface(orderBookABI);
        const decoded = iface.decodeFunctionData('createOrder', data);
        if (!decoded || !decoded.order) {
            return res.status(200).json({ error: 'Invalid data' });
        }

        const {
            maker,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            recipient,
            deadline,
            v, r, s
        } = decoded.order;
        const order = new Order(
            maker,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            recipient,
            deadline,
        );
        const orderMsg = order.messageHash(config.chainId, config.contracts.orderBook);
        // console.log('orderMsg', orderMsg);
        // console.log('sign', {v, r, s});
        const signature = ethers.utils.joinSignature({ v, r, s });
        // console.log('signature', signature);

        const signer = web3.eth.accounts.recover(orderMsg, signature, true);
        
        if ((signer||"").toLowerCase() !== (from||"").toLowerCase()) {
            console.log(signer, from);
            return res.status(200).json({ error: 'Invalid signature' });
        }

        const nonce = await relayer.getTransactionCount();
        const tx = await relayer.sendTransaction({
            to: config.contracts.orderBook,
            data: data,
            gasLimit: 600000,
            gasPrice: ethers.utils.parseUnits('10', 'gwei'),
            nonce
        });
        console.log(tx);
        // const receipt = await tx.wait();
        // console.log(receipt);
        
        res.status(200).json({
            success: true,
            data: tx
        })
    } catch (e) {
        console.log(e);
        res.status(500).json({error: e});
    }
});

app.post('/api/cancelOrder', async (req, res) => {
    try {
        const { data, from } = req.body;

        const parsedTx = validateContractParams(res, data, from, config.contracts.settlement);
        if (!parsedTx) {
            return;
        }

        let iface = new ethers.utils.Interface(settlementABI);
        const cancelTx = iface.parseTransaction(parsedTx);

        if (!cancelTx || cancelTx.name !== 'cancelOrder' || !cancelTx.args['hash']) {
            return res.status(200).json({ error: 'Invalid cancel order tx' });
        }

        /// todo: should we check order hash existed on OrderBook contractx?

        const tx = await provider.sendTransaction(data);
        // console.log(tx);
        const receipt = await tx.wait();
        // console.log(receipt);
        
        res.status(200).json({
            success: true,
            data: receipt
        })
    } catch (e) {
        console.log(e);
        res.status(500).json({error: e});
    }
});

app.get('/api/orders/:hash', async (req, res) => {
    try {
        const orderHash = req.params.hash;
        const {
            maker,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            recipient,
            deadline,
            v,
            r,
            s
        } = await orderBookContract.orderOfHash(orderHash);
        const order = {
            maker,
            fromToken,
            toToken,
            amountIn: Number(amountIn),
            amountOutMin: Number(amountOutMin),
            recipient,
            deadline: Number(deadline),
            v,
            r,
            s
        };
        order.canceled = await settlementContract.canceledOfHash(order.maker, orderHash);
        filledAmount = await settlementContract.filledAmountInOfHash[orderHash];
        order.filledAmount = filledAmount != null ? Number(filledAmount) : 0;
        
        res.status(200).json({
            success: true,
            data: order
        });
    } catch (e) {
        console.log(e);
        res.status(500).json({error: e});
    }
});