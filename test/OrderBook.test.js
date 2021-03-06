const { ethers, deployments } = require("hardhat");
const { XUSD, SOV } = require("./tokens");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
const { parseEther } = ethers.utils;

var sovrynSwapNetworkAdr, orderG, fromToken, toToken;

describe("OrderBook", async () => {
    beforeEach(async () => {
        // await deployments.fixture();

        const {chainId} = await helpers.setup();
        fromToken = XUSD[chainId];
        toToken = SOV[chainId];
        
        if(network.name === "mainnet") sovrynSwapNetworkAdr= "0x98ace08d2b759a265ae326f010496bcd63c15afc";
        else if(network.name=="rsktestnet") sovrynSwapNetworkAdr = "0x61172b53423e205a399640e5283e51fe60ec2256";
        else {
            sovrynSwapNetworkAdr = await getContract("TestSovrynSwap");
            sovrynSwapNetworkAdr=sovrynSwapNetworkAdr.address;

            const accounts = await ethers.getSigners();

            const priceFeeds = await getContract("PriceFeedsLocal", accounts[0]);
            await priceFeeds.setRates(fromToken.address, toToken.address, parseEther("1"));
        }
    });

    it("Should createOrder()", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();
        const { abi } = await deployments.get("OrderBookSwapLogic");
        const { address } = await deployments.get("OrderBookSwapProxy");
        const orderBook = await ethers.getContractAt(abi, address);

        const { order, limitPrice, tx } = await createOrder(
            users[0],
            fromToken,
            toToken,
            parseEther('100'),
            parseEther('500'),
            getDeadline(24)
        );

        orderG=order;

        
        const hash = await order.hash();
        const receipt = await tx.wait();
        const event = receipt.logs[receipt.logs.length - 1];
        const created = orderBook.interface.decodeEventLog("OrderCreated", event.data, event.topics);

        helpers.expectToEqual(created.limitPrice, limitPrice)
        await helpers.expectToEqual(1, orderBook.numberOfAllHashes());
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfMaker(users[0].address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfFromToken(fromToken.address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfToToken(toToken.address));

        await helpers.expectToDeepEqual([hash], orderBook.allHashes(0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0].address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfFromToken(fromToken.address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address, 0, 1));
    });

    it("Should list all orders of trader", async () => {
        const { users } = await helpers.setup();

        const { abi } = await deployments.get("OrderBookSwapLogic");
        const { address } = await deployments.get("OrderBookSwapProxy");
        const orderBook = await ethers.getContractAt(abi, address);

        const orders = await orderBook.getOrders(users[0].address, 0, 10);

        await helpers.expectToEqual(orders.length, 10);
        await helpers.expectToEqual(orders.filter(o => o.maker != ethers.constants.AddressZero).length, 1);
    });
});
