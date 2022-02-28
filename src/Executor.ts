import {
    Pair,
    Token,
    TokenAmount,
    Trade,
    TradeType,
    Currency,
    Route,
} from "@sushiswap/sdk";
import _ from 'lodash';
import swapAbi from "./config/abi_sovrynSwap.json";
import erc20Abi from "./config/abi_erc20.json";
import { BigNumber, constants, Contract, ContractReceipt, ContractTransaction, ethers, Signer } from "ethers";
import Order, { BaseOrder } from "./types/Order";
import Log from "./Log";
import { SettlementLogic__factory } from "./contracts";
import MarginOrder from "./types/MarginOrder";
import config from "./config";
import Db from "./Db";
import { Utils } from "./Utils";
import MarginOrders from "./MarginOrders";
import { formatEther } from "ethers/lib/utils";
import RSK from "./RSK";

export type OnOrderFilled = (
    hash: string,
    amountIn: ethers.BigNumber,
    amountOut: ethers.BigNumber
) => Promise<void> | void;

const findToken = (tokens: Token[], tokenAddress: string) => {
    return tokens.find(token => token.address.toLowerCase() === tokenAddress.toLowerCase());
};

const argsForOrder = async (order: Order, signer: ethers.Signer) => {
    const contract = SettlementLogic__factory.connect(config.contracts.settlement, signer);
    const swapContract = new Contract(config.contracts.sovrynSwap, swapAbi, signer);
    const fromToken = order.fromToken;
    const toToken = order.toToken;
    const path = await swapContract.conversionPath(fromToken, toToken);
    const arg = {
        order,
        amountToFillIn: order.amountIn,
        amountToFillOut: order.amountOutMin,
        path: path
    };
    
    try {
        const gasLimit = await contract.estimateGas.fillOrder(arg);
        Log.d('gasLimit', Number(gasLimit));
        return arg;
    } catch (e) {
        Log.w("  " + order.hash + " will revert");
        Log.e(e);
        await Db.updateFilledOrder(await signer.getAddress(), order.hash, '', 'failed', '');
        return null;
    }
};

const equalsCurrency = (currency1: Currency, currency2: Currency) => {
    return currency1.name === currency2.name;
}

const checkTradable = async (pairs: Pair[], tokenIn: Token, tokenOut: Token, amountIn: BigNumber, amountOutMin: BigNumber): Promise<boolean> => {
    let bestPair, bestAmountOut;
    for (let i = 0; i < pairs.length; i++) {
        const { token0, token1 } = pairs[i];
        if (equalsCurrency(token0, tokenIn) && equalsCurrency(token1, tokenOut) ||
            equalsCurrency(token0, tokenOut) && equalsCurrency(token1, tokenIn)
        ) {
            try {
                const amountOut = await Utils.convertTokenAmount(tokenIn.address, tokenOut.address, amountIn);
                if (amountOut.gte(amountOutMin) && (bestPair == null || amountOut.gt(bestAmountOut))) {
                    bestPair = pairs[i];
                    bestAmountOut = amountOut;
                }
            } catch (error) {
                Log.e(error);
            }
        }
    }

    return bestPair != null;
};

const checkOrdersAllowance = async (provider: ethers.providers.BaseProvider, orders: Order[]) => {
    // return orders;

    const result = [];
    const makers = _.uniqBy(orders, o => o.maker + ':' + o.fromToken)
        .map(o => ({ maker: o.maker, token: o.fromToken }));
    const allowances = await Promise.all(makers.map(async ({maker, token}) => {
        const tokenContract = new Contract(token, <any>erc20Abi, provider);
        let allowance;
        if (token.toLowerCase() === Utils.getTokenAddress('wrbtc').toLowerCase()) {
            const settlement = SettlementLogic__factory.connect(config.contracts.settlement, provider);
            allowance = await settlement.balanceOf(maker);
        } else {
            allowance = await tokenContract.allowance(maker, config.contracts.settlement);
        }

        return { maker, token, allowance: BigNumber.from(String(allowance)) };
    }));

    _.sortBy(orders, 'maker', order => -Number(formatEther(order.amountIn)))
    .forEach(order => {
        const validAllowance = allowances.find(o => {
            return o.maker === order.maker && o.token === order.fromToken
                && o.allowance.gte(order.amountIn);
        });
        if (validAllowance) {
            result.push(order);
            validAllowance.allowance = validAllowance.allowance.sub(order.amountIn);
        }
    });

    return result
};

