// SPDX-License-Identifier: MIT

pragma solidity = 0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/Orders.sol";
import "../libraries/MarginOrders.sol";

interface ISettlement {
    event OrderFilled(bytes32 indexed hash, uint256 amountIn, uint256 amountOut);
    event OrderCanceled(bytes32 indexed hash);
    event FeeTransferred(bytes32 indexed hash, address indexed recipient, uint256 amount);
    event FeeSplitTransferred(bytes32 indexed hash, address indexed recipient, uint256 amount);
    event MarginOrderFilled(bytes32 indexed hash, uint256 principal, uint256 collateral);

    struct FillOrderArgs {
        Orders.Order order;
        uint256 amountToFillIn;
        address[] path;
    }

     struct FillMarginOrderArgs {
        MarginOrders.Order order;
    }

    function fillOrder(FillOrderArgs calldata args) external returns (uint256 amountOut);
    function fillMarginOrder(FillMarginOrderArgs calldata args) external returns (uint256 principalAmount, uint256 collateralAmount);
    function fillOrders(FillOrderArgs[] memory args) external returns (uint256[] memory amountsOut);

    function cancelOrder(bytes32 hash) external;
}
