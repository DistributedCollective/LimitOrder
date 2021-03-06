const { ethers, deployments } = require("hardhat");
const { XUSD, SOV, WRBTC } = require("./tokens");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
let sovrynSwapNetworkAdr;
const { parseEther, formatUnits, formatEther } = ethers.utils;
const sSNAbi = require('./ssnabi.json');
const Order = require("./helpers/Order");
const { expectRevert } = require("@openzeppelin/test-helpers");

var orderG, fromToken, toToken;
let settlement, WrbtcAdr;

describe("Settlement", async () => {
    beforeEach(async () => {
        //await deployments.fixture();

        const {chainId} = await helpers.setup();
        fromToken = XUSD[chainId];
        toToken = SOV[chainId];
        WrbtcAdr = WRBTC[chainId].address.toLowerCase();
        
        if(network.name === "mainnet") sovrynSwapNetworkAdr= "0x98ace08d2b759a265ae326f010496bcd63c15afc";
        else if(network.name=="rsktestnet") sovrynSwapNetworkAdr = "0x61172b53423e205a399640e5283e51fe60ec2256";
        else {
            sovrynSwapNetworkAdr = await getContract("TestSovrynSwap");
            sovrynSwapNetworkAdr = sovrynSwapNetworkAdr.address;

            const accounts = await ethers.getSigners();
            await accounts[0].sendTransaction({
                to: WRBTC[chainId].address,
                value: parseEther("10")
            });

            const { abi: settlementABI } = await deployments.get("SettlementLogic");
            const { address: settlementAddress } = await deployments.get("SettlementProxy");
            const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
            await settlement.setMinSwapOrderSize(parseEther('0'));
        }
    });

    async function getActualFillAmount(order, fillAmount) {
        const orderSize = fillAmount || order.amountIn
        const { estOrderFee } = await helpers.setup();
        const orderFee = await estOrderFee(order, fillAmount);
        return orderSize.sub(orderFee);
    }

    it("Should createOrder()", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('100'),
            parseEther('80'),
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
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, orderG.hash());
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(orderG));
        console.log('filled price', formatEther(filled.filledPrice));
        // Order should not be cancelled after it is executed
        await expectRevert(settlement.cancelOrder(await orderG.toArgs()), "order executed");
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
        const { users, chainId, getDeadline, estOrderFee } = await helpers.setup();
        const signer = users[0];
        const { abi: settlementABI } = await deployments.get("SettlementLogic");
        const { address: settlementAddress } = await deployments.get("SettlementProxy");
        const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
        const { abi: orderBookABI } = await deployments.get("OrderBookSwapLogic");
        const { address: orderBoookAddress } = await deployments.get("OrderBookSwapProxy");
        const orderBook = await ethers.getContractAt(orderBookABI, orderBoookAddress);
        const fromToken = WRBTC[chainId];
        const toToken = XUSD[chainId];
        const amountIn = parseEther('0.1');
        const amountOutMin = parseEther('80');
        
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
        const estFee = await estOrderFee(order, order.amountIn);
        const limitPrice = order.amountOutMin.mul(ethers.constants.WeiPerEther).div(order.amountIn.sub(estFee));
        console.log('limit price', formatEther(limitPrice));
        const tx = await orderBook.createOrder(await order.toArgs({ contract: orderBook.address }), limitPrice);
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
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(orderG));
    });

    it("Should createOrder() XUSD-RBTC", async () => {
        const { users, chainId, createOrder, getDeadline } = await helpers.setup();
        const fromToken = XUSD[chainId];
        const toToken = WRBTC[chainId];

        const { order, tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('100'),
            parseEther('0.08'),
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
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(orderG));
    });

    it("Should cancelOrder()", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        const { order, tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('100'),
            parseEther('500'),
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

    // it("Should failed fillOrder because minFee", async () => {
    //     const { users, getDeadline, createOrder, fillOrder } = await helpers.setup();
    //     const { abi: settlementABI } = await deployments.get("SettlementLogic");
    //     const { address: settlementAddress } = await deployments.get("SettlementProxy");
    //     const settlement = await ethers.getContractAt(settlementABI, settlementAddress);
    //     await settlement.setMinSwapOrderSize(parseEther('0.001'));
    //     const { order , tx } = await createOrder(
    //         users[0],
    //         fromToken,
    //         toToken,
    //         parseEther('10'),
    //         parseEther('8'),
    //         getDeadline(24)
    //     );
    //     await tx.wait();
        
    //     const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
    //     const path = await sovrynSwapNetwork.conversionPath(fromToken.address, toToken.address);

    //     await helpers.expectToBeReverted('Order amount is too low to pay the relayer fee', 
    //         fillOrder(users[0], order, order.amountIn, order.amountOutMin, path)
    //     );
    //     await settlement.setMinSwapOrderSize(parseEther('0'));
    // });

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
        await settlement.setMinSwapOrderSize(parseEther('0.001'));
        
        const fromToken = XUSD[chainId];
        const toToken = SOV[chainId];
        const { order, tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('10000'),
            parseEther('5000'),
            getDeadline(24)
        );
        await tx.wait();

        const sovrynSwapNetwork = await ethers.getContractAt(sSNAbi, sovrynSwapNetworkAdr, users[0]);
        const path = await sovrynSwapNetwork.conversionPath(fromToken.address, toToken.address);

        const fillAmount1 = parseEther('4800'), fillAmount2 = parseEther('5100');
        const fillAmountMinOut1 = order.amountOutMin.mul(fillAmount1).div(order.amountIn);
        const fillAmountMinOut2 = order.amountOutMin.mul(fillAmount2).div(order.amountIn);
        const tx1 = await fillOrder(users[0], order, fillAmount1, fillAmountMinOut1, path);
        const receipt1 = await tx1.wait();
        const event = receipt1.logs[receipt1.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, order.hash());
        await helpers.expectToEqual(filled.amountIn, getActualFillAmount(order, fillAmount1));
        
        const tx2 = await fillOrder(users[0], order, fillAmount2, fillAmountMinOut2, path);
        const receipt2 = await tx2.wait();
        const event2 = receipt2.logs[receipt2.logs.length - 1];
        const filled2 = settlement.interface.decodeEventLog("OrderFilled", event2.data, event2.topics);
        await helpers.expectToEqual(filled2.hash, order.hash());
        await helpers.expectToEqual(filled2.amountIn, getActualFillAmount(order, fillAmount2));
    });
});
