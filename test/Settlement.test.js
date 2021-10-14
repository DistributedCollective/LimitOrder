const { ethers, deployments } = require("hardhat");
const { XUSD, SOV, WRBTC } = require("./tokens");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
let sovrynSwapNetworkAdr;
const { parseEther, formatUnits, formatEther } = ethers.utils;
const sSNAbi = require('./ssnabi.json');
const Order = require("./helpers/Order");

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
            // await Promise.all(accounts.map(async (acc) => {
            //     console.log(acc.address, Number(await acc.getBalance()));
            //     // console.log(acc)
            // }));
            await accounts[0].sendTransaction({
                to: WRBTC[chainId].address,
                value: parseEther("10")
            });

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
        console.log("order created hash", hash);
    });

    it("Should fillOrder()", async () => {
        const {
            users,
            fillOrder,
            filledAmountIn,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path= await sovrynSwapNetwork.conversionPath(fromToken.address, toToken.address);

        const tx2 = await fillOrder(users[0], orderG, orderG.amountIn, path);
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, orderG.amountIn);
        await helpers.expectToEqual(filled.amountIn, filledAmountIn(users[0], orderG));
    });

    it("Should deposit()", async() => {
        const { users } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement", users[0]);
        const depositTo = users[0].address;
        const depositAmount = ethers.utils.parseEther('0.05');
        const balance0 = await settlement.balanceOf(depositTo);
        const tx = await settlement.deposit(depositTo, {
            value: depositAmount
        });
        const receipt = await tx.wait();
        // console.log(receipt);
        const event = receipt.logs[0];
        const deposited = settlement.interface.decodeEventLog("Deposit", event.data, event.topics);
        await helpers.expectToEqual(deposited.to, depositTo);
        await helpers.expectToEqual(deposited.amount, depositAmount);

        const balance = await settlement.balanceOf(depositTo);
        await helpers.expectToEqual(balance0.add(depositAmount), balance);
    });

    it("Should withdraw()", async() => {
        const { users } = await helpers.setup();
        const user = users[0];
        const settlement = await helpers.getContract("Settlement", user);
        
        const balance0 = await settlement.balanceOf(user.address);

        const withdrawAmount = ethers.utils.parseEther('0.02');
        const tx = await settlement.withdraw(withdrawAmount);
        const receipt = await tx.wait();
        // console.log(receipt);
        const event = receipt.logs[0];
        const withdrawal = settlement.interface.decodeEventLog("Withdrawal", event.data, event.topics);
        const balance1 = await settlement.balanceOf(user.address);;
        await helpers.expectToEqual(withdrawal.receiver, user.address);
        await helpers.expectToEqual(withdrawal.amount, withdrawAmount);
        await helpers.expectToEqual(balance0.sub(withdrawAmount), balance1);
    });

    it("Should createOrder() RBTC-XUSD", async () => {
        const { users, chainId, getDeadline } = await helpers.setup();
        const signer = users[0];
        const settlement = await getContract("Settlement", signer);
        const orderBook = await getContract("OrderBook", signer);
        const fromToken = WRBTC[chainId];
        const toToken = XUSD[chainId];
        const amountIn = parseEther('0.01');
        const amountOutMin = parseEther('0.0001');
        
        await settlement.deposit(signer.address, {
            value: amountIn
        });

        const order = new Order(
            signer,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            signer.address,
            getDeadline(24),
            ethers.BigNumber.from(Math.floor(Date.now() / 1000))
        );
        const tx = await orderBook.createOrder(await order.toArgs());
        orderG = order;
        const hash = await order.hash();
        console.log("order wrbtc-xusd hash", hash);
    });

    it("Should fillOrder() RBTC-XUSD", async () => {
        const {
            users,
            fillOrder,
            filledAmountIn,
            chainId
        } = await helpers.setup();
        const fromToken = WRBTC[chainId].address;
        const toToken = XUSD[chainId].address;
        const settlement = await helpers.getContract("Settlement");
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path= await sovrynSwapNetwork.conversionPath(fromToken, toToken);

        const tx2 = await fillOrder(users[0], orderG, orderG.amountIn, path);
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        console.log("Order filled: %sWRBTC -> %sXUSD", formatEther(filled.amountIn.toString()), formatUnits(filled.amountOut.toString(), 18));
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, orderG.amountIn);
        await helpers.expectToEqual(filled.amountIn, filledAmountIn(users[0], orderG));
    });

    it("Should createOrder() XUSD-RBTC", async () => {
        const { users, chainId, createOrder, getDeadline } = await helpers.setup();
        const fromToken = XUSD[chainId];
        const toToken = WRBTC[chainId];

        const { order, tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('0.1'),
            parseEther('0.000001'),
            getDeadline(24)
        );

        orderG=order;
        
        const hash = await order.hash();
        console.log("order XUSD-RBTC created hash", hash);
    });

    it("Should fillOrder() XUSD-RBTC", async () => {
        const {
            users,
            fillOrder,
            filledAmountIn,
            chainId
        } = await helpers.setup();
        const fromToken = XUSD[chainId].address;
        const toToken = WRBTC[chainId].address;
        const settlement = await helpers.getContract("Settlement");
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path = await sovrynSwapNetwork.conversionPath(fromToken, toToken);


        const tx2 = await fillOrder(users[0], orderG, orderG.amountIn, path);
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        console.log("Order filled: %sXUSD -> %sRBTC", formatUnits(filled.amountIn.toString(), 18), formatEther(filled.amountOut.toString()));
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, orderG.amountIn);
        await helpers.expectToEqual(filled.amountIn, filledAmountIn(users[0], orderG));
    });

    it("Should cancelOrder()", async () => {
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
        console.log("order created hash", hash);
    
        const settlement = await helpers.getContract("Settlement");
        const tx1 = await settlement.cancelOrder(hash);
        const receipt = await tx1.wait();
        console.log(receipt);
    });
});
