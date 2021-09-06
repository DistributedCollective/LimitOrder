// SPDX-License-Identifier: MIT
pragma solidity = 0.6.12;
pragma experimental ABIEncoderV2;

import "./interfaces/ISovrynSwapNetwork.sol";
import "./interfaces/ISovrynLoanToken.sol";
import "./libraries/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ISettlement.sol";
import "./libraries/Orders.sol";
import "./libraries/MarginOrders.sol";
import "./libraries/EIP712.sol";

//todo: remove after testing
import "hardhat/console.sol";


contract Settlement is ISettlement {
    using SafeMath for uint256;
    using Orders for Orders.Order;
    using MarginOrders for MarginOrders.Order;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 public immutable DOMAIN_SEPARATOR1;
    bytes32 public immutable DOMAIN_SEPARATOR2;

    // Hash of an order => if canceled
    mapping(address => mapping(bytes32 => bool)) public canceledOfHash;
    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;

    address public immutable RBTC_ADDRESS = address(0);
  
    ISovrynSwapNetwork public sovrynSwapNetwork;
    ISovrynLoanToken public sovrynLoanToken;

    uint256 public relayerFeePercent = 2;

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


     constructor(
        uint256 orderBookChainId,
        address orderBookAddress,
        address marginOrderBookAddress,
        ISovrynSwapNetwork _sovrynSwapNetwork
    ) public {
        DOMAIN_SEPARATOR1 = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("OrderBook"),
                keccak256("1"),
                orderBookChainId,
                orderBookAddress
            )
        );
        DOMAIN_SEPARATOR2 = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("OrderBook"),
                keccak256("1"),
                orderBookChainId,
                marginOrderBookAddress
            )
        );

        sovrynSwapNetwork = _sovrynSwapNetwork;
    }

    
    // Fills an order by
    // swapping an exact amount of tokens for another token through the path passed as an argument
    // Returns the amount of the final token
    // Requires args.amountToFillIn to have already been approved to this
    function fillOrder(FillOrderArgs memory args) public override returns (uint256 amountOut) {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateStatus(args, hash);

        // Check if the signature is valid
        address signer = EIP712.recover(DOMAIN_SEPARATOR1, hash, args.order.v, args.order.r, args.order.s);
        require(signer != address(0) && signer == args.order.maker, "invalid-signature");

        // Calculates amountOutMin ??
        //uint256 amountOutMin = (args.order.amountOutMin.mul(args.amountToFillIn) / args.order.amountIn);

        uint256 swapbackReturn = sovrynSwapNetwork.rateByPath(args.path, args.order.amountIn);
       
        require(swapbackReturn >= args.order.amountOutMin, "insufficient-amount-out");
        
        IERC20(args.path[0]).transferFrom(args.order.maker, address(this), args.order.amountIn);

        uint256 relayerFee = args.order.amountIn.mul(relayerFeePercent).div(1000);
        uint256 actualAmountIn = args.order.amountIn.sub(relayerFee);

        (address sourceToken, address targetToken, uint256 targetTokenAmount) = swapInternal(
            args.path,
            actualAmountIn,
            args.order.amountOutMin,
            args.order.recipient
        );

        IERC20(args.path[0]).transfer(msg.sender, relayerFee);
      
        emit Swap(
            address(sourceToken),
            address(targetToken),
            actualAmountIn,
            targetTokenAmount,
            msg.sender
        );

        // This line is free from reentrancy issues since UniswapV2Pair prevents from them
        filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(args.amountToFillIn);

        amountOut = targetTokenAmount;

        emit OrderFilled(hash, args.amountToFillIn, amountOut);
    }

    //
    function fillMarginOrder(FillMarginOrderArgs memory args) public override returns (uint256 principalAmount, uint256 collateralAmount) {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateMarginStatus(args, hash);

        // Check if the signature is valid
        address signer = EIP712.recover(DOMAIN_SEPARATOR2, hash, args.order.v, args.order.r, args.order.s);
        require(signer != address(0) && signer == args.order.trader, "invalid-signature");

        IERC20(args.order.collateralTokenAddress).transferFrom(args.order.trader, address(this), args.order.collateralTokenSent);

        //@ha
        uint256 relayerFee = args.order.collateralTokenSent.mul(relayerFeePercent).div(1000);
        uint256 actualCollateralAmount = args.order.collateralTokenSent.sub(relayerFee);

        ISovrynLoanToken loanToken = ISovrynLoanToken(args.order.loanTokenAddress);
        ISovrynLoanToken.MarginTradeOrder memory loanOrder = ISovrynLoanToken.MarginTradeOrder(
            args.order.loanId,
            args.order.leverageAmount,
            args.order.loanTokenSent,
            actualCollateralAmount,
            args.order.collateralTokenAddress,
            args.order.trader,
            args.order.minReturn,
            args.order.loanDataBytes,
            args.order.createdTimestamp
        );
        (principalAmount, collateralAmount) = loanToken.marginTradeBySig(loanOrder, args.order.v, args.order.r, args.order.s);
      
        emit MarginTrade(
            address(args.order.loanTokenAddress),
            address(args.order.collateralTokenAddress),
            args.order.leverageAmount,
            actualCollateralAmount,
            principalAmount,
            collateralAmount,
            msg.sender
        );

        // This line is free from reentrancy issues since UniswapV2Pair prevents from them
        filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(args.order.collateralTokenSent);

        emit MarginOrderFilled(hash, principalAmount, collateralAmount);
    }

    // Checks if an order is canceled / already fully filled
    function _validateStatus(FillOrderArgs memory args, bytes32 hash) internal view {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[args.order.maker][hash], "order-canceled");
        require(filledAmountInOfHash[hash].add(args.amountToFillIn) <= args.order.amountIn, "already-filled");
    }

    // Checks if an order is canceled / already fully filled
    function _validateMarginStatus(FillMarginOrderArgs memory args, bytes32 hash) internal view {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[args.order.trader][hash], "order-canceled");
        require(filledAmountInOfHash[hash].add(args.order.collateralTokenSent) <= args.order.collateralTokenSent, "already-filled");
    }

    
    // internal functions
    function swapInternal(
        address[] memory _conversionPath,
        uint256 _amount,
        uint256 _minReturn,
        address _receiver
    )
    internal
    returns (
        address sourceToken,
        address targetToken,
        uint256 targetTokenAmount
    )
    {
        require(_conversionPath.length >= 2, "Limit: _conversionPath must contain at least 2 tokens");

        sourceToken = _conversionPath[0];
        targetToken = _conversionPath[_conversionPath.length - 1];
        require(sourceToken != targetToken, "Limit: sourceToken and targetToken cannot be the same");

        require(IERC20(sourceToken).approve(address(sovrynSwapNetwork), _amount), "Error approving token");

        targetTokenAmount = sovrynSwapNetwork.convertByPath(
            _conversionPath,
            _amount,
            _minReturn, // minReturn
            _receiver, // beneficiary
            address(0), // affiliateAccount
            0 // affiliateFee
        );
    }

     // Cancels an order, has to been called by order maker
    function cancelOrder(bytes32 hash) public override {
        canceledOfHash[msg.sender][hash] = true;

        emit OrderCanceled(hash);
    }

    // Fills multiple orders passed as an array
    function fillOrders(FillOrderArgs[] memory args) public override returns (uint256[] memory amountsOut) {
        bool filled = false;
        amountsOut = new uint256[](args.length);
        for (uint256 i = 0; i < args.length; i++) {
            // Returns zero of the order wasn't filled
            amountsOut[i] = fillOrder(args[i]);
            if (amountsOut[i] > 0) {
                // At least one order was filled
                filled = true;
            }
        }
        require(filled, "no-order-filled");
    }
}
