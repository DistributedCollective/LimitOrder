const { ethers } = require("hardhat");
const { TokenAmount, Trade, Percent, Router } = require("@sushiswap/sdk");
const getContract = require("./getContract");
// const findPairs = require("./findPairs");
const sortTokens = require("./sortTokens");
const Order = require("./Order");
const { BigNumber } = require("ethers");
const { WRBTC } = require("../tokens");
const sSNAbi = require('../ssnabi.json');


module.exports = async () => {
    const { chainId } = await ethers.provider.detectNetwork();
    const users = await ethers.getSigners();
    const WrbtcAdr = WRBTC[chainId].address.toLowerCase();

    const getTrade = async (fromToken, toToken, amountIn) => {
        const factory = await getContract("UniswapV2Factory");
        const pairs = await findPairs(chainId, factory.address, fromToken, toToken, ethers.provider);
        return Trade.bestTradeExactIn(pairs, new TokenAmount(fromToken, amountIn.toString()), toToken, {
            maxNumResults: 1,
            maxHops: 3,
        })[0];
        
    };

    const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(Date.now() / 1000 + hoursFromNow * 3600));

    const createOrder = async (signer, fromToken, toToken, amountIn, amountOutMin, deadline, overrides = {}) => {
        // const settlement = await getContract("Settlement", signer);

        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);

        const fromERC20 = await ethers.getContractAt("TestToken", fromToken.address, signer);
        // console.log("allowance before")
        // console.log(Number(await fromERC20.allowance(signer.address, settlement.address)));
        await fromERC20.approve(settlement.address, overrides.amountToApprove || amountIn);
        // console.log("allowance after %s -> %s", signer.address, settlement.address);
        // console.log(Number(await fromERC20.allowance(signer.address, settlement.address)));
        const order = new Order(
            signer,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            signer.address,
            deadline,
            ethers.BigNumber.from(Math.floor(Date.now() / 1000))
        );
        const estFee = await estOrderFee(order, order.amountIn);
        if (order.amountIn.lt(estFee)) {
            throw "Order size need bigger than fee, fee = " + ethers.utils.formatEther(estFee);
        }
        const limitPrice = order.amountOutMin.mul(ethers.constants.WeiPerEther).div(order.amountIn.sub(estFee));
        console.log(await order.hash(), 'limit price', ethers.utils.formatEther(limitPrice));

        const { abi: orderBookABI } = await deployments.get("OrderBookSwapLogic");
        const { address: orderBoookAddress } = await deployments.get("OrderBookSwapProxy");
        const orderBook = await ethers.getContractAt(orderBookABI, orderBoookAddress);
        const tx = await orderBook.createOrder(await order.toArgs(overrides), limitPrice);
        return { order, tx, limitPrice };
    };

    const cancelOrder = async (signer, order, overrides = {}) => {
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        return await settlement.cancelOrder(await order.toArgs());
    };

    const fillOrder = async (signer, order, amountToFillIn, amountToFillOut, path, overrides = {}) => {
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const orderArgs = await order.toArgs(overrides);

        return await settlement.fillOrders([[
            orderArgs,
            amountToFillIn,
            amountToFillOut,
            path
        ]], {
            gasLimit: '1000000'
        });
    };


    const filledAmountIn = async (signer, order) => {
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        return await settlement.filledAmountInOfHash(await order.hash());
    };

    const estOrderFee = async (order, fillAmount) => {
        fillAmount = fillAmount || order.amountIn;
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const orderSize = ethers.BigNumber.from(String(fillAmount));
        let orderFee = orderSize.mul(2).div(1000); //-0.2% relayer fee
        let minFeeAmount = await settlement.minSwapOrderTxFee();

        if (order.fromToken.address.toLowerCase() != WrbtcAdr.toLowerCase()) {
            const swap = await getContract("TestSovrynSwap");
            // const swap = await ethers.getContractAt(sSNAbi, sovrynSwapNetwork.address, users[0]);
            const path = await swap.conversionPath(WrbtcAdr, order.fromToken.address);
            minFeeAmount = await swap.rateByPath(path, minFeeAmount);
        }

        if (orderFee.lt(minFeeAmount)) orderFee = minFeeAmount;

        return orderFee;
    }

    return {
        chainId,
        users,
        // getTrade,
        getDeadline,
        createOrder,
        cancelOrder,
        fillOrder,
        filledAmountIn,
        estOrderFee
    };
};
