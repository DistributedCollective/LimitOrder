// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

library MarginOrders {
    // keccak256("Order(bytes32 loanId,uint256 leverageAmount,address loanTokenAddress,uint256 loanTokenSent,uint256 collateralTokenSent,address collateralTokenAddress,address trader,uint256 minReturn,bytes32 loanDataBytes,uint256 deadline,uint256 createdTimestamp)")
    // bytes32 public constant ORDER_TYPEHASH = 0xe30dcb91507ed7c8a9a2019b56e407eee8294529022e84f18b5420374e178404;
    bytes32 public constant ORDER_TYPEHASH =
        keccak256(
            "Order(bytes32 loanId,uint256 leverageAmount,address loanTokenAddress,uint256 loanTokenSent,uint256 collateralTokenSent,address collateralTokenAddress,address trader,uint256 minReturn,bytes32 loanDataBytes,uint256 deadline,uint256 createdTimestamp)"
        );

    struct Order {
        bytes32 loanId; //default 0x0000000000000000000000000000000000000000000000000000000000000000 for new loan
        uint256 leverageAmount;
        address loanTokenAddress;
        uint256 loanTokenSent; //default 0
        uint256 collateralTokenSent;
        address collateralTokenAddress;
        address trader;
        uint256 minReturn; //optional ??
        bytes32 loanDataBytes;
        uint256 deadline;
        uint256 createdTimestamp;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.loanId,
                    order.leverageAmount,
                    order.loanTokenAddress,
                    order.loanTokenSent,
                    order.collateralTokenSent,
                    order.collateralTokenAddress,
                    order.trader,
                    order.minReturn,
                    order.loanDataBytes,
                    order.deadline,
                    order.createdTimestamp
                )
            );
    }

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
        require(order.minReturn > 0, "invalid-min-return");
        require(order.deadline > now, "invalid-deadline");
        require(order.createdTimestamp >= now - 15 minutes, "invalid-created");
    }
}
