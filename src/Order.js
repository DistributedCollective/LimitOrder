const ethers = require('ethers');
const { _TypedDataEncoder } = require("@ethersproject/hash");

module.exports = class Order {
    static get ORDER_TYPEHASH() {
        return "0xd6dcdb8a8034d5997072fdf38e109521eb631713bc0470668aa787bb502b623c";
    }
  
    constructor(
        maker,
        fromToken,
        toToken,
        amountIn,
        amountOutMin,
        recipient = maker,
        deadline,
        created
    ) {
        this.maker = maker;
        this.fromToken = fromToken;
        this.toToken = toToken;
        this.amountIn = amountIn;
        this.amountOutMin = amountOutMin;
        this.recipient = recipient;
        this.deadline = deadline;
        this.created = created;
    }

    hash(overrides = {}) {
        return ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                [
                    "bytes32",
                    "address",
                    "address",
                    "address",
                    "uint256",
                    "uint256",
                    "address",
                    "uint256",
                    "uint256",
                ],
                [
                    Order.ORDER_TYPEHASH,
                    overrides.maker || this.maker,
                    overrides.fromToken || this.fromToken,
                    overrides.toToken || this.toToken,
                    overrides.amountIn || this.amountIn,
                    overrides.amountOutMin || this.amountOutMin,
                    overrides.recipient || this.recipient,
                    overrides.deadline || this.deadline,
                    overrides.created || this.created,
                ]
            )
        );
    }

    messageHash(chainId, contractAddress) {
        const domain = {
            name: "OrderBook",
            version: "1",
            chainId,
            verifyingContract: contractAddress,
        };
        const types = {
            Order: [
                { name: "maker", type: "address" },
                { name: "fromToken", type: "address" },
                { name: "toToken", type: "address" },
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMin", type: "uint256" },
                { name: "recipient", type: "address" },
                { name: "deadline", type: "uint256" },
                { name: "created", type: "uint256" },
            ],
        };
        const value = {
            maker: this.maker,
            fromToken: this.fromToken,
            toToken: this.toToken,
            amountIn: this.amountIn,
            amountOutMin: this.amountOutMin,
            recipient: this.recipient,
            deadline: this.deadline,
            created: this.created,
        };

        return _TypedDataEncoder.hash(domain, types, value);
    }

    async toArgs(chainId, orderBook, signerKey) {
        const msg = this.messageHash(chainId, orderBook);
        // console.log(msg)
        const key = new ethers.utils.SigningKey(ethers.utils.hexlify(signerKey));
        const signature = key.signDigest(msg);
        const { v, r, s } = ethers.utils.splitSignature(signature);

        return [
            this.maker,
            this.fromToken,
            this.toToken,
            this.amountIn,
            this.amountOutMin,
            this.recipient,
            this.deadline,
            this.created,
            v,
            r,
            s,
        ];
    }
}