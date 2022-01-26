const { ethers, deployments } = require("hardhat");
const { XUSD, SOV, WRBTC } = require("./tokens");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
let sovrynSwapNetworkAdr;
const { parseEther, formatUnits, formatEther } = ethers.utils;
const sSNAbi = require('./ssnabi.json');
const Order = require("./helpers/Order");

var orderG, fromToken, toToken;
let settlement;

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
            sovrynSwapNetworkAdr = sovrynSwapNetworkAdr.address;

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
            const { abi: settlementABI } = await deployments.get("SettlementLogic");
            const { address: settlementAddress } = await deployments.get("SettlementProxy");
            const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
            await settlement.setMinFee(parseEther('0'));
        }
    });

    function getActualFillAmount(amount) {
        return ethers.BigNumber.from(String(amount)).mul(998).div(1000); //-0.2% relayer fee
    }

    it("Should createOrder()", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('1'),
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
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[1]);
        const path= await sovrynSwapNetwork.conversionPath(fromToken.address, toToken.address);

        const tx2 = await fillOrder(users[1], orderG, orderG.amountIn, orderG.amountOutMin, path);
        const receipt2 = await tx2.wait();
        // console.log(receipt2);
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(orderG.amountIn));
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(await filledAmountIn(users[1], orderG)));
    });

    it("Should deposit()", async() => {
        const { users } = await helpers.setup();
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
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

    it("Should deposit via normal send", async() => {
        const { users } = await helpers.setup();
        const signer = users[0];
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const depositTo = signer.address;
        const depositAmount = ethers.utils.parseEther('0.05');
        const balance0 = await settlement.balanceOf(depositTo);
        const tx = await signer.sendTransaction({
            to: settlement.address,
            value: depositAmount
        });
        const receipt = await tx.wait();
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
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        
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
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const { abi: orderBookABI } = await deployments.get("OrderBookSwapLogic");
        const { address: orderBoookAddress } = await deployments.get("OrderBookSwapProxy");
        const orderBook = await ethers.getContractAt(orderBookABI, orderBoookAddress);
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
        const tx = await orderBook.createOrder(await order.toArgs({ contract: orderBook.address }));
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
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path = await sovrynSwapNetwork.conversionPath(fromToken, toToken);
        const tx2 = await fillOrder(users[0], orderG, orderG.amountIn, orderG.amountOutMin, path);
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        console.log("Order filled: %sWRBTC -> %sXUSD", formatEther(filled.amountIn.toString()), formatUnits(filled.amountOut.toString(), 18));
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(orderG.amountIn));
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(await filledAmountIn(users[0], orderG)));
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
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path = await sovrynSwapNetwork.conversionPath(fromToken, toToken);
        const tx2 = await fillOrder(users[0], orderG, orderG.amountIn, orderG.amountOutMin, path);
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        console.log("Order filled: %sXUSD -> %sRBTC", formatUnits(filled.amountIn.toString(), 18), formatEther(filled.amountOut.toString()));
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(orderG.amountIn));
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(await filledAmountIn(users[0], orderG)));
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
    
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const tx1 = await settlement.cancelOrder(await order.toArgs());
        const receipt = await tx1.wait();
    });

    it("Should failed fillOrder because minFee", async () => {
        const { users, getDeadline, createOrder, fillOrder } = await helpers.setup();
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        await settlement.setMinFee(parseEther('0.001'));
        const { order , tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('0.002'),
            parseEther('0.0001'),
            getDeadline(24)
        );
        await tx.wait();
        
        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path = await sovrynSwapNetwork.conversionPath(fromToken.address, toToken.address);

        await helpers.expectToBeReverted('Order amount is too low to pay the relayer fee', 
            fillOrder(users[0], order, order.amountIn, order.amountOutMin, path)
        );
        await settlement.setMinFee(parseEther('0'));
    });

    it("Should withdraw RBTC when cancel order", async () => {
        const { users, chainId, getDeadline, createOrder } = await helpers.setup();
        const signer = users[0];
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);

        const fromToken = WRBTC[chainId];
        const toToken = XUSD[chainId];
        const amountIn = parseEther('0.5');
        const amountOutMin = parseEther('0.5');

        await settlement.deposit(signer.address, {
            value: amountIn
        });

        const { order } = await createOrder(
            signer,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            getDeadline(24)
        );

        const tx = await settlement.cancelOrder(await order.toArgs());
        const receipt = await tx.wait();
        const event = receipt.events.find(e => e.event == 'Withdrawal');
        const withdrawn = settlement.interface.decodeEventLog("Withdrawal", event.data, event.topics);
        await helpers.expectToEqual(withdrawn.receiver, signer.address);
        await helpers.expectToEqual(withdrawn.amount, order.amountIn);
    });
    
    it("Should fill order partial", async () => {
        const { users, getDeadline, createOrder, fillOrder, chainId } = await helpers.setup();
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        await settlement.setMinFee(parseEther('0.001'));
        
        const fromToken = XUSD[chainId];
        const toToken = SOV[chainId];
        const { order, tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('100'),
            parseEther('10'),
            getDeadline(24)
        );
        await tx.wait();

        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path = await sovrynSwapNetwork.conversionPath(fromToken.address, toToken.address);

        const fillAmount1 = parseEther('45'), fillAmount2 = parseEther('55');
        const fillAmountMinOut1 = order.amountOutMin.mul(fillAmount1).div(order.amountIn);
        const fillAmountMinOut2 = order.amountOutMin.mul(fillAmount2).div(order.amountIn);
        const tx1 = await fillOrder(users[0], order, fillAmount1, fillAmountMinOut1, path);
        const receipt1 = await tx1.wait();
        const event = receipt1.logs[receipt1.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, order.hash());
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(fillAmount1));
        
        const tx2 = await fillOrder(users[0], order, fillAmount2, fillAmountMinOut2, path);
        const receipt2 = await tx2.wait();
        const event2 = receipt2.logs[receipt2.logs.length - 1];
        const filled2 = settlement.interface.decodeEventLog("OrderFilled", event2.data, event2.topics);
        await helpers.expectToEqual(filled2.hash, order.hash());
        await helpers.expectToEqual(filled2.amountIn, getActualFillAmount(fillAmount2));
    });
});
