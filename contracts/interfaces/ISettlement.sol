// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/Orders.sol";
import "../libraries/MarginOrders.sol";

interface ISettlement {
    /// @notice Emitted when a relayer fee percentage is set
    event SetRelayerFee(
        address indexed sender,
        uint256 oldValue,
        uint256 newValue
    );
    /// @notice Emitted when minimum swap order transaction fee is set
    event SetMinSwapOrderTxFee(
        address indexed sender,
        uint256 oldValue,
        uint256 newValue
    );
    /// @notice Emitted when minimum margin order transaction fee is set
    event SetMinMarginOrderTxFee(
        address indexed sender,
        uint256 oldValue,
        uint256 newValue
    );
    /// @notice Emitted when minimum swap order size is set
    event SetMinSwapOrderSize(
        address indexed sender,
        uint256 oldValue,
        uint256 newValue
    );
    /// @notice Emitted when minimum margin order size is set
    event SetMinMarginOrderSize(
        address indexed sender,
        uint256 oldValue,
        uint256 newValue
    );
    /// @notice Emitted when price feeds contract is set
    event SetPriceFeeds(
        address indexed sender,
        address oldValue,
        address newValue
    );
    /// @notice Emitted when swap/spot order is filled
    event OrderFilled(
        bytes32 indexed hash, // Order Hash
        address indexed maker, // User
        uint256 amountIn, // Amount In
        uint256 amountOut, // Amount Out
        address[] path, // Holds the conversion path between from/to tokens
        uint256 filledPrice // Price at which the order got filled
    );
    /// @notice Emitted when spot limit order is cancelled
    event OrderCanceled(bytes32 indexed hash, address indexed maker);
    /// @notice Emitted when fees is transferred to the relayer
    event FeeTransferred(
        bytes32 indexed hash,
        address indexed recipient,
        uint256 amount,
        address token
    );
    /// @notice Emitted when margin order is filled
    event MarginOrderFilled(
        bytes32 indexed hash, // Order Hash
        address indexed trader, // Trader
        uint256 principal, // Principal
        uint256 collateral, // Collateral
        uint256 leverageAmount, // Leverage
        address loanTokenAddress, // iToken
        uint256 loanTokenSent, // Loan token amount
        uint256 collateralTokenSent, // Collateral token
        address collateralTokenAddress // Collateral token amount
    );
    /// @notice Emitted when margin limit order is cancelled
    event MarginOrderCanceled(bytes32 indexed hash, address indexed trader);
    event Swap(
        address indexed _sourceToken,
        address indexed _targetToken,
        uint256 _sourceTokenAmount,
        uint256 _targetTokenAmount,
        address _sender
    );
    /// @notice Emitted when margin trade is executed
    event MarginTrade(
        address indexed loanTokenAddress,
        address indexed collateralTokenAddress,
        uint256 leverageAmount,
        uint256 collateralTokenSent,
        uint256 principalAmount,
        uint256 collateralAmount,
        address trader
    );
    /// @notice Emitted when balance is deposited
    event Deposit(address to, uint256 amount);
    /// @notice Emitted when balance is withdrawn
    event Withdrawal(address receiver, uint256 amount);

    /// @notice Used by the relayer to fill spot order
    struct FillOrderArgs {
        Orders.Order order; // Order object
        uint256 amountToFillIn; // Amount to fill in
        uint256 amountToFillOut; // Amount to fill out
        address[] path; // Conversion path between from/to tokens
    }

    /// @notice Used by the relayer to fill margin order
    struct FillMarginOrderArgs {
        MarginOrders.Order order;
    }

    /// @notice Used to check the cancelled orders
    struct CanceledCheck {
        bytes32 hash;
        bool canceled;
    }

    /// @notice Used to check the amount filled for an order
    struct FilledAmountCheck {
        bytes32 hash;
        uint256 amount;
    }

    /// @notice Fills spot limit orders.
    function fillOrder(FillOrderArgs calldata args)
        external
        returns (uint256 amountOut);

    /// @notice Fills multiple spot limit orders passed as an array.
    function fillOrders(FillOrderArgs[] memory args)
        external
        returns (uint256[] memory amountsOut);

    /// @notice Fills margin limit orders.
    function fillMarginOrder(FillMarginOrderArgs calldata args)
        external
        returns (uint256 principalAmount, uint256 collateralAmount);

    /// @notice Fills multiple margin limit orders passed as an array.
    function fillMarginOrders(FillMarginOrderArgs[] memory args)
        external
        returns (
            uint256[] memory principalAmounts,
            uint256[] memory collateralAmounts
        );

    /// @notice Cancels a spot limit order, has to be called by order maker.
    function cancelOrder(Orders.Order memory order) external;

    /// @notice Cancels a margin limit order, has to be called by order trader.
    function cancelMarginOrder(MarginOrders.Order memory order) external;

    /// @notice User deposits a balance to the contract.
    function deposit(address to) external payable;

    /// @notice Withdraw user balance.
    function withdraw(uint256 amount) external;

    /// @notice Sets relayer fee.
    function setRelayerFee(uint256 _relayerFeePercent) external;

    /// @notice Set minimum tx fee for swap order.
    function setMinSwapOrderTxFee(uint256 _newGas) external;

    /// @notice Set minimum tx fee for margin order.
    function setMinMarginOrderTxFee(uint256 _newGas) external;

    /// @notice Set min swap order size.
    function setMinSwapOrderSize(uint256 _minSwapOrderSize) external;

    /// @notice Set min margin order size.
    function setMinMarginOrderSize(uint256 _minMarginOrderSize) external;

    /// @notice Set price feeds contract.
    function setPriceFeeds(address _priceFeeds) external;

    /// @notice Returns list of all cancelled hashes.
    function allCanceledHashes() external view returns (bytes32[] memory);

    /// @notice Returns the filled orders and the respective amounts.
    function checkFilledAmountHashes(bytes32[] memory hashes)
        external
        view
        returns (FilledAmountCheck[] memory);

    /// @notice Returns the order hashes and the cancelled flag.
    function checkCanceledHashes(bytes32[] memory hashes)
        external
        view
        returns (CanceledCheck[] memory);
}
