const { ethers, getChainId, deployments, getNamedAccounts } = require("hardhat");
const { _TypedDataEncoder } = require("@ethersproject/hash");

class MarginOrder {
    static ORDER_TYPEHASH = "0x081065ed5fb223d1fbe21ab1bb041dfac552070112cff5e8d4be7dada1f96cd6";

    constructor(
        loanId,
        leverageAmount,
        loanTokenAddress,
        loanTokenSent,
        collateralTokenSent,
        collateralTokenAddress,
        trader,
        minEntryPrice,
        loanDataBytes,
        deadline,
        createdTimestamp,
    ) {
        this.trader = trader;
        this.loanId = loanId;
        this.leverageAmount = leverageAmount;
        this.loanTokenAddress = loanTokenAddress;
        this.loanTokenSent = loanTokenSent;
        this.collateralTokenSent = collateralTokenSent;
        this.collateralTokenAddress = collateralTokenAddress;
        this.minEntryPrice = minEntryPrice;
        this.loanDataBytes = loanDataBytes;
        this.deadline = deadline;
        this.createdTimestamp = createdTimestamp;
    }

    async hash(overrides = {}) {
        return ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                [
                    "bytes32",
                    "bytes32",
                    "uint256",
                    "address",
                    "uint256",
                    "uint256",
                    "address",
                    "address",
                    "uint256",
                    "bytes32",
                    "uint256",
                    "uint256",
                ],
                [
                    MarginOrder.ORDER_TYPEHASH,
                    overrides.loanId || this.loanId,
                    overrides.leverageAmount || this.leverageAmount,
                    overrides.loanTokenAddress || this.loanTokenAddress,
                    overrides.loanTokenSent || this.loanTokenSent,
                    overrides.collateralTokenSent || this.collateralTokenSent,
                    overrides.collateralTokenAddress || this.collateralTokenAddress,
                    overrides.trader || this.trader.address,
                    overrides.minEntryPrice || this.minEntryPrice,
                    overrides.loanDataBytes || this.loanDataBytes,
                    overrides.deadline || this.deadline,
                    overrides.createdTimestamp || this.createdTimestamp,
                ]
            )
        );
    }

    async sign(overrides = {}) {
        const { address } = await deployments.get("OrderBookMarginProxy");
        const chainId = 30; // await getChainId();
        const domain = {
            name: "OrderBookMargin",
            version: "1",
            chainId,
            verifyingContract: address,
        };
        const types = {
            Order: [
                { name: "loanId", type: "bytes32" },
                { name: "leverageAmount", type: "uint256" },
                { name: "loanTokenAddress", type: "address" },
                { name: "loanTokenSent", type: "uint256" },
                { name: "collateralTokenSent", type: "uint256" },
                { name: "collateralTokenAddress", type: "address" },
                { name: "trader", type: "address" },
                { name: "minEntryPrice", type: "uint256" },
                { name: "loanDataBytes", type: "bytes32" },
                { name: "deadline", type: "uint256" },
                { name: "createdTimestamp", type: "uint256" },
            ],
        };
        const value = {
            loanId: overrides.loanId || this.loanId,
            leverageAmount: overrides.leverageAmount || this.leverageAmount,
            loanTokenAddress: overrides.loanTokenAddress || this.loanTokenAddress,
            loanTokenSent: overrides.loanTokenSent || this.loanTokenSent,
            collateralTokenSent: overrides.collateralTokenSent || this.collateralTokenSent,
            collateralTokenAddress: overrides.collateralTokenAddress || this.collateralTokenAddress,
            trader: overrides.trader || this.trader.address,
            minEntryPrice: overrides.minEntryPrice || this.minEntryPrice,
            loanDataBytes: overrides.loanDataBytes || this.loanDataBytes,
            deadline: overrides.deadline || this.deadline,
            createdTimestamp: overrides.createdTimestamp || this.createdTimestamp,
        };

        const digest = _TypedDataEncoder.hash(domain, types, value);

        // Deployer private key for default hardhat accounts[0], might want to replace this
        let privateKey;
        if(network.name=="rsktestnet") privateKey = "0x" + process.env.PRIVATE_KEY;
        else {
            privateKey = this.trader.privateKey || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        }
       
        const key = new ethers.utils.SigningKey(ethers.utils.hexlify(privateKey));
        const signature = key.signDigest(digest);
        return ethers.utils.splitSignature(signature);
    }

    async toArgs(overrides = {}) {
        const { v, r, s } = await this.sign(overrides);
        return [
            overrides.loanId || this.loanId,
            overrides.leverageAmount || this.leverageAmount,
            overrides.loanTokenAddress || this.loanTokenAddress,
            overrides.loanTokenSent || this.loanTokenSent,
            overrides.collateralTokenSent || this.collateralTokenSent,
            overrides.collateralTokenAddress || this.collateralTokenAddress,
            overrides.trader || this.trader.address,
            overrides.minEntryPrice || this.minEntryPrice,
            overrides.loanDataBytes || this.loanDataBytes,
            overrides.deadline || this.deadline,
            overrides.createdTimestamp || this.createdTimestamp,
            v,
            r,
            s,
        ];
    }
}

module.exports = MarginOrder;
