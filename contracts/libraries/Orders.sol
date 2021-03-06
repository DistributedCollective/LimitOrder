// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

library Orders {
    // Struct signature hash
    bytes32 public constant ORDER_TYPEHASH =
        keccak256(
            "Order(address maker,address fromToken,address toToken,uint256 amountIn,uint256 amountOutMin,address recipient,uint256 deadline,uint256 created)"
        );

    // Order details including the v, r and s components of a signature
    struct Order {
        address maker;
        address fromToken;
        address toToken;
        uint256 amountIn;
        uint256 amountOutMin;
        address recipient;
        uint256 deadline;
        uint256 created;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // Creates the hash of the typehash and all paramaters, used for recovering signer
    function hash(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.maker,
                    order.fromToken,
                    order.toToken,
                    order.amountIn,
                    order.amountOutMin,
                    order.recipient,
                    order.deadline,
                    order.created
                )
            );
    }

    // Validates all the parameters of the struct
    function validate(Order memory order) internal view {
        require(order.maker != address(0), "invalid-maker");
        require(order.fromToken != address(0), "invalid-from-token");
        require(order.toToken != address(0), "invalid-to-token");
        require(order.fromToken != order.toToken, "duplicate-tokens");
        require(order.amountIn > 0, "invalid-amount-in");
        require(order.amountOutMin > 0, "invalid-amount-out-min");
        require(order.recipient != address(0), "invalid-recipient");
        require(order.created >= now - 5 minutes, "invalid-created");
        require(order.deadline > now, "invalid-deadline");
    }
}
