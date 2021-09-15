const { ethers, deployments } = require("hardhat");
const { XUSD, SOV } = require("./tokens");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
const { parseEther } = ethers.utils;
const MarginOrder = require('./helpers/MarginOrder');

var iLoanTokenAddress, collateralTokenAddress;

describe("Margin Order", async () => {
    beforeEach(async () => {
        iLoanTokenAddress = "0x74e00a8ceddc752074aad367785bfae7034ed89f"; //iSUSD
        // loanTokenAddress = "0xcb46c0ddc60d18efeb0e586c17af6ea36452dae0"; //DOC
        collateralToken = "0x74858FE37d391f81F89472e1D8BC8Ef9CF67B3b1"; //XUSD
    });

    const createMarginOrder = async (
        signer,
        leverageAmount,
        iLoanTokenAddress,
        loanTokenSent,
        collateralTokenSent,
        collateralTokenAddress,
        minReturn,
        loanDataBytes,
        deadline,
        createdTimestamp,
    ) => {
        const settlement = await getContract("Settlement", signer);
        if (Number(loanTokenSent) > 0) {
            const c = new ethers.Contract(iLoanTokenAddress);
            const loanTokenAddress = await c.loanTokenAddress();
            const loanToken = await ethers.getContractAt("TestToken", loanTokenAddress, signer);
            await loanToken.approve(settlement.address, loanTokenSent);
        }
        if (Number(collateralTokenSent) > 0) {
            const collateralToken = await ethers.getContractAt("TestToken", collateralTokenAddress, signer);
            await collateralToken.approve(settlement.address, collateralTokenSent);
        }

        const order = new MarginOrder(
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            leverageAmount,
            iLoanTokenAddress,
            loanTokenSent,
            collateralTokenSent,
            collateralTokenAddress,
            signer,
            minReturn,
            loanDataBytes,
            deadline,
            createdTimestamp,
        );

        const orderBook = await getContract("OrderBook", signer);
        const tx = await orderBook.createOrder(await order.toArgs(overrides));
        return { order, tx };
    };

    it("Should createMarginOrder", async () => {
        const { users, getDeadline } = await helpers.setup();
        const orderBook = await helpers.getContract("OrderBookMargin");

        const { order, tx } = await createMarginOrder(
            users[0],
            parseEther("5"), //x5
            iLoanTokenAddress,
            parseEther("0"),
            parseEther("100"),
            collateralTokenAddress,
            parseEther("500"),
            "0x0",
            getDeadline(24),
            ethers.BigNumber.from(Date.now() / 1000),
        );
        console.log(tx);
        const hash = await order.hash();
        console.log("order created");
        console.log(hash);

        await helpers.expectToDeepEqual(await order.toArgs(), await orderBook.orderOfHash(hash));

        console.log(await orderBook.hashesOfTrader(users[0].address, 0, 10));
        console.log(await orderBook.hashesOfCollateralToken(collateralTokenAddress, 0, 10));
    });
});