import RSK from "./RSK";
import Pairs from "./Pairs";
import Log from "./Log";
import Orders from "./Orders";
import IO from "socket.io";
import { ethers } from "ethers";
import Executor from "./Executor";
import Monitor from "./Monitor";
import MarginOrders from './MarginOrders';
import config from './config';
import Db from './Db';


const mainnet = RSK.Mainnet;
let testnet = RSK.Testnet;

if (!config.mainnet) {
    testnet = mainnet;
}

// tslint:disable-next-line:max-func-body-length

export const start = async (io: IO.Server) => {
    Db.initDb(config.db);

    Promise.all([
        processLimitOrderes(),
        processMarginOrders(),
    ]).catch(e => Log.e(e));

    Monitor.init(mainnet);
    io.on('connection', (socket) => {
        socket.on('getAddresses', async (cb) => Monitor.getAddresses(cb));
        socket.on('getTotals', async (cb) => Monitor.getTotals(cb));
        socket.on('getLast24HTotals', async (cb) => Monitor.getTotals(cb, true));
        socket.on('getOrderDetail', async (hash, isMargin, cb) => Monitor.getOrderDetail(hash, isMargin, cb));
    });
};

const processLimitOrderes = async () => {
    Log.d("fetching pairs...");
    let { tokens, pairs } = await updateTokensAndPairs(mainnet.provider);

    Log.d("fetching orders...");
    const orders = await Orders.fetch(mainnet.provider, testnet.provider);
    Log.d("found " + orders.length + " orders");
    orders.forEach(order => {
        Log.d("  " + order.hash);
    });
    Orders.watch(
        async hash => {
            Log.d("order created: " + hash);
            orders.push(await Orders.fetchOrder(hash, testnet.provider));
        },
        hash => {
            Log.d("order cancelled: " + hash);
            const index = orders.findIndex(order => order.hash === hash);
            if (index >= 0) {
                orders.splice(index, 1);
                Db.updateOrdersStatus([hash], 'cancelled');
            }
        },
        mainnet.provider,
        testnet.provider
    );

    const executor = new Executor(mainnet.provider);
    Log.d("listening to new blocks...");
    mainnet.provider.on("block", async blockNumber => {
        // Log.d("block: " + blockNumber);
        // every 12 hours
        if (blockNumber % 2880 === 0) {
            const latest = await updateTokensAndPairs(mainnet.provider);
            tokens = latest.tokens;
            pairs = latest.pairs;
        }
        // every 1 minute
        if (blockNumber % 2 === 0) {
            try {
                const matched = await executor.match(tokens, pairs, orders, 10000);
                Log.d("matched " + matched.length + " orders");
                matched.forEach(order => {
                    const aux = order.trade
                        ? " at " +
                          order.trade?.executionPrice.toFixed(8) +
                          " " +
                          order.trade.route.path[order.trade.route.path.length - 1].symbol +
                          "/" +
                          order.trade.route.path[0].symbol
                        : "";
                    Log.d("  " + order.hash + aux);
                });
                await executor.checkFillBatchOrders(mainnet, 'limit');
            } catch (e) {
                Log.e("error: " + e.reason || e.message || e.toString());
                console.error(e);
            }
        }
    });
    executor.watch(async hash => {
        Log.d("order filled: " + hash);
        const index = orders.findIndex(o => o.hash === hash);
        if (index >= 0) {
            const order = orders[index];
            const filledAmountIn = await executor.filledAmountIn(order.hash);
            if (filledAmountIn.eq(order.amountIn)) {
                orders.splice(index, 1);
            }
        }
    });
};

const processMarginOrders = async () => {
    Log.d("fetching margin orders...");
    const orders = await MarginOrders.fetch(mainnet.provider, testnet.provider);
    Log.d("found " + orders.length + " margin orders");
    orders.forEach(order => {
        Log.d("  " + order.hash);
    });
    MarginOrders.watch(
        async hash => {
            Log.d("margin order created: " + hash);
            orders.push(await MarginOrders.fetchOrder(hash, testnet.provider));
        },
        hash => {
            Log.d("margin order cancelled: " + hash);
            const index = orders.findIndex(order => order.hash === hash);
            if (index >= 0) {
                orders.splice(index, 1);
                Db.updateOrdersStatus([hash], 'cancelled');
            }
        },
        mainnet.provider,
        testnet.provider
    );

    const executor = new Executor(mainnet.provider);
    Log.d("listening to new blocks...");
    mainnet.provider.on("block", async blockNumber => {
        Log.d("block: " + blockNumber);
        // every 1 minute
        if (blockNumber % 2 === 0) {
            try {
                await executor.matchMarginOrders(orders);

                await executor.checkFillBatchOrders(mainnet, 'margin');
            } catch (e) {
                Log.e("error: " + e.reason || e.message || e.toString());
                console.error(e);
            }
        }
    });
    executor.watchMargin(async hash => {
        Log.d("order filled: " + hash);
        const index = orders.findIndex(o => o.hash === hash);
        if (index >= 0) {
            const order = orders[index];
            const filledAmountIn = await executor.filledAmountIn(order.hash);
            if (filledAmountIn.eq(order.collateralTokenSent.add(order.loanTokenSent))) {
                orders.splice(index, 1);
            }
        }
    });
};

const updateTokensAndPairs = async (provider: ethers.providers.BaseProvider) => {
    const { tokens, pairs } = await Pairs.fetch(provider);
    Log.d("found " + tokens.length + " tokens");
    tokens.forEach(token => {
        Log.d(token.symbol + ":  " + token.address);
    });
    Log.d("found " + pairs.length + " pairs");
    pairs.forEach(pair => {
        Log.d(`${pair.token0.symbol} - ${pair.token1.symbol}`);
    });
    return { tokens, pairs };
};
