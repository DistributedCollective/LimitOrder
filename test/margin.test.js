const { formatEther } = require("@ethersproject/units");
const { BigNumber } = require("ethers");
const { ethers, deployments } = require("hardhat");
const { replaceInFile } = require("replace-in-file");

const helpers = require("./helpers");
const { parseEther, parseUnits } = ethers.utils;
const MarginOrder = require('./helpers/MarginOrder');
const { getAccountsPrivateKeys } = require("./Utils/hardhat_utils");
const {
	getSUSD,
	getRBTC,
	getWRBTC,
	getBZRX,
	getSOV,
	getLoanToken,
	getLoanTokenWRBTC,
	loan_pool_setup,
	set_demand_curve,
	getPriceFeeds,
	getSovryn,
} = require("./Utils/initializer.js");
const TOKENS = require('../test/tokens');
const { expectRevert } = require("@openzeppelin/test-helpers");

const ILoanTokenModules = artifacts.require("ILoanTokenModules");
const IPriceFeeds = artifacts.require("contracts/interfaces/IPriceFeeds.sol:IPriceFeeds");
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
        // console.log(accounts.map((acc, i) => ({ adr: acc.address, pk: getAccount(i).privateKey })))

        if(network.name === "mainnet") {
            //setup loan for mainnet
            isLocalNetwork = false;
        }
        else if(network.name=="rsktestnet") {
            //setup loan for testnet
            isLocalNetwork = false;
            loanTokenSUSD = await ILoanTokenModules.at("0x9bd0ce087b14ef67c3d37c891139aae7d94a961a"); // iXUSD
            loanTokenWRBTC = await ILoanTokenModules.at("0xe67fe227e0504e8e96a34c3594795756dc26e14b"); // iWRBTC
            priceFeeds = await IPriceFeeds.at("0x7f38c422b99075f63C9c919ECD200DF8d2Cf5BD4");
            const susdAdr = await loanTokenSUSD.loanTokenAddress();
            const wrbtcAdr = await loanTokenWRBTC.loanTokenAddress();
            SUSD = await TestToken.at(susdAdr);
            WRBTC = await TestWrbtc.at(wrbtcAdr);

            console.log("asset susd", await loanTokenSUSD.loanTokenAddress());
            console.log("asset wrbtc", await loanTokenWRBTC.loanTokenAddress());

            const settlement = await getContract('Settlement');
            await settlement.setMinMarginOrderSize(parseEther('0'));
            
        } else {
            RBTC = await getRBTC();
            SUSD = await TestToken.at(TOKENS.XUSD['31337'].address);
            WRBTC = await TestWrbtc.at(TOKENS.WRBTC['31337'].address);
            BZRX = await getBZRX();
            priceFeeds = await getPriceFeeds(WRBTC, SUSD, RBTC, sovryn, BZRX);

            sovryn = await getSovryn(WRBTC, SUSD, RBTC, priceFeeds);

            loanTokenSUSD = await getLoanToken(owner.address, sovryn, WRBTC, SUSD, true);
            loanTokenWRBTC = await getLoanTokenWRBTC(owner.address, sovryn, WRBTC, SUSD, true);
            await loan_pool_setup(sovryn, owner.address, RBTC, WRBTC, SUSD, loanTokenSUSD, loanTokenWRBTC);
            SOV = await getSOV(sovryn, priceFeeds, SUSD, [owner.address]);

            await WRBTC.deposit({value: parseEther("100")});
            await WRBTC.transfer(loanTokenWRBTC.address, parseEther("100"));
            await SUSD.transfer(loanTokenSUSD.address, parseEther("100000"));

            const settlement = await getContract('Settlement');
            await settlement.setMinMarginOrderSize(parseEther('0'));
            
            console.log('iloanSUSD', loanTokenSUSD.address);
            console.log('iloanWRBTC', loanTokenWRBTC.address);
            await replaceInFile({
                files: 'src/config/local.js',
                from: new RegExp('iXUSD: "0x([0-9a-fA-F]{40})"'),
                to: 'iXUSD: "' + loanTokenSUSD.address + '"',
            });
            await replaceInFile({
                files: 'src/config/local.js',
                from: new RegExp('iRBTC: "0x([0-9a-fA-F]{40})"'),
                to: 'iRBTC: "' + loanTokenWRBTC.address + '"',
            });
        }
        const adr = accounts[0].address;
        console.log("bal wrbtc", formatEther((await WRBTC.balanceOf(adr)).toString()) );
        console.log("bal usd", formatEther((await SUSD.balanceOf(adr)).toString()) );
        console.log("bal rbtc", formatEther((await accounts[0].getBalance()).toString()) );
    });

    const getAccount =  (index) => {
        const acc = accounts[index];
        acc.privateKey = privKeys[index] && privKeys[index].privateKey || privKeys[index];
        return acc;
    };

    const getContract = async (name) => {
        const { abi } = await deployments.get(`${name}Logic`);
        const { address } = await deployments.get(`${name}Proxy`);
        return await ethers.getContractAt(abi, address);
    }

    const createMarginOrder = async (
        signer,
        leverageAmount,
        loanToken,
        loanTokenSent,
        collateralTokenSent,
        collateralTokenAddress,
        minEntryPrice,
        loanDataBytes,
        deadline,
        createdTimestamp,
    ) => {
        const settlement = await getContract('Settlement');
        const checkAllowance = async (token, owner, spender) => {
            const allowance = await token.allowance(owner, spender);
            console.log(`Allowance of ${token.address} ${await token.symbol()}, owner ${owner}, spender ${spender}: ${Number(allowance)}`);
        };
        const prepareOrderAsset = async (assetAddress, amount) => {
            if (assetAddress.toLowerCase() == WRBTC.address.toLowerCase()) {
                await settlement.deposit(signer.address, {
                    value: amount
                });
                // console.log('WRBTC.address', WRBTC.address)
                // console.log('WRBTC on settlement', await settlement.WRBTC_ADDRESS())
                // console.log('Deposited', formatEther(amount), 'rbtc to settlement');
            } else {
                const token = await ethers.getContractAt("TestToken", assetAddress, signer);
                const allowance = await token.allowance(signer.address, settlement.address);
                const _tx = await token.approve(settlement.address, amount.add(allowance));
                await _tx.wait();
                // await checkAllowance(token, signer.address, settlement.address);
            }
        };
        if (Number(loanTokenSent) > 0) {
            const loanTokenAssetAddress = await loanToken.loanTokenAddress();
            await prepareOrderAsset(loanTokenAssetAddress, loanTokenSent);
        }
        if (Number(collateralTokenSent) > 0) {
            await prepareOrderAsset(collateralTokenAddress, collateralTokenSent);
        }

        const order = new MarginOrder(
            ethers.constants.HashZero,
            leverageAmount,
            loanToken.address,
            loanTokenSent,
            collateralTokenSent,
            collateralTokenAddress,
            signer,
            minEntryPrice,
            loanDataBytes,
            deadline,
            createdTimestamp,
        );

        const orderBook = await getContract('OrderBookMargin')
        const args = await order.toArgs({ privateKey: signer.privateKey });
        const tx = await orderBook.createOrder(args);
        return { order, tx };
    };

    const fillMarginOrder = async (signer, order) => {
        const settlement = await getContract('Settlement')
        const orderArgs = await order.toArgs();

        return await settlement.connect(signer).fillMarginOrder([orderArgs]);
    };

    const createFillMarginOrder = async ({
        trader,
        relayer,
        loanToken,
        loanTokenSent,
        collateralToken,
        collateralTokenSent,
        leverageAmount,
        minEntryPrice
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
            minEntryPrice, // min return
            ethers.constants.HashZero, // loan data bytes
            getDeadline(24), // deadline
            ethers.BigNumber.from(Math.floor(Date.now() / 1000)), // created at timestamp
        );
        const hash = await order.hash();
        console.log("order created", hash);
        await tx.wait();

        const filledTx = await fillMarginOrder(relayer, order);

        return {
            order,
            orderTx: tx,
            filledTx
        }
    };

    const getRelayerFee = async (order) => {
        const settlement = await getContract('Settlement');
        const loanContract = await ILoanTokenModules.at(order.loanTokenAddress);
        const loanTokenAsset = await loanContract.loanTokenAddress();
        let orderSize = order.collateralTokenSent;
        const loanTokenPrice = await priceFeeds.queryRate(loanTokenAsset, order.collateralTokenAddress);

        if (order.loanTokenSent.gt(0)) {
            const convertedLoanSent = order.loanTokenSent
                .mul(loanTokenPrice.rate.toString())
                .div(loanTokenPrice.precision.toString());
            orderSize = orderSize.add(convertedLoanSent);
        }

        let orderFee = orderSize.mul(2).div(1000);
        let minFeeAmount = await settlement.minMarginOrderTxFee();
        if (order.collateralTokenAddress.toLowerCase() != WRBTC.address.toLowerCase()) {
            const rbtcPrice = await priceFeeds.queryRate(WRBTC.address, order.collateralTokenAddress);
            minFeeAmount = minFeeAmount.mul(rbtcPrice.rate.toString()).div(rbtcPrice.precision.toString());
        }

        if (orderFee.lt(minFeeAmount)) {
            orderFee = minFeeAmount;
        }

        let feeOnCollateral = orderFee;
        let feeOnLoanToken = BigNumber.from("0");
        if (orderFee.gt(order.collateralTokenSent)) {
            feeOnCollateral = order.collateralTokenSent;
            const outgoingFee = orderFee.sub(order.collateralTokenSent);
            feeOnLoanToken = outgoingFee.mul(loanTokenPrice.precision.toString()).div(loanTokenPrice.rate.toString());
        }

        return {
            feeOnCollateral,
            feeOnLoanToken
        };
    }

    it("Should createMarginOrder SUSD", async () => {
        const { getDeadline } = await helpers.setup();
        const orderBook = await getContract('OrderBookMargin')
        const trader = getAccount(0);
        const collateralToken = WRBTC.address;
        const collateralAmount = parseEther("0.05");

        if (isLocalNetwork) {
            await set_demand_curve(loanTokenSUSD);
            await SUSD.transfer(loanTokenSUSD.address, parseEther("1000000"));
            await SUSD.transfer(trader.address, parseEther("1000"));
            await RBTC.transfer(trader.address, collateralAmount);
            await WRBTC.deposit({ value: collateralAmount });
        }

        const { order, tx } = await createMarginOrder(
            trader,
            parseEther("2"), // leverage amount
            loanTokenSUSD, // loan token (SUSD)
            parseEther("0"), // loan token sent
            collateralAmount, // collateral token sent
            collateralToken, // collateral token
            parseEther("0.00001"), // min return
            ethers.constants.HashZero, // loan data bytes
            getDeadline(24), // deadline
            ethers.BigNumber.from(Math.floor(Date.now() / 1000)), // created at timestamp
        );
        const hash = await order.hash();
        console.log("order created", hash);

        const receipt = await tx.wait();
        const event = receipt.logs[receipt.logs.length - 1];
        const created = orderBook.interface.decodeEventLog("MarginOrderCreated", event.data, event.topics);
        await helpers.expectToEqual(created.hash, order.hash());

        orderG = order;
    });

    it("Should fillMarginOrder SUSD", async () => {
        const settlement = await getContract('Settlement');

        const relayer = getAccount(1);
        const tx = await fillMarginOrder(relayer, orderG);
        const receipt = await tx.wait();
        const event = receipt.logs[receipt.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("MarginOrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, orderG.hash());

        console.log("Margin principal", formatEther(filled.principal));
        console.log("Margin new collateral", formatEther(filled.collateral));
        // Order should not be cancelled after it is executed
        await expectRevert(settlement.cancelMarginOrder(await orderG.toArgs()), "order executed");
    });

    it("Should createMarginOrder - fillMarginOrder WRBTC", async () => {
        const orderBook = await getContract('OrderBookMargin');
        const settlement = await getContract('Settlement');
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken: loanTokenWRBTC,
            loanTokenSent: parseEther("0"),
            collateralToken: SUSD,
            collateralTokenSent: parseEther("1000"),
            leverageAmount: parseEther("5"),
            minEntryPrice: parseEther("999"),
        });

        const receipt = await orderTx.wait();
        const event = receipt.logs[receipt.logs.length - 1];
        const created = orderBook.interface.decodeEventLog("MarginOrderCreated", event.data, event.topics);
        await helpers.expectToEqual(created.hash, order.hash());

        const receipt1 = await filledTx.wait();
        const event1 = receipt1.logs[receipt1.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("MarginOrderFilled", event1.data, event1.topics);
        await helpers.expectToEqual(filled.hash, order.hash());

        console.log("Margin principal", formatEther(filled.principal));
        console.log("Margin new collateral", formatEther(filled.collateral));
    });

    it("Should cancel marginOrder", async () => {
        const { users, getDeadline } = await helpers.setup();
        const collateralToken = WRBTC.address;

        const { order, tx } = await createMarginOrder(
            users[0],
            parseEther("5"), //x5
            loanTokenSUSD,
            parseEther("0"),
            parseEther("100"),
            collateralToken,
            parseEther("500"),
            ethers.constants.HashZero,
            getDeadline(24),
            ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        );
        // console.log(tx);
        const hash = await order.hash();
        console.log("order created", hash);

        const settlement = await getContract('Settlement');
        const tx1 = await settlement.cancelMarginOrder(await order.toArgs());
        const receipt = await tx1.wait();
        const event = receipt.logs[receipt.logs.length - 1];
        const canceled = settlement.interface.decodeEventLog("MarginOrderCanceled", event.data, event.topics);
        await helpers.expectToEqual(canceled.hash, hash);
    });

    it("Should get correct relayer fee on collateral SUSD", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);

        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken: loanTokenWRBTC,
            loanTokenSent: parseEther("0"),
            collateralToken: SUSD,
            collateralTokenSent: parseEther("1000"),
            leverageAmount: parseEther("5"),
            minEntryPrice: parseEther("1000"),
        });
        await orderTx.wait();
        const receipt = await filledTx.wait();
        const fees = await getRelayerFee(order);
        
        const settlement = await getContract('Settlement');
        const event = receipt.logs[receipt.logs.length - 2];
        const feeTransfered = settlement.interface.decodeEventLog("FeeTransferred", event.data, event.topics);
        await helpers.expectToEqual(feeTransfered.hash, order.hash());
        await helpers.expectToEqual(feeTransfered.recipient, relayer.address);
        await helpers.expectToEqual(feeTransfered.amount, fees.feeOnCollateral);
        await helpers.expectToEqual(feeTransfered.token, order.collateralTokenAddress);
    });

    it("Should get correct relayer fee on loan SUSD", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken: loanTokenSUSD,
            loanTokenSent: parseEther("1000"),
            collateralToken: RBTC,
            collateralTokenSent: parseEther("0"),
            leverageAmount: parseEther("5"),
            minEntryPrice: parseEther("0.0009"),
        });
        await orderTx.wait();
        const receipt = await filledTx.wait();
        const fees = await getRelayerFee(order);

        const settlement = await getContract('Settlement');
        const event = receipt.logs[receipt.logs.length - 2];
        const feeTransfered = settlement.interface.decodeEventLog("FeeTransferred", event.data, event.topics);
        await helpers.expectToEqual(feeTransfered.hash, order.hash());
        await helpers.expectToEqual(feeTransfered.recipient, relayer.address);
        await helpers.expectToEqual(feeTransfered.amount, fees.feeOnLoanToken);
        await helpers.expectToEqual(feeTransfered.token, SUSD.address);
    });
    
    it("Should get correct relayer fee on loan SUSD and collateral WRBTC", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken: loanTokenSUSD,
            loanTokenSent: parseEther("500"),
            collateralToken: RBTC,
            collateralTokenSent: parseEther("0.01"),
            leverageAmount: parseEther("5"),
            minEntryPrice: parseEther("0.0009"),
        });
        await orderTx.wait();
        const receipt = await filledTx.wait();
        const fees = await getRelayerFee(order);

        const settlement = await getContract('Settlement');
        const event1 = receipt.logs[receipt.logs.length - 2]; //FeeTransferred for loan token
        const event2 = receipt.logs[receipt.logs.length - 4]; //FeeTransferred for collateral
        const feeTransferedUsd = settlement.interface.decodeEventLog("FeeTransferred", event1.data, event1.topics);
        const feeTransferedWrbtc = settlement.interface.decodeEventLog("FeeTransferred", event2.data, event2.topics);
        await helpers.expectToEqual(feeTransferedUsd.hash, order.hash());
        await helpers.expectToEqual(feeTransferedUsd.recipient, relayer.address);
        await helpers.expectToEqual(feeTransferedUsd.amount, fees.feeOnLoanToken);
        await helpers.expectToEqual(feeTransferedUsd.token, SUSD.address);

        await helpers.expectToEqual(feeTransferedWrbtc.hash, order.hash());
        await helpers.expectToEqual(feeTransferedWrbtc.recipient, relayer.address);
        await helpers.expectToEqual(feeTransferedWrbtc.amount, fees.feeOnCollateral);
        await helpers.expectToEqual(feeTransferedWrbtc.token, RBTC.address);
    });

    it("Should create a long position with 2x leverage", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const leverageAmount = parseEther("2");
        const loanTokenSent = parseEther("500"); //SUSD
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
            minEntryPrice: parseEther("0.00001") //ethers.BigNumber.from(String(collateral)).div(2)
        });
        await orderTx.wait();
        const receipt = await filledTx.wait();
        console.log('fill tx', receipt.transactionHash);
    });

    it("Should create a short position with 2x leverage", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const loanToken = loanTokenWRBTC;
        const loanTokenSent = parseEther("0");
        const leverageAmount = parseEther("2");
        const collateralToken = SUSD;
        const collateralTokenSent = parseEther("25"); //Collaterral SUSD
        const { collateral } = await loanToken.getEstimatedMarginDetails(
            leverageAmount,
            loanTokenSent,
            collateralTokenSent,
            collateralToken.address,
        );
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken,
            loanTokenSent,
            collateralToken,
            collateralTokenSent,
            leverageAmount,
            minEntryPrice: ethers.BigNumber.from(String(collateral)).div(2),
        });
        await orderTx.wait();
        const receipt = await filledTx.wait();
        console.log(receipt.transactionHash);
    });

    it("Should fail to fill MarginOrder because minFee", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const settlement = await getContract('Settlement');
        const tx = await settlement.setMinMarginOrderSize(parseEther('25'));
        await tx.wait();
        await helpers.expectToBeReverted('Order amount is too low to pay the relayer fee', 
            createFillMarginOrder({
                trader,
                relayer,
                loanToken: loanTokenWRBTC,
                loanTokenSent: parseEther("0"),
                collateralToken: SUSD,
                collateralTokenSent: parseEther('20'),
                leverageAmount: parseEther("2"),
                minEntryPrice: parseEther("2"),
            })
        );
        await settlement.setMinMarginOrderSize(parseEther('0'));
    });
});