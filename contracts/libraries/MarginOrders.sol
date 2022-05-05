// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

library MarginOrders {
    // Struct signature hash
    bytes32 public constant ORDER_TYPEHASH =
        keccak256(
            "Order(bytes32 loanId,uint256 leverageAmount,address loanTokenAddress,uint256 loanTokenSent,uint256 collateralTokenSent,address collateralTokenAddress,address trader,uint256 minEntryPrice,bytes32 loanDataBytes,uint256 deadline,uint256 createdTimestamp)"
        );

    // MarginOrder details including the v, r and s components of a signature
    struct Order {
        bytes32 loanId; // default 0x0000000000000000000000000000000000000000000000000000000000000000 for new loan
        uint256 leverageAmount;
        address loanTokenAddress; // iToken - lendingPoolAddress
        uint256 loanTokenSent; // default 0
        uint256 collateralTokenSent;
        address collateralTokenAddress;
        address trader;
        uint256 minEntryPrice; // optional
        bytes32 loanDataBytes;
        uint256 deadline;
        uint256 createdTimestamp;
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
                    order.loanId,
                    order.leverageAmount,
                    order.loanTokenAddress, // iToken
                    order.loanTokenSent,
                    order.collateralTokenSent,
                    order.collateralTokenAddress,
                    order.trader,
                    order.minEntryPrice,
                    order.loanDataBytes,
                    order.deadline,
                    order.createdTimestamp
                )
            );
    }

    // Validates the parameters of the struct
    function validate(Order memory order) internal view {
        require(order.trader != address(0), "invalid-trader");
        require(
            order.loanTokenAddress != address(0),
            "invalid-loan-token-address"
        );
        require(order.leverageAmount > 0, "invalid-leverage-amount");
        require(
            order.collateralTokenAddress != address(0),
            "invalid-collateral-token-address"
        );
        require(order.minEntryPrice > 0, "invalid-min-return");
        require(order.deadline > now, "invalid-deadline");
        require(order.createdTimestamp >= now - 15 minutes, "invalid-created");
    }
}
