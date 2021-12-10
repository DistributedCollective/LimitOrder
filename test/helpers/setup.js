const { ethers } = require("hardhat");
const { TokenAmount, Trade, Percent, Router } = require("@sushiswap/sdk");
const getContract = require("./getContract");
// const findPairs = require("./findPairs");
const sortTokens = require("./sortTokens");
const Order = require("./Order");

const allowedSlippage = new Percent("50", "10000"); // 0.05%
const twentyMinutes = 60 * 20;

const deductedAmount = (amount, percent) => {
    return amount.sub(amount.mul(percent.numerator.toString()).div(percent.denominator.toString()));
};

const fromNow = delay => {
    return ethers.BigNumber.from(Math.floor(Date.now() / 1000 + delay));
};

module.exports = async () => {
    const { chainId } = await ethers.provider.detectNetwork();
    const users = await ethers.getSigners();

    const getTrade = async (fromToken, toToken, amountIn) => {
        const factory = await getContract("UniswapV2Factory");
        const pairs = await findPairs(chainId, factory.address, fromToken, toToken, ethers.provider);
        return Trade.bestTradeExactIn(pairs, new TokenAmount(fromToken, amountIn.toString()), toToken, {
            maxNumResults: 1,
            maxHops: 3,
        })[0];
        
    };

    const swap = async (signer, trade, recipient = signer.address) => {
        const router = await getContract("UniswapV2Router02", signer);
        const fromER20 = await ethers.getContractAt("IUniswapV2ERC20", trade.route.path[0].address, signer);
        await fromER20.approve(router.address, trade.inputAmount.raw.toString());

        const { methodName, args } = Router.swapCallParameters(trade, {
            ttl: fromNow(twentyMinutes).toNumber(),
            recipient,
            allowedSlippage,
        });
        await router.functions[methodName](...args);
    };

    const addLiquidity = async (signer, fromToken, toToken, fromAmount, toAmount, recipient = signer.address) => {
        const router = await getContract("TestSovrynSwap", signer);
        const fromER20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address, signer);
        await fromER20.approve(router.address, fromAmount);
        const toER20 = await ethers.getContractAt("IUniswapV2ERC20", toToken.address, signer);
        await toER20.approve(router.address, toAmount);

        const [token0, token1] = sortTokens(fromToken, toToken);
        const [amount0, amount1] = token0 === fromToken ? [fromAmount, toAmount] : [toAmount, fromAmount];
        await router.addLiquidity(
            token0.address,
            token1.address,
            amount0,
            amount1,
            deductedAmount(amount0, allowedSlippage),
            deductedAmount(amount1, allowedSlippage),
            recipient,
            fromNow(twentyMinutes)
        );
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

        const { abi: orderBookABI } = await deployments.get("OrderBookSwapLogic");
        const { address: orderBoookAddress } = await deployments.get("OrderBookSwapProxy");
        const orderBook = await ethers.getContractAt(orderBookABI, orderBoookAddress);
        const tx = await orderBook.createOrder(await order.toArgs(overrides));
        return { order, tx };
    };

    const cancelOrder = async (signer, order, overrides = {}) => {
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        return await settlement.cancelOrder(await order.toArgs());
    };

    const fillOrder = async (signer, order, amountToFillIn, path, overrides = {}) => {
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const orderArgs = await order.toArgs(overrides);

        return await settlement.fillOrders([[
            orderArgs,
            amountToFillIn,
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

    return {
        chainId,
        users,
        // getTrade,
        swap,
        addLiquidity,
        getDeadline,
        createOrder,
        cancelOrder,
        fillOrder,
        filledAmountIn,
    };
};
