const path = require('path');
const fs = require('fs');
const ethers = require('ethers');
const config = require('./config');
const {
    OrderBook: orderBookABI,
    OrderBookMargin: orderBookMarginABI,
} = require('./config/abis');

const filePath = path.resolve(__dirname, './store.json');

const BLOCK_BATCH = 9990;
const MAX_CHECK_BLOCKS = 100000; //check order created events for 100,000 previous blocks

class TxStore {
    constructor() {
        this.orderTxs = {};
    }

    async init(provider) {
        /** @type {ethers.providers.Provider} */
        this.provider = provider;
        this.orderBookContract = new ethers.Contract(config.contracts.orderBook, orderBookABI, provider);
        this.orderBookMarginContract = new ethers.Contract(config.contracts.orderBookMargin, orderBookMarginABI, provider);
        await this.read();
        await this.loadAllOrders();
    }

    async read() {
        return new Promise(resolve => {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, '{}', 'utf8');
            }
            fs.readFile(filePath, 'utf8', (err, content) => {
                if (err) console.log(err);
                else if (content) {
                    const data = JSON.parse(content || "");
                    this.orderTxs = Object.assign({}, this.orderTxs, data);
                }
                resolve();
            });
        });
    }

    async write() {
        return new Promise(resolve => {
            const content = JSON.stringify(this.orderTxs, null, 2);
            fs.writeFile(filePath, content, 'utf8', (err) => {
                if (err) console.log(err);
                resolve();
            });
        });
    }

    async loadAllOrders() {
        try {
            const currentBlock = await this.provider.getBlockNumber();
            let fromBlock = await this.getLastTxBlock();

            fromBlock = Math.max(fromBlock || 0, currentBlock - MAX_CHECK_BLOCKS);

            console.log('Loading created order hashes in block range:', fromBlock, currentBlock);

            for(;fromBlock < currentBlock; fromBlock += BLOCK_BATCH) {
                const toBlock = Math.min(currentBlock, fromBlock + BLOCK_BATCH);

                let events = await this.orderBookContract.queryFilter(this.orderBookContract.filters.OrderCreated(), fromBlock, toBlock);
                let marginEvents = await this.orderBookMarginContract.queryFilter(this.orderBookMarginContract.filters.MarginOrderCreated(), fromBlock, toBlock);

                events = events || [];
                marginEvents = marginEvents || [];

                console.log('Blocks %s - %s: Total %s spot orders, %s margin orders', fromBlock, toBlock, events.length, marginEvents.length);
    
                events.concat(marginEvents).forEach(event => {
                    const hash = event && event.args && event.args.hash;
                    if (hash && !this.orderTxs[hash]) {
                        const data = {
                            tx: event.transactionHash,
                        };
                        if (event.args.limitPrice) {
                            data.limitPrice = String(event.args.limitPrice);
                        }
                        this.orderTxs[hash] = data;
                    }
                });
            }

            await this.write();
        } catch (e) {
            console.log(e);
        }
    }

    async addOrderHash(hash, txHash) {
        this.orderTxs[hash] = {
            tx: txHash
        };
        await this.write();

        this.provider.waitForTransaction(txHash).then(receipt => {
            if (receipt && receipt.logs && receipt.logs.length > 0) {
                const createdLog = receipt.logs[receipt.logs.length - 1];
                let orderCreatedEv;
                try {
                    orderCreatedEv = this.orderBookContract.interface.decodeEventLog('OrderCreated', createdLog.data, createdLog.topic);
                } catch(e) {}

                if (orderCreatedEv) {
                    this.orderTxs[hash] = {
                        tx: txHash,
                        limitPrice: String(orderCreatedEv.limitPrice)
                    };
                    this.write();
                }
            }
        });
    }

    getTx(orderHash) {
        return this.orderTxs[orderHash] || "";
    }

    async getLastTxBlock() {
        let lng = Object.values(this.orderTxs).length;
        const lastTx = Object.values(this.orderTxs)[lng - 1];
        if (lastTx && lastTx.tx) {
            const tx = await this.provider.getTransaction(lastTx.tx);
            return tx.blockNumber;
        }
    }
}

module.exports = new TxStore();