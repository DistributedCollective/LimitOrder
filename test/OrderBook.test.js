const { ethers, deployments } = require("hardhat");
const { XUSD, SOV } = require("./tokens");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
const { parseEther } = ethers.utils;

var sovrynSwapNetworkAdr, orderG, fromToken, toToken;

describe("OrderBook", async () => {
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
        const orderBook = await helpers.getContract("OrderBook");

        const { order } = await createOrder(
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
        console.log(hash);

        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orderOfHash(hash));

        await helpers.expectToEqual(1, orderBook.numberOfAllHashes());
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfMaker(users[0].address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfFromToken(fromToken.address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfToToken(toToken.address));

        await helpers.expectToDeepEqual([hash], orderBook.allHashes(0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0].address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfFromToken(fromToken.address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address, 0, 1));
    });

    it("Should revert createOrder() if maker isn't valid", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "invalid-maker",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    maker: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if fromToken isn't valid", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

         await helpers.expectToBeReverted(
            "invalid-from-token",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    fromToken: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if toToken isn't valid", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "invalid-to-token",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    toToken: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if fromToken == toToken valid", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "duplicate-tokens",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    toToken: fromToken.address,
                }
            )
        );
    });

    it("Should revert createOrder() if amountIn isn't valid", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "invalid-amount-in",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.Zero,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24)
            )
        );
    });

    it("Should revert createOrder() if amountOutMin isn't valid", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "invalid-amount-out-min",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.Zero,
                getDeadline(24)
            )
        );
    });

    it("Should revert createOrder() if recipient isn't valid", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "invalid-recipient",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    recipient: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if deadline isn't valid", async () => {
        const { users, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "invalid-deadline",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                0
            )
        );
    });

    it("Should revert createOrder() if not signed by maker", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        await helpers.expectToBeReverted(
            "invalid-signature",
            createOrder(
                users[1],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24)
            )
        );
    });

    it("Should revert createOrder() if duplicated", async () => {
        const { users, getDeadline, createOrder } = await helpers.setup();

        const args = [
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100),
            getDeadline(24),
        ];
        await createOrder(...args);
        await helpers.expectToBeReverted("order-exists", createOrder(...args));
    });
});