const getPrice = async (signer: ethers.Signer) => {
    return (await signer.getGasPrice()).mul(120).div(100);
}

const calculateProfit = async (provider: ethers.providers.BaseProvider, order: BaseOrder, tx: ContractReceipt, orderInBatch: number, gasPrice: BigNumber) => {
    let orderSize;

    if ((order as Order).maker) {
        const limitOrder = order as Order;
        orderSize = await Utils.convertUsdAmount(limitOrder.fromToken, limitOrder.amountIn);
    } else {
        orderSize = await MarginOrders.getOrderSize(order as MarginOrder, provider);
    }
    const profit = orderSize.mul(2).div(1000); // 0.2% fee
    const txFee = tx.gasUsed.mul(gasPrice).div(orderInBatch);
    return formatEther(profit.sub(txFee));
}

class Executor {
    provider: ethers.providers.BaseProvider;

    constructor(provider: ethers.providers.BaseProvider) {
        this.provider = provider;
    }

    watch(onOrderFilled: OnOrderFilled) {
        const settlement = SettlementLogic__factory.connect(config.contracts.settlement, this.provider);
        settlement.on("OrderFilled", onOrderFilled);
    }

    watchMargin(onOrderFilled: OnOrderFilled) {
        const settlement = SettlementLogic__factory.connect(config.contracts.settlement, this.provider);
        settlement.on("MarginOrderFilled", onOrderFilled);
    }

    async filledAmountIn(hash: string) {
        const settlement = SettlementLogic__factory.connect(config.contracts.settlement, this.provider);
        return await settlement.filledAmountInOfHash(hash);
    }

    async match(tokens: Token[], pairs: Pair[], orders: Order[], timeout: number) {
        const executables: Order[] = [];
        const now = Date.now();
        for (const order of orders) {
            const added = await Db.orderModel.findOne({ hash: order.hash });
            if (added) continue;

            const fromToken = findToken(tokens, order.fromToken);
            const toToken = findToken(tokens, order.toToken);
            const filledAmountIn = await this.filledAmountIn(order.hash);
            if (fromToken && toToken && order.deadline.toNumber() * 1000 >= now && filledAmountIn.lt(order.amountIn)) {
                const tradable = await checkTradable(
                    pairs,
                    fromToken,
                    toToken,
                    order.amountIn,
                    order.amountOutMin
                );
                const orderSize = await Utils.convertUsdAmount(order.fromToken, order.amountIn);
                if (tradable && orderSize.gt(config.minOrderSize)) {
                    executables.push(order);
                }
            }
            if (Date.now() - now > timeout) break;
        }

        for (const order of executables) {
            await Db.addOrder(order);
        }

        return executables;
    }

    async matchMarginOrders(orders: MarginOrder[]) {
        const executables: MarginOrder[] = [];

        for (const order of orders) {
            const added = await Db.orderModel.findOne({ hash: order.hash });
            if (added) continue;
            const orderSize: BigNumber = await MarginOrders.getOrderSize(order, this.provider);
            if (orderSize.gt(config.minOrderSize)) {
                executables.push(order);
            }
        }

        for (const order of executables) {
            await Db.addMarginOrder(order);
        }

        return executables;
    }

