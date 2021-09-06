const { ethers, deployments } = require("hardhat");
const { XUSD, SOV } = require("./tokens");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
let sovrynSwapNetworkAdr;
const { parseEther } = ethers.utils;
const sSNAbi = require('./ssnabi.json');

var orderG, fromToken, toToken;

describe("Settlement", async () => {
    beforeEach(async () => {
        //await deployments.fixture();

        const {chainId} = await helpers.setup();
        fromToken = XUSD[chainId];
        toToken = SOV[chainId];
        
        if(network.name === "mainnet") sovrynSwapNetworkAdr= "0x98ace08d2b759a265ae326f010496bcd63c15afc";
        else if(network.name=="rsktestnet") sovrynSwapNetworkAdr = "0x61172b53423e205a399640e5283e51fe60ec2256";
        else {
            sovrynSwapNetworkAdr = await getContract("TestSovrynSwap");
            sovrynSwapNetworkAdr=sovrynSwapNetworkAdr.address;

            const accounts = await ethers.getSigners();
            await Promise.all(accounts.map(async (acc) => {
                console.log(acc.address, Number(await acc.getBalance()));
                // console.log(acc)
            }));

            const priceFeeds = await getContract("PriceFeedsLocal", accounts[0]);
            await priceFeeds.setRates(fromToken.address, toToken.address, parseEther("1"));
        }
    });

    it("Should createOrder()", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        const { order, tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('0.01'),
            parseEther('0.0001'),
            getDeadline(24)
        );

        orderG=order;
        
        const hash = await order.hash();
        console.log("order created");
        console.log(hash)
        console.log('signer', users[0].address);
    });

    it("Should fillOrder()", async () => {
        const {
            users,
            fillOrder,
            filledAmountIn,
        } = await helpers.setup();
        const fromERC20 = await ethers.getContractAt("IERC20", fromToken.address); 
        console.log("token balance user ", users[0].address);
        console.log(Number(await fromERC20.balanceOf(users[0].address)));
        
        const settlement = await helpers.getContract("Settlement");
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path= await sovrynSwapNetwork.conversionPath(fromToken.address, toToken.address);

        console.log()
        console.log('fromERC20 address', fromERC20.address)
        console.log("allowance of settlement %s -> %s", users[0].address, settlement.address)
        console.log(Number(await fromERC20.allowance(users[0].address, settlement.address)));
        
        const tx2 = await fillOrder(users[0], orderG, orderG.amountIn, path);
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, orderG.amountIn);
        await helpers.expectToEqual(filled.amountIn, filledAmountIn(users[0], orderG));
    });

    /*
    it("Should fillOrder()", async () => {
        const {
            chainId,
            users,
            getTrade,
            swap,
            addLiquidity,
            getDeadline,
            createOrder,
            fillOrder,
            filledAmountIn,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        // const fromToken = SUSHI[chainId];
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        // setup SUSHI-WETH pool for fee swapping
        await addLiquidity(
            users[0],
            WETH[chainId],
            SUSHI[chainId],
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        // Set ratio of WETH:DAI to 1:100
        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );
        // Create an order of amountOutMin to be 1% higher than the current price of 0.01 WETH
        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin,
            getDeadline(24)
        );

        // Calling fillOrder() reverts because the price is higher than the order
        await helpers.expectToBeReverted("insufficient-amount-out", fillOrder(users[1], order, trade));

        // Swap 10 DAI with WETH manually to increase the price of DAI
        await swap(users[0], await getTrade(toToken, fromToken, ethers.constants.WeiPerEther.mul(10)));

        const fromERC20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address);
        await helpers.expectToEqual(ethers.constants.Zero, fromERC20.balanceOf(users[1].address));

        // Calling fillOrder() now works because DAI price increased more than 1%
        const amountIn = ethers.constants.WeiPerEther.div(100);
        const tx2 = await fillOrder(users[1], order, await getTrade(fromToken, toToken, amountIn));
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, order.hash());
        await helpers.expectToEqual(filled.amountIn, amountIn);
        await helpers.expectToEqual(amountIn, filledAmountIn(users[1], order));
    });

    it("Should revert fillOrder() if called by a contract", async () => {
        const { users, getDeadline, createOrder, addLiquidity, getTrade } = await helpers.setup();
        const caller = await helpers.getContract("SettlementCaller");

        await helpers.expectToBeReverted(
            "called-by-contract",
            caller.fillOrder([
                await orderG.toArgs(),
                trade.inputAmount.raw.toString(),
                trade.route.path.map(token => token.address),
            ])
        );
    });

    it("Should revert fillOrder() if already filled", async () => {
        const { chainId, users, getDeadline, createOrder, addLiquidity, fillOrder, getTrade } = await helpers.setup();

        const { order } = await createOrder(users[0], fromToken, toToken, amountIn, amountOutMin, getDeadline(24));
        await fillOrder(users[1], orderG, trade);
        await helpers.expectToBeReverted("already-filled", fillOrder(users[1], order, trade));
    });

    it("Should revert fillOrder() if called with insufficient allowance", async () => {
        const { chainId, users, getDeadline, addLiquidity, fillOrder, getTrade } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            users[0].address,
            getDeadline(24)
        );

        await helpers.expectToBeReverted("TransferHelper: TRANSFER_FROM_FAILED", fillOrder(users[1], order, trade));
    });

    it("Should revert fillOrder() if called with a invalid signature", async () => {
        const { chainId, users, getDeadline, addLiquidity, fillOrder, getTrade } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            users[0].address,
            getDeadline(24)
        );

        const settlement = await helpers.getContract("Settlement", users[1]);
        const fromERC20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address, users[1]);
        await fromERC20.approve(settlement.address, amountIn);

        await helpers.expectToBeReverted(
            "invalid-signature",
            fillOrder(users[2], order, trade, { maker: users[1].address })
        );
    });

    it("Should cancelOrder()", async () => {
        const {
            chainId,
            users,
            addLiquidity,
            getDeadline,
            createOrder,
            cancelOrder,
            fillOrder,
            getTrade,
        } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(101),
            getDeadline(24)
        );
        await cancelOrder(users[0], order);
        const settlement = await helpers.getContract("Settlement");
        const filter = settlement.filters.OrderCanceled(await order.hash());
        const events = await settlement.queryFilter(filter);
        helpers.chai.expect(events.length).to.be.equal(1);

        // Filling a canceled order does nothing
        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );
        await helpers.expectToBeReverted(
            "order-canceled",
            fillOrder(users[1], order, await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100)))
        );
    });*/
});
