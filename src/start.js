const express = require('express');
const ethers = require('ethers');
const bodyParser = require('body-parser');
const Tx = require("@ethersproject/transactions");
const { keccak256 } = require("@ethersproject/keccak256");

const config = require('./config');
const { abi: orderBookABI } = require('../deployments/localhost/OrderBook.json');
const { abi: settlementABI } = require('../deployments/localhost/Settlement.json');
const Order = require('./Order');

const app = express();
const port = config.port;
const provider = new ethers.providers.JsonRpcProvider(config.networkUrl);
const contract = new ethers.Contract(config.contracts.orderBook, orderBookABI);

app.use(bodyParser.json());

app.listen(port, () => {
    console.log("Server started listening on port", port);
});

const validateContractParams = (res, rawTx, contractAddress) => {
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
    if (signer !== parsedTx.from) {
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
        const { data } = req.body;
        const parsedTx = validateContractParams(res, data, config.contracts.orderBook);
        if (!parsedTx) {
            return;
        }

        let iface = new ethers.utils.Interface(orderBookABI);
        const orderTx = iface.parseTransaction(parsedTx);

        if (!orderTx || orderTx.name !== 'createOrder' || !orderTx.args['order']) {
            return res.status(200).json({ error: 'Invalid create order tx' });
        }

        const tx = await provider.sendTransaction(data);
        console.log(tx);
        const receipt = await tx.wait();
        console.log(receipt);
        
        res.status(200).json({
            success: true,
            data: receipt
        })
    } catch (e) {
        console.log(e);
        res.status(500).json({error: e});
    }
});

app.post('/api/cancelOrder', async (req, res) => {
    try {
        const { data } = req.body;

        const parsedTx = validateContractParams(res, data, config.contracts.settlement);
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
        console.log(receipt);
        
        res.status(200).json({
            success: true,
            data: receipt
        })
    } catch (e) {
        console.log(e);
        res.status(500).json({error: e});
    }
});