// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/Orders.sol";
import "../libraries/MarginOrders.sol";

interface ISettlement {
    event SetMinFee(address indexed sender, uint256 oldValue, uint256 newValue);
    event SetRelayerFee(
        address indexed sender,
        uint256 oldValue,
        uint256 newValue
    );
    event OrderFilled(
        bytes32 indexed hash,
        address indexed maker,
        uint256 amountIn,
        uint256 amountOut,
        address[] path
    );
    event OrderCanceled(bytes32 indexed hash, address indexed maker);
    event FeeTransferred(
        bytes32 indexed hash,
        address indexed recipient,
        uint256 amount
    );
    event FeeSplitTransferred(
        bytes32 indexed hash,
        address indexed recipient,
        uint256 amount
    );
    event MarginOrderFilled(
        bytes32 indexed hash,
        address indexed trader,
        uint256 principal,
        uint256 collateral,
        uint256 leverageAmount,
        address loanTokenAddress,
        uint256 loanTokenSent,
        uint256 collateralTokenSent,
        address collateralTokenAddress
    );
    event MarginOrderCanceled(bytes32 indexed hash, address indexed trader);
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

    struct CanceledCheck {
        bytes32 hash;
        bool canceled;
    }

    struct FilledAmountCheck {
        bytes32 hash;
        uint256 amount;
    }

    function fillOrder(FillOrderArgs calldata args)
        external
        returns (uint256 amountOut);

    function fillOrders(FillOrderArgs[] memory args)
        external
        returns (uint256[] memory amountsOut);

    function fillMarginOrder(FillMarginOrderArgs calldata args)
        external
        returns (uint256 principalAmount, uint256 collateralAmount);

    function fillMarginOrders(FillMarginOrderArgs[] memory args)
        external
        returns (
            uint256[] memory principalAmounts,
            uint256[] memory collateralAmounts
        );

    function cancelOrder(Orders.Order memory order) external;

    function cancelMarginOrder(MarginOrders.Order memory order) external;

    function deposit(address to) external payable;

    function withdraw(uint256 amount) external;

    function setMinFee(uint256 _minFee) external;

    function setRelayerFee(uint256 _relayerFeePercent) external;

    function allCanceledHashes() external view returns (bytes32[] memory);

    function checkFilledAmountHashes(bytes32[] memory hashes)
        external
        view
        returns (FilledAmountCheck[] memory);

    function checkCanceledHashes(bytes32[] memory hashes)
        external
        view
        returns (CanceledCheck[] memory);
}
