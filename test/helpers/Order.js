const { ethers, getChainId, } = require("hardhat");
const { _TypedDataEncoder } = require("@ethersproject/hash");

class Order {
    static ORDER_TYPEHASH = "0xd6dcdb8a8034d5997072fdf38e109521eb631713bc0470668aa787bb502b623c";

    constructor(
        maker,
        fromToken,
        toToken,
        amountIn,
        amountOutMin,
        recipient = maker.address,
        deadline,
        created,
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

    async hash(overrides = {}) {
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
                    overrides.maker || this.maker.address,
                    overrides.fromToken || this.fromToken.address,
                    overrides.toToken || this.toToken.address,
                    overrides.amountIn || this.amountIn,
                    overrides.amountOutMin || this.amountOutMin,
                    overrides.recipient || this.recipient,
                    overrides.deadline || this.deadline,
                    overrides.created || this.created,
                ]
            )
        );
    }

    async sign(overrides = {}) {
        const { address } = await deployments.get("OrderBookSwapProxy");
        const chainId = await getChainId();
        const domain = {
            name: "OrderBook",
            version: "1",
            chainId,
            verifyingContract: address,
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
            maker: overrides.maker || this.maker.address,
            fromToken: overrides.fromToken || this.fromToken.address,
            toToken: overrides.toToken || this.toToken.address,
            amountIn: overrides.amountIn || this.amountIn,
            amountOutMin: overrides.amountOutMin || this.amountOutMin,
            recipient: overrides.recipient || this.recipient,
            deadline: overrides.deadline || this.deadline,
            created: overrides.created || this.created,
        };

        const digest = _TypedDataEncoder.hash(domain, types, value);

        // Deployer private key for default hardhat accounts[0], might want to replace this
        let privateKey;
        if(network.name=="rsktestnet") privateKey = "0x" + process.env.PRIVATE_KEY;
        else privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
       
        const key = new ethers.utils.SigningKey(ethers.utils.hexlify(privateKey));
        const signature = key.signDigest(digest);
        return ethers.utils.splitSignature(signature);
    }

    async toArgs(overrides = {}) {
        const { v, r, s } = await this.sign(overrides);
        return [
            overrides.maker || this.maker.address,
            overrides.fromToken || this.fromToken.address,
            overrides.toToken || this.toToken.address,
            overrides.amountIn || this.amountIn,
            overrides.amountOutMin || this.amountOutMin,
            overrides.recipient || this.recipient,
            overrides.deadline || this.deadline,
            overrides.created || this.created,
            v,
            r,
            s,
        ];
    }
}

module.exports = Order;
