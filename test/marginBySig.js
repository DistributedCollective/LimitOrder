
const { BN } = require("@openzeppelin/test-helpers");
const { ethers, deployments } = require("hardhat");
const helpers = require("./helpers");
const getContract = require("./helpers/getContract");
const { parseEther } = ethers.utils;
const ethUtil = require("ethereumjs-util");
const EIP712 = require("./Utils/EIP712");
const { getAccountsPrivateKeysBuffer } = require("./Utils/hardhat_utils");

let owner, accounts, sovryn, SUSD, WRBTC, RBTC, BZRX, loanToken, loanTokenWRBTC, SOV, priceFeeds, pkbA2;

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

describe("OrderBook", async () => {
    before(async () => {
		accounts = await ethers.getSigners();
        owner = accounts[0].address;
        [pkbRoot, pkbA1, pkbA2, ...pkbAccounts] = getAccountsPrivateKeysBuffer();
	});
    beforeEach(async () => {
        SUSD = await getSUSD();
        RBTC = await getRBTC();
        WRBTC = await getWRBTC();
        BZRX = await getBZRX();
        priceFeeds = await getPriceFeeds(WRBTC, SUSD, RBTC, sovryn, BZRX);
         
        sovryn = await getSovryn(WRBTC, SUSD, RBTC, priceFeeds);

        loanToken = await getLoanToken(owner, sovryn, WRBTC, SUSD, true);
		loanTokenWRBTC = await getLoanTokenWRBTC(owner, sovryn, WRBTC, SUSD, true);
		await loan_pool_setup(sovryn, owner, RBTC, WRBTC, SUSD, loanToken, loanTokenWRBTC);

        console.log("loanToken.address", loanToken.address)
        SOV = await getSOV(sovryn, priceFeeds, SUSD, [owner]);
    });

    it("Check marginTrade with minPositionSize > 0 using a signature", async () => {
        let currentChainId = (await ethers.provider.getNetwork()).chainId;
        const Domain = (loanToken) => ({
            name: "Loan Token",
            chainId: currentChainId, //31337 - Hardhat, //1 - Mainnet, // await web3.eth.net.getId(); See: https://github.com/trufflesuite/ganache-core/issues/515
            verifyingContract: loanToken.address,
        });
        const Types = {
            MarginTradeOrder: [
                { name: "loanId", type: "bytes32" },
                { name: "leverageAmount", type: "uint256" },
                { name: "loanTokenSent", type: "uint256" },
                { name: "collateralTokenSent", type: "uint256" },
                { name: "collateralTokenAddress", type: "address" },
                { name: "trader", type: "address" },
                { name: "minReturn", type: "uint256" },
                { name: "loanDataBytes", type: "bytes32" },
                { name: "createdTimestamp", type: "uint256" },
            ],
        };

        let loanDataBytes = "0x";
        const order = {
            loanId: "0x0000000000000000000000000000000000000000000000000000000000000000", // loanId  (0 for new loans)
            leverageAmount: web3.utils.toWei("2", "ether"), // leverageAmount
            loanTokenSent: 0, // loanTokenSent (SUSD)
            collateralTokenSent: 1000, // collateral token sent
            collateralTokenAddress: RBTC.address, // collateralTokenAddress (RBTC)
            trader: accounts[2].address, // trader,
            minReturn: 2000,
            loanDataBytes: loanDataBytes, // loanDataBytes (only required with ether)
            createdTimestamp: Date.now()
        };

        order.loanDataBytes = ethUtil.keccak256(loanDataBytes);
        const { v, r, s } = EIP712.sign(
            Domain(loanToken),
            "MarginTradeOrder",
            order,
            Types,
            pkbA2
        );

        await set_demand_curve(loanToken);
        await SUSD.transfer(loanToken.address, web3.utils.toWei("1000000", "ether"));
        await RBTC.transfer(accounts[2].address, new BN(web3.utils.toWei("1", "ether")));
        await RBTC.approve(loanToken.address, new BN(web3.utils.toWei("1", "ether")), { from: accounts[2].address });

        order.loanDataBytes = loanDataBytes;
        await loanToken.marginTradeBySig(order, v, r, s);
    });

});