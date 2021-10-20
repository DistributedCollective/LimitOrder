const { formatEther } = require("@ethersproject/units");
const { Wallet } = require("ethers");
const { ethers, deployments } = require("hardhat");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
const { parseEther, parseUnits } = ethers.utils;
const MarginOrder = require('./helpers/MarginOrder');
const { getAccountsPrivateKeys } = require("./Utils/hardhat_utils");
const {
	getSUSD,
	getRBTC,
	getWRBTC,
	getBZRX,
	getSOV,
    getLoanTokenLogic1,
	getLoanToken,
	getLoanTokenWRBTC,
	loan_pool_setup,
	set_demand_curve,
	getPriceFeeds,
	getSovryn,
} = require("./Utils/initializer.js");

const ILoanTokenModules = artifacts.require("ILoanTokenModules");
const TestToken = artifacts.require("TestToken");
const TestWrbtc = artifacts.require("TestWrbtc");


describe("Margin Order", async () => {
    let accounts, privKeys;
    let owner;
	let sovryn, SUSD, WRBTC, RBTC, BZRX,  SOV,
        loanTokenSUSD, 
        loanTokenWRBTC,
        priceFeeds;
    let orderG;
    let isLocalNetwork = true;


    before(async () => {
        // await deployments.fixture();
        
        accounts = await ethers.getSigners();
        privKeys = getAccountsPrivateKeys();
        owner = accounts[0];
        console.log(accounts.map(acc => acc.address))

        if(network.name === "mainnet") {
            //setup loan for mainnet
            isLocalNetwork = false;
        }
        else if(network.name=="rsktestnet") {
            //setup loan for testnet
            isLocalNetwork = false;
            loanTokenSUSD = await ILoanTokenModules.at("0x74e00A8CeDdC752074aad367785bFae7034ed89f");
            loanTokenWRBTC = await ILoanTokenModules.at("0xe67fe227e0504e8e96a34c3594795756dc26e14b");
            const susdAdr = await loanTokenSUSD.loanTokenAddress();
            const wrbtcAdr = await loanTokenWRBTC.loanTokenAddress();
            SUSD = await TestToken.at(susdAdr);
            WRBTC = await TestWrbtc.at(wrbtcAdr);
            // RBTC = await TestToken.at(ethers.constants.AddressZero);

            console.log("asset susd", await loanTokenSUSD.loanTokenAddress());
            console.log("asset wrbtc", await loanTokenWRBTC.loanTokenAddress());
        } else {
            SUSD = await getSUSD();
            RBTC = await getRBTC();
            WRBTC = await getWRBTC();
            BZRX = await getBZRX();
            priceFeeds = await getPriceFeeds(WRBTC, SUSD, RBTC, sovryn, BZRX);

            sovryn = await getSovryn(WRBTC, SUSD, RBTC, priceFeeds);

            loanTokenSUSD = await getLoanToken(owner.address, sovryn, WRBTC, SUSD, true);
            loanTokenWRBTC = await getLoanTokenWRBTC(owner.address, sovryn, WRBTC, SUSD, true);
            await loan_pool_setup(sovryn, owner.address, RBTC, WRBTC, SUSD, loanTokenSUSD, loanTokenWRBTC);
            SOV = await getSOV(sovryn, priceFeeds, SUSD, [owner.address]);

            await WRBTC.deposit({value: parseEther("1000")});
            await WRBTC.transfer(loanTokenWRBTC.address, parseEther("1000"));
            await SUSD.transfer(loanTokenSUSD.address, parseEther("100000"));
        }
        const adr = accounts[0].address;
        console.log("bal wrbtc", formatEther((await WRBTC.balanceOf(adr)).toString()) );
        console.log("bal usd", formatEther((await SUSD.balanceOf(adr)).toString()) );
        // console.log("bal rbtc", formatEther((await RBTC.balanceOf(adr)).toString()) );
        console.log("bal rbtc1", formatEther((await accounts[0].getBalance()).toString()) );
    });

    const getAccount =  (index) => {
        const acc = accounts[index];
        acc.privateKey = privKeys[index] && privKeys[index].privateKey || privKeys[index];
        return acc;
    }

    const createMarginOrder = async (
        signer,
        leverageAmount,
        loanToken,
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
            const loanTokenAssetAddress = await loanToken.loanTokenAddress();
            const loanTokenAsset = await ethers.getContractAt("TestToken", loanTokenAssetAddress, signer);
            await loanTokenAsset.approve(settlement.address, loanTokenSent);
        }
        if (Number(collateralTokenSent) > 0) {
            const collateralToken = await ethers.getContractAt("TestToken", collateralTokenAddress, signer);
            await collateralToken.approve(settlement.address, collateralTokenSent);
        }

        const order = new MarginOrder(
            ethers.constants.HashZero,
            leverageAmount,
            loanToken.address,
            loanTokenSent,
            collateralTokenSent,
            collateralTokenAddress,
            signer,
            minReturn,
            loanDataBytes,
            deadline,
            createdTimestamp,
        );

        const orderBook = await getContract("OrderBookMargin", signer);
        const args = await order.toArgs({ privateKey: signer.privateKey });
        const tx = await orderBook.createOrder(args);
        return { order, tx };
    };

    const fillMarginOrder = async (signer, order) => {
        const settlement = await getContract("Settlement", signer);
        const orderArgs = await order.toArgs();

        return await settlement.fillMarginOrder([orderArgs]);
    };

    const createFillMarginOrder = async ({
        trader,
        relayer,
        loanToken,
        loanTokenSent,
        collateralToken,
        collateralTokenSent,
        leverageAmount,
        minReturn
    }) => {
        const { getDeadline } = await helpers.setup();

        if (isLocalNetwork) {
            await set_demand_curve(loanToken);
            
            if (Number(loanTokenSent) > 0) {
                const loanAssetAdr = await loanToken.loanTokenAddress();
                const loanAsset = await ethers.getContractAt("TestToken", loanAssetAdr, owner);
                if (loanToken.address == loanTokenWRBTC.address) {
                    await WRBTC.deposit({value: loanTokenSent});
                }
                await loanAsset.transfer(trader.address, loanTokenSent);
            }
    
            await collateralToken.transfer(trader.address, collateralTokenSent);
        }
        

        const { order, tx } = await createMarginOrder(
            trader,
            leverageAmount, // leverage amount
            loanToken, // loan token (SUSD)
            loanTokenSent, // loan token sent
            collateralTokenSent, // collateral token sent
            collateralToken.address, // collateral token
            minReturn, // min return
            ethers.constants.HashZero, // loan data bytes
            getDeadline(24), // deadline
            ethers.BigNumber.from(Math.floor(Date.now() / 1000)), // created at timestamp
        );
        const hash = await order.hash();
        console.log("order created", hash);

        const filledTx = await fillMarginOrder(relayer, order);

        return {
            order,
            orderTx: tx,
            filledTx
        }
    }

    // it("Should createMarginOrder SUSD", async () => {
    //     const { getDeadline } = await helpers.setup();
    //     const settlement = await helpers.getContract("Settlement");
    //     const orderBook = await helpers.getContract("OrderBookMargin");
    //     const trader = getAccount(1);
    //     const collateralToken = RBTC.address;
    //     const collateralAmount = parseEther("1");

    //     await set_demand_curve(loanTokenSUSD);
    //     await SUSD.transfer(loanTokenSUSD.address, parseEther("1000000"));
    //     await SUSD.transfer(trader.address, parseEther("1000"));
    //     await RBTC.transfer(trader.address, collateralAmount);

    //     const { order, tx } = await createMarginOrder(
    //         trader,
    //         parseEther("5"), // leverage amount
    //         loanTokenSUSD, // loan token (SUSD)
    //         parseEther("0"), // loan token sent
    //         collateralAmount, // collateral token sent
    //         collateralToken, // collateral token
    //         parseEther("5"), // min return
    //         ethers.constants.HashZero, // loan data bytes
    //         getDeadline(24), // deadline
    //         ethers.BigNumber.from(Math.floor(Date.now() / 1000)), // created at timestamp
    //     );
    //     const hash = await order.hash();
    //     console.log("order created", hash);

    //     const receipt = await tx.wait();
    //     const event = receipt.logs[receipt.logs.length - 1];
    //     const created = orderBook.interface.decodeEventLog("OrderCreated", event.data, event.topics);
    //     await helpers.expectToEqual(created.hash, order.hash());

    //     orderG = order;
    // });

    // it("Should fillMarginOrder SUSD", async () => {
    //     const settlement = await helpers.getContract("Settlement");
    //     const relayer = getAccount(2);
    //     const tx = await fillMarginOrder(relayer, orderG);
    //     const receipt = await tx.wait();
    //     const event = receipt.logs[receipt.logs.length - 1];
    //     const filled = settlement.interface.decodeEventLog("MarginOrderFilled", event.data, event.topics);
    //     await helpers.expectToEqual(filled.hash, orderG.hash());

    //     console.log("Margin principal", formatEther(filled.principal));
    //     console.log("Margin new collateral", formatEther(filled.collateral));
    // });

    // it("Should createMarginOrder - fillMarginOrder WRBTC", async () => {
    //     const settlement = await helpers.getContract("Settlement");
    //     const orderBook = await helpers.getContract("OrderBookMargin");
    //     const trader = getAccount(1);
    //     const relayer = getAccount(2);
    //     const {order, orderTx, filledTx } = await createFillMarginOrder({
    //         trader,
    //         relayer,
    //         loanToken: loanTokenWRBTC,
    //         loanTokenSent: parseEther("0"),
    //         collateralToken: SUSD,
    //         collateralTokenSent: parseEther("1000"),
    //         leverageAmount: parseEther("5"),
    //         minReturn: parseEther("5000"),
    //     });

    //     const receipt = await orderTx.wait();
    //     const event = receipt.logs[receipt.logs.length - 1];
    //     const created = orderBook.interface.decodeEventLog("OrderCreated", event.data, event.topics);
    //     await helpers.expectToEqual(created.hash, order.hash());

    //     const receipt1 = await filledTx.wait();
    //     const event1 = receipt1.logs[receipt1.logs.length - 1];
    //     const filled = settlement.interface.decodeEventLog("MarginOrderFilled", event1.data, event1.topics);
    //     await helpers.expectToEqual(filled.hash, order.hash());

    //     console.log("Margin principal", formatEther(filled.principal));
    //     console.log("Margin new collateral", formatEther(filled.collateral));
    // });

    // it("Should cancel marginOrder", async () => {
    //     const { users, getDeadline } = await helpers.setup();
    //     const orderBook = await helpers.getContract("OrderBookMargin");
    //     const collateralToken = RBTC.address;

    //     const { order, tx } = await createMarginOrder(
    //         users[0],
    //         parseEther("5"), //x5
    //         loanTokenSUSD,
    //         parseEther("0"),
    //         parseEther("100"),
    //         collateralToken,
    //         parseEther("500"),
    //         ethers.constants.HashZero,
    //         getDeadline(24),
    //         ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
    //     );
    //     // console.log(tx);
    //     const hash = await order.hash();
    //     console.log("order created", hash);

    //     const settlement = await helpers.getContract("Settlement");
    //     const tx1 = await settlement.cancelOrder(hash);
    //     const receipt = await tx1.wait();
    //     const event = receipt.logs[receipt.logs.length - 1];
    //     const canceled = settlement.interface.decodeEventLog("MarginOrderCanceled", event.data, event.topics);
    //     await helpers.expectToEqual(canceled.hash, hash);
    // });


    // it("Should relayer receive correct fee on loan SUSD", async () => {
    //     const trader = getAccount(1);
    //     const relayer = getAccount(2);
    //     const balances = {
    //         susd: {
    //             before: formatEther((await SUSD.balanceOf(relayer.address)).toString())
    //         },
    //         rbtc: {
    //             before: formatEther((await RBTC.balanceOf(relayer.address)).toString())
    //         },
    //         wrbtc: {
    //             before: formatEther((await WRBTC.balanceOf(relayer.address)).toString())
    //         }
    //     };
    //     const {order, orderTx, filledTx } = await createFillMarginOrder({
    //         trader,
    //         relayer,
    //         loanToken: loanTokenWRBTC,
    //         loanTokenSent: parseEther("0.5"),
    //         collateralToken: SUSD,
    //         collateralTokenSent: parseEther("1000"),
    //         leverageAmount: parseEther("5"),
    //         minReturn: parseEther("5000"),
    //     });
    //     await orderTx.wait();
    //     await filledTx.wait();
        
    //     balances.susd.after = formatEther((await SUSD.balanceOf(relayer.address)).toString());
    //     balances.rbtc.after = formatEther((await RBTC.balanceOf(relayer.address)).toString());
    //     balances.wrbtc.after = formatEther((await WRBTC.balanceOf(relayer.address)).toString());
    //     console.log(balances);
    // });

    // it("Should relayer receive correct fee on loan WRBTC", async () => {
    //     const trader = getAccount(1);
    //     const relayer = getAccount(2);
    //     const balances = {
    //         susd: {
    //             before: formatEther((await SUSD.balanceOf(relayer.address)).toString())
    //         },
    //         rbtc: {
    //             before: formatEther((await RBTC.balanceOf(relayer.address)).toString())
    //         },
    //         wrbtc: {
    //             before: formatEther((await WRBTC.balanceOf(relayer.address)).toString())
    //         }
    //     };
    //     const {order, orderTx, filledTx } = await createFillMarginOrder({
    //         trader,
    //         relayer,
    //         loanToken: loanTokenSUSD,
    //         loanTokenSent: parseEther("1200"),
    //         collateralToken: RBTC,
    //         collateralTokenSent: parseEther("1"),
    //         leverageAmount: parseEther("5"),
    //         minReturn: parseEther("5"),
    //     });
    //     await orderTx.wait();
    //     await filledTx.wait();
        
    //     balances.susd.after = formatEther((await SUSD.balanceOf(relayer.address)).toString());
    //     balances.rbtc.after = formatEther((await RBTC.balanceOf(relayer.address)).toString());
    //     balances.wrbtc.after = formatEther((await WRBTC.balanceOf(relayer.address)).toString());
    //     console.log(balances);
    // });

    it("Should create a long position with 2x leverage", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const leverageAmount = parseEther("2");
        const loanTokenSent = parseEther("20"); //SUSD
        const collateralToken = WRBTC;
        const collateralTokenSent = parseEther("0");
        const { collateral } = await loanTokenSUSD.getEstimatedMarginDetails(
            leverageAmount,
            loanTokenSent,
            collateralTokenSent,
            collateralToken.address,
        );
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken: loanTokenSUSD,
            loanTokenSent,
            collateralToken,
            collateralTokenSent,
            leverageAmount,
            minReturn: ethers.BigNumber.from(String(collateral))
        });
        await orderTx.wait();
        const receipt = await filledTx.wait();
        console.log(JSON.stringify(receipt));
    });

    // it("Should create a long position with 5x leverage", async () => {
    //     const trader = getAccount(1);
    //     const relayer = getAccount(2);
    //     const amount = parseEther("2000"); //Collaterral SUSD
    //     const {order, orderTx, filledTx } = await createFillMarginOrder({
    //         trader,
    //         relayer,
    //         loanToken: loanTokenSUSD,
    //         loanTokenSent: amount,
    //         collateralToken: RBTC,
    //         collateralTokenSent: parseEther("0"),
    //         leverageAmount: parseEther("5"),
    //         minReturn: parseEther("1"),
    //     });
    //     await orderTx.wait();
    //     const receipt = await filledTx.wait();
    //     // console.log(receipt);
    // });

    // it("Should create a short position with 2x leverage", async () => {
    //     const trader = getAccount(1);
    //     const relayer = getAccount(2);
    //     const amount = parseEther("2000"); //Collaterral SUSD
    //     const {order, orderTx, filledTx } = await createFillMarginOrder({
    //         trader,
    //         relayer,
    //         loanToken: loanTokenWRBTC,
    //         loanTokenSent: parseEther("0"),
    //         collateralToken: SUSD,
    //         collateralTokenSent: amount,
    //         leverageAmount: parseEther("2"),
    //         minReturn: parseEther("4000"),
    //     });
    //     await orderTx.wait();
    //     const receipt = await filledTx.wait();
    //     // console.log(receipt);
    // });

    // it("just test", async () => {
    //     console.log("tested");
    // });

    // it("Should create a short position with 5x leverage", async () => {
    //     const trader = getAccount(1);
    //     const relayer = getAccount(2);
    //     const amount = parseEther("2000"); //Collaterral SUSD
    //     const {order, orderTx, filledTx } = await createFillMarginOrder({
    //         trader,
    //         relayer,
    //         loanToken: loanTokenWRBTC,
    //         loanTokenSent: parseEther("0"),
    //         collateralToken: SUSD,
    //         collateralTokenSent: amount,
    //         leverageAmount: parseEther("5"),
    //         minReturn: parseEther("10000"),
    //     });
    //     await orderTx.wait();
    //     const receipt = await filledTx.wait();
    //     console.log(JSON.stringify(receipt, null, 2));
    // });

});