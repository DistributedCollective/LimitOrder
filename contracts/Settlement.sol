// SPDX-License-Identifier: MIT
pragma solidity = 0.6.12;
pragma experimental ABIEncoderV2;

import "./interfaces/ISovrynSwapNetwork.sol";
import "./interfaces/ISovrynLoanToken.sol";
import "./libraries/openzeppelin/SafeMath.sol";
import "./libraries/openzeppelin/SafeERC20.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWrbtcERC20.sol";
import "./interfaces/ISettlement.sol";
import "./libraries/Orders.sol";
import "./libraries/MarginOrders.sol";
import "./libraries/EIP712.sol";
import "./libraries/RSKAddrValidator.sol";
import "./OrderBook.sol";
import "./OrderBookMargin.sol";

//todo: remove after testing
// import "hardhat/console.sol";


contract Settlement is ISettlement {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Orders for Orders.Order;
    using MarginOrders for MarginOrders.Order;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 public immutable DOMAIN_SEPARATOR1;
    bytes32 public immutable DOMAIN_SEPARATOR2;

    // Hash of an order => if canceled
    mapping(bytes32 => bool) public canceledOfHash;
    bytes32[] internal canceledHashes;
    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;
    // Hash of user balance
    mapping(address => uint256) public balanceOf;

    address public immutable RBTC_ADDRESS = address(0);
    address public WRBTC_ADDRESS;
  
    ISovrynSwapNetwork public sovrynSwapNetwork;
    address public orderBookAddress;
    address public orderBookMarginAddress;

    uint256 public relayerFeePercent = 2;
    uint256 public minFee = 0; //in wrbtc

    constructor(
        uint256 orderBookChainId,
        address _orderBookAddress,
        address _marginOrderBookAddress,
        ISovrynSwapNetwork _sovrynSwapNetwork,
        address _WRBTC
    ) public {
        DOMAIN_SEPARATOR1 = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("OrderBook"),
                keccak256("1"),
                orderBookChainId,
                _orderBookAddress
            )
        );
        DOMAIN_SEPARATOR2 = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("OrderBookMargin"),
                keccak256("1"),
                orderBookChainId,
                _marginOrderBookAddress
            )
        );

        sovrynSwapNetwork = _sovrynSwapNetwork;
        WRBTC_ADDRESS = _WRBTC;
        orderBookAddress = _orderBookAddress;
        orderBookMarginAddress = _marginOrderBookAddress;
    }

    receive() external payable {
        if (msg.sender != WRBTC_ADDRESS) {
            deposit(msg.sender);
        }
    }

    function deposit(address to) public payable override {
        uint256 amount = msg.value;
        require(amount > 0, "deposit-amount-required");
        address receiver = msg.sender;
        if (to != address(0)) {
            receiver = to;
        }
        balanceOf[receiver] += amount;
        emit Deposit(to, amount);
    }

    function withdraw(uint256 amount) public override {
        address payable receiver = msg.sender;
        require(balanceOf[receiver] >= amount, "insufficient-balance");
        balanceOf[receiver] -= amount;
        (bool success, ) = receiver.call{value: amount}("");
        require(success, "failed-to-transfer");
        emit Withdrawal(receiver, amount);
    }

    function setMinFee(uint256 fee) public override {
        minFee = fee;
    }
    
    // Fills an order by
    // swapping an exact amount of tokens for another token through the path passed as an argument
    // Returns the amount of the final token
    // Requires args.amountToFillIn to have already been approved to this
    function fillOrder(FillOrderArgs memory args) public override returns (uint256 amountOut) {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        address[] memory path = args.path;
        require(args.order.fromToken == path[0], "invalid-path-0");
        require(args.order.toToken == path[path.length - 1], "invalid-path-last");

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateStatus(args, hash);

        // Check if the signature is valid
        address signer = EIP712.recover(DOMAIN_SEPARATOR1, hash, args.order.v, args.order.r, args.order.s);
        require(RSKAddrValidator.safeEquals(signer, args.order.maker), "invalid-maker-signature");

        uint256 relayerFee = args.order.amountIn.mul(relayerFeePercent).div(1000);
        _checkRelayerFee(relayerFee, args.order.fromToken);

        uint256 actualAmountIn = args.order.amountIn.sub(relayerFee);

        uint256 swapbackReturn = sovrynSwapNetwork.rateByPath(path, args.order.amountIn);
       
        require(swapbackReturn >= args.order.amountOutMin, "insufficient-amount-out");

        IWrbtcERC20 wrbtc = IWrbtcERC20(WRBTC_ADDRESS);
        if (path[0] == WRBTC_ADDRESS) {
            require(balanceOf[args.order.maker] >= args.order.amountIn, "insufficient-balance");
            wrbtc.deposit{value: args.order.amountIn}();
            balanceOf[args.order.maker] -= args.order.amountIn;
        } else {
            IERC20(path[0]).safeTransferFrom(args.order.maker, address(this), args.order.amountIn);
        }


        address recipient = args.order.recipient;
        if (path[path.length - 1] == WRBTC_ADDRESS) {
            //change recipient to settlement for unwrap rbtc after swapping
            recipient = address(this);
        }

        (address sourceToken, address targetToken, uint256 targetTokenAmount) = swapInternal(
            path,
            actualAmountIn,
            args.order.amountOutMin,
            recipient
        );

        IERC20(path[0]).safeTransfer(msg.sender, relayerFee);//check this

        if (targetToken == WRBTC_ADDRESS) {
            //unwrap rbtc then transfer to recipient of order
            wrbtc.withdraw(targetTokenAmount);
            args.order.recipient.call{value: targetTokenAmount}("");
        }
      
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

        emit OrderFilled(hash, args.order.maker, args.amountToFillIn, amountOut, path);
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

    //
    function fillMarginOrder(FillMarginOrderArgs memory args) public override returns (uint256 principalAmount, uint256 collateralAmount) {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateMarginStatus(args, hash);

        address trader = args.order.trader;

        // Check if the signature is valid
        address signer = EIP712.recover(DOMAIN_SEPARATOR2, hash, args.order.v, args.order.r, args.order.s);
        require(RSKAddrValidator.safeEquals(signer, trader), "invalid-signature");

        (
            uint256 relayerFee,
            uint256 relayerFeeOnLoanAsset,
            uint256 actualCollateralAmount,
            uint256 actualLoanTokenAmount
        ) = _calculateMarginOrderFee(args.order);

        IERC20 collateralToken = IERC20(args.order.collateralTokenAddress);
        address _loanTokenAsset = ISovrynLoanToken(args.order.loanTokenAddress).loanTokenAddress();
        collateralToken.transferFrom(trader, address(this), args.order.collateralTokenSent);
        if (args.order.loanTokenSent > 0) {
            IERC20(_loanTokenAsset).safeTransferFrom(trader, address(this), args.order.loanTokenSent);
        }

        (principalAmount, collateralAmount) = _marginTrade(args.order, actualLoanTokenAmount, actualCollateralAmount);

        emit MarginTrade(
            address(args.order.loanTokenAddress),
            address(args.order.collateralTokenAddress),
            args.order.leverageAmount,
            actualCollateralAmount,
            principalAmount,
            collateralAmount,
            trader
        );

        // Transfer fee for relayer
        if (relayerFee > 0) {
            collateralToken.safeTransfer(msg.sender, relayerFee);
        }
        if (relayerFeeOnLoanAsset > 0) {
            IERC20(_loanTokenAsset).safeTransfer(msg.sender, relayerFeeOnLoanAsset);
        }

        // This line is free from reentrancy issues since UniswapV2Pair prevents from them
        filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(
            args.order.collateralTokenSent + args.order.loanTokenSent
        );

        MarginOrders.Order memory order = args.order;

        emit MarginOrderFilled(
            hash,
            order.trader,
            principalAmount,
            collateralAmount,
            order.leverageAmount,
            order.loanTokenAddress,
            order.loanTokenSent,
            order.collateralTokenSent,
            order.collateralTokenAddress
        );
    }

    // Fills multiple margin orders passed as an array
    function fillMarginOrders(FillMarginOrderArgs[] memory args) public override
    returns (uint256[] memory principalAmounts, uint256[] memory collateralAmounts) 
    {
        bool filled = false;
        principalAmounts = new uint256[](args.length);
        collateralAmounts = new uint256[](args.length);
        for (uint256 i = 0; i < args.length; i++) {
            (principalAmounts[i], collateralAmounts[i]) = fillMarginOrder(args[i]);
            if (principalAmounts[i] > 0) {
                // At least one order was filled
                filled = true;
            }
        }
        require(filled, "no-order-filled");
    }

    // Checks if an order is canceled / already fully filled
    function _validateStatus(FillOrderArgs memory args, bytes32 hash) internal view {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[hash], "order-canceled");
        require(filledAmountInOfHash[hash].add(args.amountToFillIn) <= args.order.amountIn, "already-filled");
    }

    // Checks if an order is canceled / already fully filled
    function _validateMarginStatus(FillMarginOrderArgs memory args, bytes32 hash) internal view {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[hash], "order-canceled");
        require(filledAmountInOfHash[hash] == 0, "already-filled");
    }

    function _marginTrade(
        MarginOrders.Order memory order,
        uint256 actualLoanTokenAmount,
        uint256 actualCollateralAmount
    )
    internal 
    returns (
        uint256 principalAmount,
        uint256 collateralAmount
    ) {
        address loanTokenAdr = order.loanTokenAddress;
        IERC20(order.collateralTokenAddress).safeApprove(loanTokenAdr, actualCollateralAmount);
        if (actualLoanTokenAmount > 0) {
            address loanTokenAsset = ISovrynLoanToken(loanTokenAdr).loanTokenAddress();
            IERC20(loanTokenAsset).safeApprove(loanTokenAdr, actualLoanTokenAmount);
        }

        bytes memory data = abi.encodeWithSignature("marginTrade(bytes32,uint256,uint256,uint256,address,address,uint256,bytes)", 
            order.loanId, /// 0 if new loan
            order.leverageAmount, /// Expected in x * 10**18 where x is the actual leverage (2, 3, 4, or 5).
            actualLoanTokenAmount,
            actualCollateralAmount,
            order.collateralTokenAddress,
            order.trader,
            order.minReturn, // minimum position size in the collateral tokens
            order.loanDataBytes /// Arbitrary order data.
        );
        (bool success, bytes memory result) = loanTokenAdr.call(data);
        if (!success) {
            if (result.length == 0) revert();
            assembly {
                revert(add(32, result), mload(result))
            }
        }

        (principalAmount, collateralAmount) = abi.decode(result, (uint256, uint256));
    }

    function _calculateMarginOrderFee(MarginOrders.Order memory order) 
    internal
    returns (uint256 relayerFee,
        uint256 relayerFeeOnLoanAsset,
        uint256 actualCollateralAmount,
        uint256 actualLoanTokenAmount
    ) {
        uint256 _collateralTokenSent = order.collateralTokenSent;
        if (_collateralTokenSent > 0) {
            relayerFee = _collateralTokenSent.mul(relayerFeePercent).div(1000);
            actualCollateralAmount = _collateralTokenSent.sub(relayerFee);
        }

        uint256 _loanTokenSent = order.loanTokenSent;
        uint256 _feeLoanAssetByCollateral;
        if (_loanTokenSent > 0) {
            relayerFeeOnLoanAsset = _loanTokenSent.mul(relayerFeePercent).div(1000);
            actualLoanTokenAmount = _loanTokenSent.sub(relayerFeeOnLoanAsset);
            address[] memory _path = sovrynSwapNetwork.conversionPath(order.loanTokenAddress, order.collateralTokenAddress);
            _feeLoanAssetByCollateral = sovrynSwapNetwork.rateByPath(_path, relayerFeeOnLoanAsset);
        }

        _checkRelayerFee(relayerFee + _feeLoanAssetByCollateral, order.collateralTokenAddress);
    }

    function _checkRelayerFee(uint256 fee, address fromToken) internal {
        address[] memory path = sovrynSwapNetwork.conversionPath(fromToken, WRBTC_ADDRESS);
        uint256 feeInRbtc = sovrynSwapNetwork.rateByPath(path, fee);
        require(fee > minFee, "Order amount is too low to pay the relayer fee");
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
    function cancelOrder(Orders.Order memory order) public override {
        bytes32 hash = order.hash();
        address signer = EIP712.recover(DOMAIN_SEPARATOR1, hash, order.v, order.r, order.s);
        require(RSKAddrValidator.safeEquals(signer, order.maker), "invalid-signature");
        require(msg.sender == order.maker, "not-called-by-maker");

        canceledOfHash[hash] = true;
        canceledHashes.push(hash);

        emit OrderCanceled(hash, order.maker);
    }

    function cancelMarginOrder(MarginOrders.Order memory order) public override {
        bytes32 hash = order.hash();
        address signer = EIP712.recover(DOMAIN_SEPARATOR2, hash, order.v, order.r, order.s);
        require(RSKAddrValidator.safeEquals(signer, order.trader), "invalid-signature");
        require(msg.sender == order.trader, "not-called-by-maker");

        canceledOfHash[hash] = true;
        canceledHashes.push(hash);

        emit MarginOrderCanceled(hash, order.trader);
    }

    function allCanceledHashes() public view override returns (bytes32[] memory) {
        return canceledHashes;
    }

    function checkCanceledHashes(bytes32[] memory hashes) 
    public view override
    returns (CanceledCheck[] memory result) 
    {
        result = new CanceledCheck[](hashes.length);
        for(uint256 i = 0; i < hashes.length; i++) {
            bytes32 hash = hashes[i];
            result[i] = CanceledCheck(hash, canceledOfHash[hash]);
        }
    }

    function checkFilledAmountHashes(bytes32[] memory hashes)
    public view override
    returns (FilledAmountCheck[] memory result) 
    {
        result = new FilledAmountCheck[](hashes.length);
        for(uint256 i = 0; i < hashes.length; i++) {
            bytes32 hash = hashes[i];
            result[i] = FilledAmountCheck(hash, filledAmountInOfHash[hash]);
        }
    }
}
