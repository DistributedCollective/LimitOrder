// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

library MarginOrders {
    // keccak256("Order(bytes32 loanId,uint256 leverageAmount,address loanTokenAddress,uint256 loanTokenSent,uint256 collateralTokenSent,address collateralTokenAddress,address trader,uint256 minReturn,uint256 deadline,uint256 createdTimestamp)")
    bytes32 public constant ORDER_TYPEHASH = 0x125b609ee8968d7276cb80e662bf0d49e982bf074314f8b1e7b5931a3d946934;

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

    function validate(Order memory order) internal {
        //@ha please add validation for the other variables
        require(order.deadline > 0, "invalid-deadline");
    }
}