    async checkFillBatchOrders(net: RSK, type = 'limit', retryBatchId: string = null) {
        try {
            console.log("Start checking for filling batch orders, type", type, new Date());
            const isLimitOrder = type == 'limit';
            let orders: BaseOrder[] = await Db.findMatchingOrders(type, {
                batchId: retryBatchId,
                status: !!retryBatchId ? 'retrying' : 'matched'
            });

            if (isLimitOrder) {
                orders = await checkOrdersAllowance(this.provider, orders as Order[]);
            }

            const batches = _.chunk(orders, config.maxOrdersInBatch);
            console.log(`processing ${orders.length} ${type} orders on ${batches.length} batches`);
            
            for (const batchOrders of batches) {
                const signer = await net.getWallet();
                if (signer == null) {
                    Log.d("No wallet available");
                    continue;
                }

                const batchId = retryBatchId || Utils.getUuid();
                await Db.updateOrdersStatus(batchOrders.map(order => order.hash), 'filling', batchId);
                console.log(new Date(), 'batch:', batchId, batchOrders.map(order => order.hash))

                const signerAdr = await signer.getAddress();
                let fill: Promise<ContractTransaction>;

                net.addPendingHash(signerAdr, batchId);

                if (isLimitOrder) {
                    fill = this.fillOrders(net, batchOrders as Order[], signer);
                } else {
                    fill = this.fillMarginOrders(net, batchOrders as MarginOrder[], signer);
                }

                fill.then(async (tx) => {
                    console.log(tx);
                    for (const order of batchOrders) {
                        await Db.updateFilledOrder(signerAdr, order.hash, tx.hash, 'filling', "");
                    }
                    const receipt = await tx.wait();
                    net.removeHash(batchId);
                    console.log(receipt);
                    for (const order of batchOrders) {
                        const profit = await calculateProfit(this.provider, order, receipt, batchOrders.length, tx.gasPrice);
                        await Db.updateFilledOrder(signerAdr, order.hash, receipt.transactionHash, 'success', profit);
                        Log.d(`profit of ${order.hash}: ${profit}$`);
                    }
                }).catch(async (e) => {
                    console.log(e);
                    Log.e(e);

                    net.removeHash(batchId);
                    if (batchOrders.length === 1) {
                        await Db.updateFilledOrder(signerAdr, batchOrders[0].hash, '', 'failed', '');
                    } else {
                        await Utils.wasteTime(10);
                        await this.retryFillFailedOrders(batchOrders.map(order => order), net, isLimitOrder);
                    }
                });
                await Utils.wasteTime(3);
            }


        } catch (err) {
            Log.e(err);
        }
    }

    async retryFillFailedOrders(orders: any[], net: RSK, isLimitOrder = false) {
        const mid = Math.round(orders.length / 2)
        const firstBatch = orders.slice(0, mid), lastBatch = orders.slice(mid);
        const batchId1 = Utils.getUuid(), batchId2 = Utils.getUuid();
        await Db.updateOrdersStatus(firstBatch.map(o => o.hash), 'retrying', batchId1);
        await Db.updateOrdersStatus(lastBatch.map(o => o.hash), 'retrying', batchId2);

        if (isLimitOrder) {
            await new Promise(async (resolve) => {
                this.checkFillBatchOrders(net, 'limit', batchId1)
                await Utils.wasteTime(3);
                this.checkFillBatchOrders(net, 'limit', batchId2);
                resolve(true);
            });
        } else {
            await new Promise(async (resolve) => {
                this.checkFillBatchOrders(net, 'margin', batchId1);
                await Utils.wasteTime(3);
                this.checkFillBatchOrders(net, 'margin', batchId2);
                resolve(true);
            });
        }
    }

    async fillOrders(net: RSK, orders: Order[], signer: ethers.Signer) {
        const contract = SettlementLogic__factory.connect(config.contracts.settlement, signer);
        const args = (
            await Promise.all(
                orders.map(order => argsForOrder(order, signer))
            )
        ).filter(arg => arg !== null);

        if (args.length > 0) {
            Log.d("filling orders...");
            await Db.updateOrdersStatus(args.map(arg => arg.order.hash), 'filling', Utils.getUuid());

            args.forEach(arg => {
                const symbol = Utils.getTokenSymbol(arg.order.fromToken);
                Log.d("  " + arg.order.hash + " (amountIn: " + formatEther(arg.order.amountIn) + " " + symbol + ")");
            });

            const signerAdr = await signer.getAddress();
            const gasLimit = await contract.estimateGas.fillOrders(args);
            const gasPrice = await getPrice(signer);
            const nonce = await net.getNonce(signerAdr);
            const tx = await contract.fillOrders(args, {
                gasLimit: gasLimit.mul(120).div(100),
                gasPrice: gasPrice,
                nonce
            });
            Log.d("  tx hash: ", tx.hash);
            return tx;
        }
    }

    async fillMarginOrders(net: RSK, orders: MarginOrder[], signer: Signer) {
        const contract = SettlementLogic__factory.connect(config.contracts.settlement, signer);
        const args = orders.map(order => ({ order }));

        if (args.length > 0) {
            Log.d("filling margin orders...");
            args.forEach(arg => {
                Log.d("  " + arg.order.hash);
            });

            const signerAdr = await signer.getAddress();
            const gasLimit = await contract.estimateGas.fillMarginOrders(args);
            const gasPrice = await getPrice(signer);
            const nonce = await net.getNonce(signerAdr);
            const tx = await contract.fillMarginOrders(args, {
                gasLimit: gasLimit.mul(120).div(100),
                gasPrice: gasPrice,
                nonce
            });
            return tx;
        }
    }
}

export default Executor;
