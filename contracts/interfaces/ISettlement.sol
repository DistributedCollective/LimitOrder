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
    event Swap(
        address indexed _sourceToken,
        address indexed _targetToken,
        uint256 _sourceTokenAmount,
        uint256 _targetTokenAmount,
        address _sender
    );
    event MarginTrade(
        address indexed loanTokenAddress,
        address indexed collateralTokenAddress,
        uint256 leverageAmount,
        uint256 collateralTokenSent,
        uint256 principalAmount,
        uint256 collateralAmount,
        address trader
    );
    event Deposit(address to, uint256 amount);
    event Withdrawal(address receiver, uint256 amount);

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
    function deposit(address to) external payable;
    function withdraw(uint256 amount) external;
}
