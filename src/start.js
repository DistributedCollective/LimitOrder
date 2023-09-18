const path = require('path');
const express = require('express');
const ethers = require('ethers');
const bodyParser = require('body-parser');
const Tx = require("@ethersproject/transactions");
const { keccak256 } = require("@ethersproject/keccak256");
const Web3 = require('web3');

const config = require('./config');
console.log(config);
const {
    OrderBook: orderBookABI,
    OrderBookMargin: orderBookMarginABI,
    Settlement: settlementABI
} = require('./config/abis');
const Order = require('./Order');
const MarginOrder = require('./MarginOrder');
const relayer = require('./relayer');
const txStore = require('./TxStore');

const app = express();
var cors = require('cors');
app.use(cors())

const port = config.port;
const provider = new ethers.providers.JsonRpcProvider(config.networkUrl);
const orderBookProvider = new ethers.providers.JsonRpcProvider(config.orderBookNetwork);

const orderBookContract = new ethers.Contract(config.contracts.orderBook, orderBookABI, orderBookProvider);
const orderBookMarginContract = new ethers.Contract(config.contracts.orderBookMargin, orderBookMarginABI, orderBookProvider);
const settlementContract = new ethers.Contract(config.contracts.settlement, settlementABI, provider);

const web3 = new Web3(config.orderBookNetwork);

relayer.init(orderBookProvider);
txStore.init(orderBookProvider);

app.use(bodyParser.json());

app.use('/public', express.static(path.resolve(__dirname, '../public')));
app.use('/logs', express.static(path.resolve(__dirname, '../logs')));


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
     console.log(signer, parsedTx.from);
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
    console.log("new order")
    try {
        const { data, from } = req.body;

        let iface = new ethers.utils.Interface(orderBookABI);
        const decoded = iface.decodeFunctionData('createOrder', data);
        if (!decoded || !decoded.order) {
            console.log("error decoding");
            console.log(decoded);
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
            created,
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
            created
        );
        const orderMsg = order.messageHash(config.orderBookChainId, config.contracts.orderBook);
        const signature = ethers.utils.joinSignature({ v, r, s });
        
        const signer = web3.eth.accounts.recover(orderMsg, signature, true);
        
        if ((signer||"").toLowerCase() !== (from||"").toLowerCase()) {
            console.log(signer, from);
            return res.status(200).json({ error: 'Invalid signature' });
        }

        const hash = order.hash();
        console.log("Creating limit order hash", hash);
        console.log('order msg', orderMsg);
        
        const tx = await relayer.sendTx({
            to: config.contracts.orderBook,
            data: data,
            gasLimit: 600000,
        });

        await txStore.addOrderHash(hash, tx.hash);

        res.status(200).json({
            success: true,
            data: tx
        });
    } catch (e) {
        console.log(e);
        res.status(500).json({error: e});
    }
});

app.post('/api/createMarginOrder', async (req, res) => {
    console.log("new margin order")
    try {
        const { data, from } = req.body;

        let iface = new ethers.utils.Interface(orderBookMarginABI);
        const decoded = iface.decodeFunctionData('createOrder', data);
        if (!decoded || !decoded.order) {
            return res.status(200).json({ error: 'Invalid data' });
        }

        const {
            loanId,
            leverageAmount,
            loanTokenAddress,
            loanTokenSent,
            collateralTokenSent,
            collateralTokenAddress,
            trader,
            minEntryPrice,
            loanDataBytes,
            deadline,
            createdTimestamp,
            v, r, s
        } = decoded.order;
        const order = new MarginOrder(
            loanId,
            leverageAmount,
            loanTokenAddress,
            loanTokenSent,
            collateralTokenSent,
            collateralTokenAddress,
            trader,
            minEntryPrice,
            loanDataBytes,
            deadline,
            createdTimestamp,
        );
        const orderMsg = order.messageHash(config.orderBookChainId, config.contracts.orderBookMargin);
        const signature = ethers.utils.joinSignature({ v, r, s });

        const signer = web3.eth.accounts.recover(orderMsg, signature, true);

        if ((signer || "").toLowerCase() !== (from || "").toLowerCase()) {
            console.log(signer, from);
            return res.status(200).json({ error: 'Invalid signature' });
        }

        const hash = order.hash();
        console.log("Creating margin order hash", hash);

        const tx = await relayer.sendTx({
            to: config.contracts.orderBookMargin,
            data: data,
            gasLimit: 600000,
        });

        await txStore.addOrderHash(hash, tx.hash);

        res.status(200).json({
            success: true,
            data: tx
        })
    } catch (e) {
        console.log(e);
        res.status(500).json({ error: e });
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

app.get('/api/orders/:adr', async (req, res) => {
    
    try {
        const userAdr = req.params.adr;
        const isMargin = req.query.isMargin == '1';
        const offset = Number(req.query.offset) || 0;
        const limit = Number(req.query.limit) || 10;
        let orderFields = isMargin ? [
            'loanId',
            'leverageAmount',
            'loanTokenAddress',
            'loanTokenSent',
            'collateralTokenSent',
            'collateralTokenAddress',
            'trader',
            'minEntryPrice',
            'loanDataBytes',
            'deadline',
            'createdTimestamp',
            'v',
            'r',
            's',
        ] : [
            'maker',
            'fromToken',
            'toToken',
            'amountIn',
            'amountOutMin',
            'recipient',
            'deadline',
            'created',
            'v',
            'r',
            's',
        ];

        let contract = isMargin ? orderBookMarginContract : orderBookContract;

        const rawOrders = await contract.getOrders(userAdr, offset, limit);

        const orders = rawOrders.map(item => {
            const order = orderFields.reduce((ret, f) => ({ ...ret, [f]: item[f] }), {});
            const owner = isMargin ? order.trader : order.maker;
            return owner != ethers.constants.AddressZero ? order : null;
        }).filter(order => !!order);

        if (!orders || orders.length == 0) {
            return res.status(200).json({ status: 200, data: [] });
        }

        const orderHashes = orders.map(order => {
            const hash = isMargin ? new MarginOrder().hash(order) : new Order().hash(order);
            order.hash = hash;
            return hash;
        });
        const canceledData = await settlementContract.checkCanceledHashes(orderHashes);

        const filledData = await settlementContract.checkFilledAmountHashes(orderHashes);

        for (const order of orders) {
            const canceled = (canceledData || []).find(item => order.hash == item.hash);
            const filled = (filledData || []).find(item => order.hash == item.hash);
            order.canceled = (canceled || {}).canceled || false;
            order.filled = (filled || {}).amount || false;
            const { tx, limitPrice } = txStore.getTx(order.hash);
            order.transactionHash = tx;
            if (limitPrice) order.limitPrice = limitPrice;
        }

        return res.status(200).json({
            success: true,
            data: orders
        });
    } catch (e) {
        console.log(e);
        res.status(500).json({error: e});
    }
});