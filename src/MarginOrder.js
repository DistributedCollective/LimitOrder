const ethers = require('ethers');
const { _TypedDataEncoder } = require("@ethersproject/hash");

module.exports = class MarginOrder {
    static get ORDER_TYPEHASH() {
        return "0xe30dcb91507ed7c8a9a2019b56e407eee8294529022e84f18b5420374e178404";
    }

    constructor(
        loanId,
        leverageAmount,
        loanTokenAddress,
        loanTokenSent,
        collateralTokenSent,
        collateralTokenAddress,
        trader,
        minReturn,
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
        this.minReturn = minReturn;
        this.loanDataBytes = loanDataBytes;
        this.deadline = deadline;
        this.createdTimestamp = createdTimestamp;
    }

    hash(overrides = {}) {
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
                    overrides.trader || this.trader,
                    overrides.minReturn || this.minReturn,
                    overrides.loanDataBytes || this.loanDataBytes,
                    overrides.deadline || this.deadline,
                    overrides.createdTimestamp || this.createdTimestamp,
                ]
            )
        );
    }

    messageHash(chainId, contractAddress) {
        const domain = {
            name: "OrderBookMargin",
            version: "1",
            chainId,
            verifyingContract: contractAddress,
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
                { name: "minReturn", type: "uint256" },
                { name: "loanDataBytes", type: "bytes32" },
                { name: "deadline", type: "uint256" },
                { name: "createdTimestamp", type: "uint256" },
            ],
        };
        const value = {
            loanId: this.loanId,
            leverageAmount: this.leverageAmount,
            loanTokenAddress: this.loanTokenAddress,
            loanTokenSent: this.loanTokenSent,
            collateralTokenSent: this.collateralTokenSent,
            collateralTokenAddress: this.collateralTokenAddress,
            trader: this.trader,
            minReturn: this.minReturn,
            loanDataBytes: this.loanDataBytes,
            deadline: this.deadline,
            createdTimestamp: this.createdTimestamp,
        };

        return _TypedDataEncoder.hash(domain, types, value);
    }

    async toArgs(chainId, orderBook, signerKey) {
        const msg = this.messageHash(chainId, orderBook);
        const key = new ethers.utils.SigningKey(ethers.utils.hexlify(signerKey));
        const signature = key.signDigest(msg);
        const { v, r, s } = ethers.utils.splitSignature(signature);

        return [
            this.loanId,
            this.leverageAmount,
            this.loanTokenAddress,
            this.loanTokenSent,
            this.collateralTokenSent,
            this.collateralTokenAddress,
            this.trader.address,
            this.minReturn,
            this.loanDataBytes,
            this.deadline,
            this.createdTimestamp,
            v,
            r,
            s,
        ];
    }
}