const ethers = require('ethers');
const { _TypedDataEncoder } = require("@ethersproject/hash");

module.exports = class Order {
    static ORDER_TYPEHASH = "0x7c228c78bd055996a44b5046fb56fa7c28c66bce92d9dc584f742b2cd76a140f";
  
    constructor(
        maker,
        fromToken,
        toToken,
        amountIn,
        amountOutMin,
        recipient = maker,
        deadline
    ) {
        this.maker = maker;
        this.fromToken = fromToken;
        this.toToken = toToken;
        this.amountIn = amountIn;
        this.amountOutMin = amountOutMin;
        this.recipient = recipient;
        this.deadline = deadline;
    }

    async hash() {
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
                ],
                [
                    Order.ORDER_TYPEHASH,
                    this.maker,
                    this.fromToken,
                    this.toToken,
                    this.amountIn,
                    this.amountOutMin,
                    this.recipient,
                    this.deadline,
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
            v,
            r,
            s,
        ];
    }
}