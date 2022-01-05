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
const { approve } = require('../scripts/approval');

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
            const susdAdr = await loanTokenSUSD.loanTokenAddress();
            const wrbtcAdr = await loanTokenWRBTC.loanTokenAddress();
            SUSD = await TestToken.at(susdAdr);
            WRBTC = await TestWrbtc.at(wrbtcAdr);

            console.log("asset susd", await loanTokenSUSD.loanTokenAddress());
            console.log("asset wrbtc", await loanTokenWRBTC.loanTokenAddress());

            const settlement = await getContract('Settlement');
            await settlement.setMinFee(parseEther('0'));
            
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

            await WRBTC.deposit({value: parseEther("100")});
            await WRBTC.transfer(loanTokenWRBTC.address, parseEther("100"));
            await SUSD.transfer(loanTokenSUSD.address, parseEther("100000"));

            const settlement = await getContract('Settlement');
            await settlement.setMinFee(parseEther('0'));
            
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

            await approve({
                iXUSD: loanTokenSUSD.address,
                iRBTC: loanTokenWRBTC.address
            }, {
                SOV: SOV.address,
                XUSD: SUSD.address,
                WRBTC: WRBTC.address,
                RBTC: RBTC.address,
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
        minReturn,
        loanDataBytes,
        deadline,
        createdTimestamp,
    ) => {
        const settlement = await getContract('Settlement');
        const checkAllowance = async (token, owner, spender) => {
            const allowance = await token.allowance(owner, spender);
            console.log(`Allowance of ${token.address} ${await token.symbol()}, owner ${owner}, spender ${spender}: ${Number(allowance)}`);
        }
        if (Number(loanTokenSent) > 0) {
            const loanTokenAssetAddress = await loanToken.loanTokenAddress();
            const loanTokenAsset = await ethers.getContractAt("TestToken", loanTokenAssetAddress, signer);
            const allowance = await loanTokenAsset.allowance(signer.address, settlement.address);
            const _tx = await loanTokenAsset.approve(settlement.address, loanTokenSent.add(allowance));
            await _tx.wait();
            await checkAllowance(loanTokenAsset, settlement.address, loanToken.address)
        }
        if (Number(collateralTokenSent) > 0) {
            const collateralToken = await ethers.getContractAt("TestToken", collateralTokenAddress, signer);
            const allowance = await collateralToken.allowance(signer.address, settlement.address);
            const _tx = await collateralToken.approve(settlement.address, collateralTokenSent.add(allowance));
            await _tx.wait();
            await checkAllowance(collateralToken, settlement.address, loanToken.address)
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

        const orderBook = await getContract('OrderBookMargin')
        const args = await order.toArgs({ privateKey: signer.privateKey });
        const tx = await orderBook.createOrder(args);
        return { order, tx };
    };

    const fillMarginOrder = async (signer, order) => {
        const settlement = await getContract('Settlement')
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
        await tx.wait();

        const filledTx = await fillMarginOrder(relayer, order);

        return {
            order,
            orderTx: tx,
            filledTx
        }
    }

    it("Should createMarginOrder SUSD", async () => {
        const { getDeadline } = await helpers.setup();
        const orderBook = await getContract('OrderBookMargin')
        const trader = getAccount(0);
        const collateralToken = WRBTC.address;
        const collateralAmount = parseEther("0.01");

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
            parseEther("0.02"), // min return
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
            minReturn: parseEther("5000"),
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

    it("Should relayer receive correct fee on loan SUSD", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const balances = {
            susd: {
                before: formatEther((await SUSD.balanceOf(relayer.address)).toString())
            },
            rbtc: {
                before: formatEther((await relayer.getBalance()).toString())
            },
            wrbtc: {
                before: formatEther((await WRBTC.balanceOf(relayer.address)).toString())
            }
        };
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken: loanTokenWRBTC,
            loanTokenSent: parseEther("0.5"),
            collateralToken: SUSD,
            collateralTokenSent: parseEther("1000"),
            leverageAmount: parseEther("5"),
            minReturn: parseEther("3000"),
        });
        await orderTx.wait();
        await filledTx.wait();
        
        balances.susd.after = formatEther((await SUSD.balanceOf(relayer.address)).toString());
        balances.rbtc.after = formatEther((await relayer.getBalance()).toString());
        balances.wrbtc.after = formatEther((await WRBTC.balanceOf(relayer.address)).toString());
        console.log(balances);
    });

    it("Should relayer receive correct fee on loan WRBTC", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const balances = {
            susd: {
                before: formatEther((await SUSD.balanceOf(relayer.address)).toString())
            },
            rbtc: {
                before: formatEther((await relayer.getBalance()).toString())
            },
            wrbtc: {
                before: formatEther((await WRBTC.balanceOf(relayer.address)).toString())
            }
        };
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken: loanTokenSUSD,
            loanTokenSent: parseEther("200"),
            collateralToken: WRBTC,
            collateralTokenSent: parseEther("0.2"),
            leverageAmount: parseEther("5"),
            minReturn: parseEther("0.5"),
        });
        await orderTx.wait();
        await filledTx.wait();
        
        balances.susd.after = formatEther((await SUSD.balanceOf(relayer.address)).toString());
        balances.rbtc.after = formatEther((await relayer.getBalance()).toString());
        balances.wrbtc.after = formatEther((await WRBTC.balanceOf(relayer.address)).toString());
        console.log(balances);
    });

    it("Should create a long position with 2x leverage", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const leverageAmount = parseEther("2");
        const loanTokenSent = parseEther("5"); //SUSD
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
            minReturn: ethers.BigNumber.from(String(collateral)).div(2)
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
        console.log(formatEther(String(collateral)));
        const {order, orderTx, filledTx } = await createFillMarginOrder({
            trader,
            relayer,
            loanToken,
            loanTokenSent,
            collateralToken,
            collateralTokenSent,
            leverageAmount,
            minReturn: ethers.BigNumber.from(String(collateral)).div(2),
        });
        await orderTx.wait();
        const receipt = await filledTx.wait();
        console.log(receipt.transactionHash);
    });

    it("Should failed fillMarginOrder because minFee", async () => {
        const trader = getAccount(0);
        const relayer = getAccount(1);
        const settlement = await getContract('Settlement');
        const tx = await settlement.setMinFee(parseEther('0.1'));
        await tx.wait();
        await helpers.expectToBeReverted('Order amount is too low to pay the relayer fee', 
            createFillMarginOrder({
                trader,
                relayer,
                loanToken: loanTokenWRBTC,
                loanTokenSent: parseEther("0"),
                collateralToken: SUSD,
                collateralTokenSent: parseEther('1'),
                leverageAmount: parseEther("2"),
                minReturn: parseEther("2"),
            })
        );
        await settlement.setMinFee(parseEther('0'));
    });
});