const path = require('path');
const fs = require('fs');
const ethers = require('ethers');
const config = require('./config');
const {
    OrderBook: orderBookABI,
    OrderBookMargin: orderBookMarginABI,
} = require('./config/abis');

const filePath = path.resolve(__dirname, './store.json');

class TxStore {
    constructor() {
        this.orderTxs = {};
    }

    async init(provider) {
        await this.read();
        await this.loadAllOrders(provider);
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

    async loadAllOrders(provider) {
        try {
            console.log('Loading all created order hashes');
            const orderBookContract = new ethers.Contract(config.contracts.orderBook, orderBookABI, provider);
            const orderBookMarginContract = new ethers.Contract(config.contracts.orderBookMargin, orderBookMarginABI, provider);
            const events = (await orderBookContract.queryFilter(orderBookContract.filters.OrderCreated())) || [];
            const marginEvents = (await orderBookMarginContract.queryFilter(orderBookMarginContract.filters.MarginOrderCreated())) || [];
            console.log('Total %s spot orders, %s margin orders', events.length, marginEvents.length);

            events.concat(marginEvents).forEach(event => {
                const hash = event && event.args && event.args.hash;
                if (hash && !this.orderTxs[hash]) {
                    this.orderTxs[hash] = event.transactionHash;
                }
            });

            await this.write();
        } catch (e) {
            console.log(e);
        }
    }

    async addOrderHash(hash, txHash) {
        this.orderTxs[hash] = txHash;
        await this.write();
    }

    getTx(orderHash) {
        return this.orderTxs[orderHash] || "";
    }
}

module.exports = new TxStore();