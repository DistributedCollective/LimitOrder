// const sqlite3 = require('sqlite3').verbose();
import * as path from "path";
import * as SQLite3 from 'sqlite3';
import Log from "./Log";

import OrderModel from "./models/OrderModel";
import MarginOrder from "./types/MarginOrder";
import Order from "./types/Order";
import Orders from "./Orders";
import MarginOrders from "./MarginOrders";
const sqlite3 = SQLite3.verbose();

class DbCtrl {
    db: SQLite3.Database;
    orderModel: OrderModel;

    async initDb(dbName: string) {
        return new Promise(resolve => {
            const file = path.join(__dirname, '../db/' + dbName);
            this.db = new sqlite3.Database(file, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    Log.e(err.message, file);
                } else {

                    Log.d('Connected to the ' + dbName + ' database.');

                    this.initRepos().catch(Log.e);
                }
            });
        });
    }

    /**
     * @private
     */
    async initRepos() {
        try {
            this.orderModel = new OrderModel(this.db);

            await this.orderModel.createTable();
        } catch (e) {
            Log.e(e);
        }
    }

    async addOrder(order: Order) {
        try {
            const exists = await this.orderModel.findOne({ hash: order.hash });
            if (exists) return null;

            return await this.orderModel.insert({
                hash: order.hash,
                status: 'matched',
                type: 'limit',
                owner: order.maker,
                detail: JSON.stringify({ ...order, trade: undefined })
            });
        } catch (e) {
            Log.e(e);
        }
    }

    async addMarginOrder(order: MarginOrder) {
        try {
            const exists = await this.orderModel.findOne({ hash: order.hash });
            if (exists) return null;

            return await this.orderModel.insert({
                hash: order.hash,
                status: 'matched',
                type: 'margin',
                owner: order.trader,
                detail: JSON.stringify(order)
            });
        } catch (e) {
            Log.e(e);
        }
    }

    async updateFilledOrder(relayer: string, hash: string, txHash: string, status: string, profit: string) {
        try {
            const old: any = await this.orderModel.findOne({ hash });
            return await this.orderModel.update({ hash }, {
                relayer,
                txHash: txHash || old.txHash,
                profit,
                status,
            });
        } catch (e) {
            Log.e(e);
        }
    }

    async updateOrdersStatus(hashList: string[], status: string, batchId = null) {
        const updateObj: any = { status };
        if (batchId != null) {
            updateObj.batchId = batchId;
        }
        return await this.orderModel.update({ hash: hashList }, updateObj);
    }

    async findMatchingOrders(type, { status, batchId } = { status: null, batchId: null }) {
        const cond: any = {
            type,
            status: status || 'matched',
        };
        if (batchId) cond.batchId = batchId;
        const list: any = await this.orderModel.find(cond, { limit: 100 });
        return (list || []).map(item => {
            const json = JSON.parse(item.detail);
            return !!json.maker ? Orders.parseOrder(json) : MarginOrders.parseOrder(json);
        });
    }

    async getTotals(last24H) {
        try {
            let profit = 0;
            const sqlQuery = last24H ? // select either all actions or only the last 24h ones
                `SELECT * FROM orders WHERE dateAdded BETWEEN DATETIME('now', '-1 day') AND DATETIME('now')` :
                `SELECT * FROM orders`;
            const allRows: any = await this.orderModel.all(sqlQuery);
            (allRows || []).forEach((row) => {
                if (row.profit) {
                    profit += Number(row.profit);
                }
            });
            return { totalActionsNumber: allRows.length, profit };
        } catch (e) {
            Log.e(e);
        }
    }
}

export default new DbCtrl();
