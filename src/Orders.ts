import { ethers, BigNumber } from "ethers";
import { OrderBookSwapLogic__factory, SettlementLogic__factory } from "./contracts";
import Order from "./types/Order";
import config from "./config";

const LIMIT = 20;

export type OnCreateOrder = (hash: string) => Promise<void> | void;
export type OnCancelOrder = (hash: string) => Promise<void> | void;

const BLOCKS_PER_DAY = 6500;

class Orders {
    private static async fetchCanceledHashes(provider: ethers.providers.BaseProvider) {
        const fromBlock = (await provider.getBlockNumber()) - BLOCKS_PER_DAY;
        const settlement = SettlementLogic__factory.connect(config.contracts.settlement, provider);
        const filter = settlement.filters.OrderCanceled(null);
        return (await settlement.queryFilter(filter, fromBlock)).map(event => event.args![0]);
    }

    private static async fetchHashes(kovanProvider: ethers.providers.BaseProvider) {
        const orderBook = OrderBookSwapLogic__factory.connect(config.contracts.orderBook, kovanProvider);
        const length = (await orderBook.numberOfAllHashes()).toNumber();
        const pages: number[] = [];
        for (let i = 0; i * LIMIT < length; i++) pages.push(i);
        return (await Promise.all(pages.map(async page => await orderBook.allHashes(page, LIMIT))))
            .flat()
            .filter(hash => hash !== ethers.constants.HashZero);
    }

    static async fetch(provider: ethers.providers.BaseProvider, kovanProvider: ethers.providers.BaseProvider) {
        try {
            const settlement = SettlementLogic__factory.connect(config.contracts.settlement, provider);
            const canceledHashes = await Orders.fetchCanceledHashes(provider);
            const hashes = await Orders.fetchHashes(kovanProvider);
            const now = Math.floor(Date.now() / 1000);
            return (
                await Promise.all(
                    hashes
                        .filter(hash => !canceledHashes.includes(hash))
                        .map(async hash => {
                            const order = await this.fetchOrder(hash, kovanProvider);
                            if (order.deadline.toNumber() < now) return null;
                            const filledAmountIn = await settlement.filledAmountInOfHash(hash);
                            if (order.amountIn.eq(filledAmountIn)) return null;
                            if (!this.validOrderParams(order)) return null;
                            return order;
                        })
                )
            ).filter(order => !!order);
        } catch (e) {
            console.log(e);
            return [];
        }
    }

    static async fetchOrder(hash: string, kovanProvider: ethers.providers.BaseProvider) {
        const orderBook = OrderBookSwapLogic__factory.connect(config.contracts.orderBook, kovanProvider);
        const {
            maker,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            recipient,
            deadline,
            created,
            v,
            r,
            s
        } = await orderBook.orderOfHash(hash);
        return {
            hash,
            maker,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            recipient,
            deadline,
            created,
            v,
            r,
            s
        } as Order;
    }

    static watch(
        onCreateOrder: OnCreateOrder,
        onCancelOrder: OnCancelOrder,
        provider: ethers.providers.BaseProvider,
        kovanProvider: ethers.providers.BaseProvider
    ) {
        const orderBook = OrderBookSwapLogic__factory.connect(config.contracts.orderBook, kovanProvider);
        const settlement = SettlementLogic__factory.connect(config.contracts.settlement, provider);
        orderBook.on("OrderCreated", onCreateOrder);
        settlement.on("OrderCanceled", onCancelOrder);
    }

    static parseOrder(orderJSON): Order {
        return {
            ...orderJSON,
            amountIn: BigNumber.from(orderJSON.amountIn),
            amountOutMin: BigNumber.from(orderJSON.amountOutMin),
            deadline: BigNumber.from(orderJSON.deadline),
            created: BigNumber.from(orderJSON.created),
        };
    }

    static validOrderParams(order: Order) {
        const fromToken = order.fromToken.toLowerCase();
        const toToken = order.toToken.toLowerCase();
        const validFromToken = config.tokens.find(token => token.address.toLowerCase() == fromToken);
        const validToToken = config.tokens.find(token => token.address.toLowerCase() == toToken);
        return validFromToken != null && validToToken != null;
    }
}

export default Orders;
