import { BigNumber, constants, Contract, ethers } from "ethers";
import { OrderBookMarginLogic__factory, SettlementLogic__factory } from "./contracts";
import MarginOrder from "./types/MarginOrder";
import config from "./config";
import Log from "./Log";
import { Utils } from "./Utils";
import abiLoan from './config/abi_loan.json';

const LIMIT = 20;

export type OnCreateOrder = (hash: string) => Promise<void> | void;
export type OnCancelOrder = (hash: string) => Promise<void> | void;

const BLOCKS_PER_DAY = 6500;

class MarginOrders {
    private static async fetchCanceledHashes(provider: ethers.providers.BaseProvider) {
        const fromBlock = (await provider.getBlockNumber()) - BLOCKS_PER_DAY;
        const settlement = SettlementLogic__factory.connect(config.contracts.settlement, provider);
        const filter = settlement.filters.MarginOrderCanceled();
        return (await settlement.queryFilter(filter, fromBlock)).map(event => event.args![0]);
        // return await settlement.allCanceledHashes();
    }

    private static async fetchHashes(kovanProvider: ethers.providers.BaseProvider) {
        const orderBook = OrderBookMarginLogic__factory.connect(config.contracts.orderBookMargin, kovanProvider);
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
            const canceledHashes = await MarginOrders.fetchCanceledHashes(provider);
            const hashes = await MarginOrders.fetchHashes(kovanProvider);
            const now = Math.floor(Date.now() / 1000);
            return (
                await Promise.all(
                    hashes
                        .filter(hash => !canceledHashes.includes(hash))
                        .map(async hash => {
                            const order = await this.fetchOrder(hash, kovanProvider);
                            if (order.deadline.toNumber() < now) return null;
                            const filledAmountIn = await settlement.filledAmountInOfHash(hash);
                            if (order.collateralTokenSent.add(order.loanTokenSent).eq(filledAmountIn)) return null;
                            if (!this.validOrderParams(order)) return null;
                            return order;
                        })
                )
            ).filter(order => !!order);
        } catch (e) {
            Log.e(e);
            return [];
        }
    }

    static async fetchOrder(hash: string, kovanProvider: ethers.providers.BaseProvider) {
        const orderBook = OrderBookMarginLogic__factory.connect(config.contracts.orderBookMargin, kovanProvider);
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
            v,
            r,
            s
        } = await orderBook.orderOfHash(hash);
        return {
            hash,
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
            v,
            r,
            s
        } as MarginOrder;
    }

    static watch(
        onCreateOrder: OnCreateOrder,
        onCancelOrder: OnCancelOrder,
        provider: ethers.providers.BaseProvider,
        kovanProvider: ethers.providers.BaseProvider
    ) {
        const orderBook = OrderBookMarginLogic__factory.connect(config.contracts.orderBookMargin, kovanProvider);
        const settlement = SettlementLogic__factory.connect(config.contracts.settlement, provider);
        orderBook.on("MarginOrderCreated", onCreateOrder);
        settlement.on("MarginOrderCanceled", onCancelOrder);
    }

    static async getOrderSize(order: MarginOrder, provider: ethers.providers.BaseProvider) : Promise<BigNumber> {
        let orderSize: BigNumber = constants.Zero;
        if (order.collateralTokenSent.gt(constants.Zero)) {
            const amn = await Utils.convertUsdAmount(order.collateralTokenAddress, order.collateralTokenSent);
            orderSize = orderSize.add(amn);
        }
        if (order.loanTokenSent.gt(constants.Zero)) {
            const loanContract = new Contract(order.loanTokenAddress, abiLoan, provider);
            const loanAssetAdr = await loanContract.loanTokenAddress();
            const loanAmnUsd = await Utils.convertUsdAmount(loanAssetAdr, order.loanTokenSent);
            orderSize = orderSize.add(loanAmnUsd);
        }
        return orderSize;
    }

    static parseOrder(json: any): MarginOrder {
        return {
            ...json,
            leverageAmount: BigNumber.from(json.leverageAmount),
            loanTokenSent: BigNumber.from(json.loanTokenSent),
            collateralTokenSent: BigNumber.from(json.collateralTokenSent),
            minEntryPrice: BigNumber.from(json.minEntryPrice),
            deadline: BigNumber.from(json.deadline),
            createdTimestamp: BigNumber.from(json.createdTimestamp),
        };
    }

    static validOrderParams(order: MarginOrder) {
        const loanTokenAddress = order.loanTokenAddress.toLowerCase();
        const collateralTokenAddress = order.collateralTokenAddress.toLowerCase();
        const validLoanAdr = Object.values(config.loanContracts).find(adr => adr.toLowerCase() == loanTokenAddress);
        const validCollToken = config.tokens.find(token => token.address.toLowerCase() == collateralTokenAddress);
        if (!validLoanAdr || !validCollToken) {
            console.log("margin order parmas invalid, hash", order.hash, order.loanTokenAddress);
        }
        return validLoanAdr != null && validCollToken != null;
    }
}

export default MarginOrders;
