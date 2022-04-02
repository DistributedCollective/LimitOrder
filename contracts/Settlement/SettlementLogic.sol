// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "./SettlementStorage.sol";
import "../interfaces/ISovrynLoanToken.sol";
import "../libraries/openzeppelin/SafeMath.sol";
import "../interfaces/IERC20.sol";
import "../libraries/openzeppelin/SafeERC20.sol";
import "../interfaces/IWrbtcERC20.sol";
import "../libraries/Orders.sol";
import "../libraries/MarginOrders.sol";
import "../libraries/EIP712.sol";
import "../libraries/RSKAddrValidator.sol";
import "../interfaces/ISettlement.sol";
import "../interfaces/IPriceFeeds.sol";
import "../interfaces/ISovrynSwapNetwork.sol";

contract SettlementLogic is ISettlement, SettlementStorage {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Orders for Orders.Order;
    using MarginOrders for MarginOrders.Order;

    /**
     * @notice Replace constructor with initialize function for Upgradable Contracts
     * This function will be called only once by the owner
     * @param orderBookChainId Chain Id
     * @param _orderBookAddress OrderBook proxy address
     * @param _marginOrderBookAddress Margin OrderBook proxy address
     * @param _sovrynSwapNetwork SovrynSwapNetwork address
     * @param _WRBTC wRBTC address
     * */
    function initialize(
        uint256 orderBookChainId,
        address _orderBookAddress,
        address _marginOrderBookAddress,
        address _sovrynSwapNetwork,
        address _priceFeeds,
        address _WRBTC
    ) external onlyOwner initializer {
        DOMAIN_SEPARATOR1 = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("OrderBook"),
                keccak256("1"),
                orderBookChainId,
                _orderBookAddress
            )
        );
        DOMAIN_SEPARATOR2 = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
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
        setRelayerFee(2e17); // Relayer fee percent = 0.2

        // min fee = tx fee + 50%
        uint256 _minSwapOrderTxFee = tx.gasprice.mul(800000).mul(3).div(2);
        uint256 _minMarginOrderTxFee = tx.gasprice.mul(1800000).mul(3).div(2);
        setMinSwapOrderTxFee(_minSwapOrderTxFee);
        setMinMarginOrderTxFee(_minMarginOrderTxFee);
        setPriceFeeds(_priceFeeds);
    }

    /**
     * @notice Fallback function to receive tokens.
     * */
    receive() external payable {
        if (msg.sender != WRBTC_ADDRESS) {
            deposit(msg.sender);
        }
    }

    /**
     * @notice User deposits a balance to the contract.
     * @param to Receiver of the funds.
     * */
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

    /**
     * @notice Withdraw user balance.
     * @param amount Amount to be withdrawn.
     * */
    function withdraw(uint256 amount) public override {
        address payable receiver = msg.sender;
        require(balanceOf[receiver] >= amount, "insufficient-balance");
        balanceOf[receiver] -= amount;
        (bool success, ) = receiver.call{value: amount}("");
        require(success, "failed-to-transfer");
        emit Withdrawal(receiver, amount);
    }

    /**
     * @notice Sets relayer fee.
     * @param _relayerFeePercent Relayer fee percentage.
     * */
    function setRelayerFee(uint256 _relayerFeePercent)
        public
        override
        onlyOwner
    {
        require(_relayerFeePercent <= 1e20, "value too high");
        uint256 oldValue = relayerFeePercent;
        relayerFeePercent = _relayerFeePercent;

        emit SetRelayerFee(msg.sender, oldValue, relayerFeePercent);
    }

    /**
     * @notice Set minimum tx fee for swap order.
     * @param _newGas New minimum txn gas price for spot limit orders.
     * */
    function setMinSwapOrderTxFee(uint256 _newGas) public override onlyOwner {
        uint256 oldValue = minSwapOrderTxFee;
        minSwapOrderTxFee = _newGas;

        emit SetMinSwapOrderTxFee(msg.sender, oldValue, minSwapOrderTxFee);
    }

    /**
     * @notice Set minimum tx fee for margin order.
     * @param _newGas New minimum txn gas price for margin limit orders.
     * */
    function setMinMarginOrderTxFee(uint256 _newGas) public override onlyOwner {
        uint256 oldValue = minMarginOrderTxFee;
        minMarginOrderTxFee = _newGas;

        emit SetMinMarginOrderTxFee(msg.sender, oldValue, minMarginOrderTxFee);
    }

    /**
     * @notice Set min swap order size.
     * @param _minSwapOrderSize New minimum spot limit order size.
     * @dev Initially set to 100$ in mainnet.
     * */
    function setMinSwapOrderSize(uint256 _minSwapOrderSize)
        public
        override
        onlyOwner
    {
        uint256 oldValue = minSwapOrderSize;
        minSwapOrderSize = _minSwapOrderSize;

        emit SetMinSwapOrderSize(msg.sender, oldValue, minSwapOrderSize);
    }

    /**
     * @notice Set min margin order size.
     * @param _minMarginOrderSize New minimum margin limit order size.
     * @dev Initially set to 200$ in mainnet.
     * */
    function setMinMarginOrderSize(uint256 _minMarginOrderSize)
        public
        override
        onlyOwner
    {
        uint256 oldValue = minMarginOrderSize;
        minMarginOrderSize = _minMarginOrderSize;

        emit SetMinMarginOrderSize(msg.sender, oldValue, minMarginOrderSize);
    }

    /**
     * @notice Set price feeds contract.
     * @param _priceFeeds New address of price feeds oracle.
     * */
    function setPriceFeeds(address _priceFeeds) public override onlyOwner {
        address oldValue = priceFeeds;
        priceFeeds = _priceFeeds;

        emit SetPriceFeeds(msg.sender, oldValue, priceFeeds);
    }

    /**
     * @notice Fills spot limit orders.
     * @param args FillOrderArgs struct.
     * @dev Fills an order by
     * swapping an exact amount of tokens for another token through the path passed as an argument.
     * Returns the amount of the final token.
     * Requires args.amountToFillIn to have already been approved to this.
     * */
    function fillOrder(FillOrderArgs memory args)
        public
        override
        returns (uint256 amountOut)
    {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        address[] memory path = args.path;
        require(args.order.fromToken == path[0], "invalid-path-0");
        require(
            args.order.toToken == path[path.length - 1],
            "invalid-path-last"
        );

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateStatus(args, hash);

        // Check if the signature is valid
        address signer = EIP712.recover(
            DOMAIN_SEPARATOR1,
            hash,
            args.order.v,
            args.order.r,
            args.order.s
        );

        require(
            RSKAddrValidator.safeEquals(signer, args.order.maker),
            "invalid-signature"
        );

        uint256 relayerFee = _checkAndGetRelayerFee(
            args.order.fromToken,
            args.order.amountIn,
            args.amountToFillIn,
            true
        );

        uint256 actualAmountIn = args.amountToFillIn.sub(relayerFee);

        uint256 swapbackReturn = ISovrynSwapNetwork(sovrynSwapNetwork)
            .rateByPath(
                path,
                actualAmountIn // There might be partial filling of orders
            );

        require(
            swapbackReturn >= args.amountToFillOut,
            "insufficient-amount-out"
        );

        _depositOrderAsset(args.order.maker, path[0], args.amountToFillIn);

        address recipient = args.order.recipient;
        if (path[path.length - 1] == WRBTC_ADDRESS) {
            //change recipient to settlement for unwrap rbtc after swapping
            recipient = address(this);
        }

        (
            address sourceToken,
            address targetToken,
            uint256 targetTokenAmount
        ) = swapInternal(path, actualAmountIn, args.amountToFillOut, recipient);

        // CEI Pattern
        filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(
            args.amountToFillIn
        );

        amountOut = targetTokenAmount;

        IERC20(path[0]).safeTransfer(msg.sender, relayerFee); //check this

        if (targetToken == WRBTC_ADDRESS) {
            //unwrap rbtc then transfer to recipient of order
            IWrbtcERC20(WRBTC_ADDRESS).withdraw(targetTokenAmount);
            (bool success, ) = args.order.recipient.call{
                value: targetTokenAmount
            }("");
            require(success, "Settlement: unable to send value");
        }

        emit Swap(
            address(sourceToken),
            address(targetToken),
            actualAmountIn,
            targetTokenAmount,
            msg.sender
        );

        emit FeeTransferred(hash, msg.sender, relayerFee, path[0]);

        uint256 _filledPrice = amountOut.mul(1e18).div(actualAmountIn);

        emit OrderFilled(
            hash,
            args.order.maker,
            actualAmountIn,
            amountOut,
            path,
            _filledPrice
        );
    }

    /**
     * @notice Fills multiple spot limit orders passed as an array.
     * @param args Array of FillOrderArgs struct.
     * @dev Useful for batch processing of spot limit orders.
     * */
    function fillOrders(FillOrderArgs[] memory args)
        public
        override
        returns (uint256[] memory amountsOut)
    {
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

    /**
     * @notice Fills a limit margin order.
     * @param args Array of FillOrderArgs struct.
     * @dev This function is called by the relayer.
     * */
    function fillMarginOrder(FillMarginOrderArgs memory args)
        public
        override
        returns (uint256 principalAmount, uint256 collateralAmount)
    {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateMarginStatus(args, hash);

        address trader = args.order.trader;

        // Check if the signature is valid
        address signer = EIP712.recover(
            DOMAIN_SEPARATOR2,
            hash,
            args.order.v,
            args.order.r,
            args.order.s
        );
        require(
            RSKAddrValidator.safeEquals(signer, trader),
            "invalid-signature"
        );

        (
            uint256 relayerFee,
            uint256 relayerFeeOnLoanAsset,
            uint256 actualCollateralAmount,
            uint256 actualLoanTokenAmount
        ) = _calculateMarginOrderFee(args.order);

        IERC20 collateralToken = IERC20(args.order.collateralTokenAddress);
        address _loanTokenAsset = ISovrynLoanToken(args.order.loanTokenAddress)
            .loanTokenAddress();

        if (args.order.collateralTokenSent > 0) {
            _depositOrderAsset(
                trader,
                args.order.collateralTokenAddress,
                args.order.collateralTokenSent
            );
        }

        if (args.order.loanTokenSent > 0) {
            _depositOrderAsset(
                trader,
                _loanTokenAsset,
                args.order.loanTokenSent
            );
        }

        (principalAmount, collateralAmount) = _marginTrade(
            args.order,
            _loanTokenAsset,
            actualLoanTokenAmount,
            actualCollateralAmount
        );

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
            emit FeeTransferred(
                hash,
                msg.sender,
                relayerFee,
                args.order.collateralTokenAddress
            );
        }
        if (relayerFeeOnLoanAsset > 0) {
            IERC20(_loanTokenAsset).safeTransfer(
                msg.sender,
                relayerFeeOnLoanAsset
            );
            emit FeeTransferred(
                hash,
                msg.sender,
                relayerFeeOnLoanAsset,
                _loanTokenAsset
            );
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

    /**
     * @notice Fills multiple margin limit orders passed as an array.
     * @param args Array of FillMarginOrderArgs struct.
     * @dev Useful for batch processing of margin limit orders.
     * */
    function fillMarginOrders(FillMarginOrderArgs[] memory args)
        public
        override
        returns (
            uint256[] memory principalAmounts,
            uint256[] memory collateralAmounts
        )
    {
        bool filled = false;
        principalAmounts = new uint256[](args.length);
        collateralAmounts = new uint256[](args.length);
        for (uint256 i = 0; i < args.length; i++) {
            (principalAmounts[i], collateralAmounts[i]) = fillMarginOrder(
                args[i]
            );
            if (principalAmounts[i] > 0) {
                // At least one order was filled
                filled = true;
            }
        }
        require(filled, "no-order-filled");
    }

    /**
     * @notice Cancels a spot limit order, has to be called by order maker.
     * @param order The spot limit order details.
     * */
    function cancelOrder(Orders.Order memory order) public override {
        bytes32 hash = order.hash();
        require(msg.sender == order.maker, "not-called-by-maker");

        canceledOfHash[hash] = true;
        canceledHashes.push(hash);

        _checkWithdrawalOnCancel(order.fromToken, order.amountIn);

        emit OrderCanceled(hash, order.maker);
    }

    /**
     * @notice Cancels a margin limit order, has to be called by order trader.
     * @param order The margin limit order details.
     * */
    function cancelMarginOrder(MarginOrders.Order memory order)
        public
        override
    {
        bytes32 hash = order.hash();
        require(msg.sender == order.trader, "not-called-by-maker");

        if (order.collateralTokenSent > 0) {
            _checkWithdrawalOnCancel(
                order.collateralTokenAddress,
                order.collateralTokenSent
            );
        }

        if (order.loanTokenSent > 0) {
            address _loanTokenAsset = ISovrynLoanToken(order.loanTokenAddress)
                .loanTokenAddress();
            _checkWithdrawalOnCancel(_loanTokenAsset, order.loanTokenSent);
        }

        canceledOfHash[hash] = true;
        canceledHashes.push(hash);

        emit MarginOrderCanceled(hash, order.trader);
    }

    /**
     * @notice Checks if an order is canceled/already fully filled for spot
     * limit order trades.
     * @param args FillOrderArgs struct.
     * @param hash Hash of order struct.
     * */
    function _validateStatus(FillOrderArgs memory args, bytes32 hash)
        internal
        view
    {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[hash], "order-canceled");
        require(
            filledAmountInOfHash[hash].add(args.amountToFillIn) <=
                args.order.amountIn,
            "already-filled"
        );
    }

    /**
     * @notice Checks if an order is canceled/already fully filled for margin
     * limit order trades.
     * @param args FillMarginOrderArgs struct.
     * @param hash Hash of margin order struct.
     * */
    function _validateMarginStatus(
        FillMarginOrderArgs memory args,
        bytes32 hash
    ) internal view {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[hash], "order-canceled");
        require(filledAmountInOfHash[hash] == 0, "already-filled");
    }

    /**
     * @notice Internal function that initiates the margin trade for limit orders.
     * @param order Margin order details.
     * @param loanTokenAsset Loan token asset address.
     * @param actualLoanTokenAmount Loan token amount.
     * @param actualCollateralAmount Collateral token amount.
     * @return principalAmount Principal amount.
     * @return collateralAmount Collateral amount.
     * */
    function _marginTrade(
        MarginOrders.Order memory order,
        address loanTokenAsset,
        uint256 actualLoanTokenAmount,
        uint256 actualCollateralAmount
    ) internal returns (uint256 principalAmount, uint256 collateralAmount) {
        address loanTokenAdr = order.loanTokenAddress;

        if (actualLoanTokenAmount > 0) {
            _checkAllowance(
                loanTokenAsset,
                loanTokenAdr,
                actualLoanTokenAmount
            );
        }

        if (actualCollateralAmount > 0) {
            _checkAllowance(
                order.collateralTokenAddress,
                loanTokenAdr,
                actualCollateralAmount
            );
        }

        bytes memory data = abi.encodeWithSignature(
            "marginTrade(bytes32,uint256,uint256,uint256,address,address,uint256,bytes)",
            order.loanId, /// 0 if new loan
            order.leverageAmount, /// Expected in x * 10**18 where x is the actual leverage (2, 3, 4, or 5).
            actualLoanTokenAmount,
            actualCollateralAmount,
            order.collateralTokenAddress,
            order.trader,
            order.minEntryPrice, // minimum position size in the collateral tokens
            order.loanDataBytes /// Arbitrary order data.
        );
        (bool success, bytes memory result) = loanTokenAdr.call(data);
        if (!success) {
            if (result.length == 0) revert();
            assembly {
                revert(add(32, result), mload(result))
            }
        }

        (principalAmount, collateralAmount) = abi.decode(
            result,
            (uint256, uint256)
        );
    }

    /**
     * @notice Internal function to calculate fee for margin limit order.
     * @param order MarginOrder struct.
     * @return relayerFee Relayer Fee
     * @return relayerFeeOnLoanAsset Relayer fee on loan asset.
     * @return actualCollateralAmount Actual Collateral Amount.
     * @return actualLoanTokenAmount Actual Loan Token Amount.
     * */
    function _calculateMarginOrderFee(MarginOrders.Order memory order)
        internal
        view
        returns (
            uint256 relayerFee,
            uint256 relayerFeeOnLoanAsset,
            uint256 actualCollateralAmount,
            uint256 actualLoanTokenAmount
        )
    {
        address _loanTokenAsset = ISovrynLoanToken(order.loanTokenAddress)
            .loanTokenAddress();

        if (order.loanTokenSent > 0 && order.collateralTokenSent > 0) {
            (uint256 _rate, uint256 _precision) = IPriceFeeds(priceFeeds)
                .queryRate(_loanTokenAsset, order.collateralTokenAddress);

            uint256 _convertedLoanTokenSent = order
                .loanTokenSent
                .mul(_rate)
                .div(_precision);

            uint256 _orderSizeInColl = order.collateralTokenSent +
                _convertedLoanTokenSent;

            relayerFee = _checkAndGetRelayerFee(
                order.collateralTokenAddress,
                _orderSizeInColl,
                _orderSizeInColl,
                false
            );

            if (relayerFee > order.collateralTokenSent) {
                uint256 _outstandingFee = relayerFee -
                    order.collateralTokenSent;
                relayerFee = order.collateralTokenSent;
                relayerFeeOnLoanAsset = _outstandingFee.mul(_precision).div(
                    _rate
                );
            }
        } else if (order.loanTokenSent > 0) {
            relayerFeeOnLoanAsset = _checkAndGetRelayerFee(
                _loanTokenAsset,
                order.loanTokenSent,
                order.loanTokenSent,
                false
            );
        } else if (order.collateralTokenSent > 0) {
            relayerFee = _checkAndGetRelayerFee(
                order.collateralTokenAddress,
                order.collateralTokenSent,
                order.collateralTokenSent,
                false
            );
        } else {
            revert("Invalid loanTokenSent and collateralTokenSent");
        }

        actualCollateralAmount = order.collateralTokenSent.sub(relayerFee);
        actualLoanTokenAmount = order.loanTokenSent.sub(relayerFeeOnLoanAsset);
    }

    /**
     * @notice Internal function to calculate relayer fee for both spot
     * and margin limit order.
     * @param fromToken The from token address.
     * @param orderSize Total order size.
     * @param amountToFill Amount to fill for patial orders.
     * @param isSpot True - Spot, False - Margin.
     * @return relayerFee Relayer fee.
     * */
    function _checkAndGetRelayerFee(
        address fromToken,
        uint256 orderSize,
        uint256 amountToFill,
        bool isSpot
    ) internal view returns (uint256 relayerFee) {
        uint256 estOrderFee = amountToFill.mul(relayerFeePercent).div(1e20); // 0.2% of amount to fill
        uint256 minFeeAmount = isSpot ? minSwapOrderTxFee : minMarginOrderTxFee; // Checks for the minimum fee
        uint256 minFeeAmountInToken = minFeeAmount;
        uint256 fillAmountInRBtc = amountToFill; // Partial Order possible - in tokens
        uint256 orderSizeInRBtc = orderSize;

        // Converts rBTC to tokens to calculate the equivalent minimum fee
        if (fromToken != WRBTC_ADDRESS) {
            (uint256 _rate, uint256 _precision) = IPriceFeeds(priceFeeds)
                .queryRate(WRBTC_ADDRESS, fromToken);
            minFeeAmountInToken = minFeeAmount.mul(_rate).div(_precision); // rBTC -> Token
            fillAmountInRBtc = amountToFill.mul(_precision).div(_rate); // Token -> rBTC
            orderSizeInRBtc = orderSize.mul(_precision).div(_rate); // Token -> rBTC
        }

        // If 0.2% of order(spot/margin) is less than minimum fee(spot/margin) -> pay minimum fee.
        if (estOrderFee < minFeeAmountInToken) {
            require(
                amountToFill > minFeeAmountInToken,
                "Order amount is too low to pay the relayer fee"
            );
            require(
                orderSize == amountToFill,
                "the entire order must be filled" // Partial filling not allowed in this case
            );
            relayerFee = minFeeAmountInToken; // Minimum fee(Spot/Margin)
        } else {
            // 0.2% of order is greater than minimum fee
            uint256 minFillingAmount = isSpot // Checks minimum order size for spot/margin
                ? minSwapOrderSize
                : minMarginOrderSize;

            // If an order is partially filled, the remaining amount should be bigger than the minSize
            require(
                orderSizeInRBtc == fillAmountInRBtc || // Complete filling
                    orderSizeInRBtc.sub(fillAmountInRBtc) >= minFillingAmount, // Partial Order - remaining amount >= minSize
                "Filling amount is too low"
            );
            relayerFee = estOrderFee; // 0.2% of orders(spot/margin)
        }
    }

    /**
     * @notice Internal function to deposit asset to the settlements contract.
     * @param owner The owner address.
     * @param assetAddress Token address.
     * @param amount Amount to be deposited.
     * */
    function _depositOrderAsset(
        address owner,
        address assetAddress,
        uint256 amount
    ) internal {
        if (assetAddress == WRBTC_ADDRESS) {
            IWrbtcERC20 wrbtc = IWrbtcERC20(WRBTC_ADDRESS);
            require(balanceOf[owner] >= amount, "insufficient-balance");
            balanceOf[owner] -= amount;
            wrbtc.deposit{value: amount}();
        } else {
            IERC20(assetAddress).safeTransferFrom(owner, address(this), amount);
        }
    }

    /**
     * @notice Internal function to withdraw asset.
     * @param token The token address.
     * @param amount Amount to be withdrawn.
     * */
    function _checkWithdrawalOnCancel(address token, uint256 amount) internal {
        if (token == WRBTC_ADDRESS && balanceOf[msg.sender] >= amount) {
            withdraw(amount);
        }
    }

    /**
     * @notice Checks allowance of settlement contract for spending token,
     * if allowance < needed, approve unlimited amount.
     * @param tokenAdr The token address.
     * @param spender Address of the spender.
     * @param amount Amount to be approved.
     * */
    function _checkAllowance(
        address tokenAdr,
        address spender,
        uint256 amount
    ) internal {
        IERC20 token = IERC20(tokenAdr);
        uint256 allowance = token.allowance(address(this), spender);
        if (allowance < amount) {
            token.approve(spender, UNLIMITED_ALLOWANCE);
        }
    }

    /**
     * @notice Checks the amount returned from the token swap.
     * @param _conversionPath The path - from and to token.
     * @param _amount Amount of token.
     * @param _minReturn Minimum swap return expected.
     * @param _receiver The token address of receiver.
     * @return sourceToken Address of source token.
     * @return targetToken Address of target token.
     * @return targetTokenAmount Amount of target token received.
     * */
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
        require(
            _conversionPath.length >= 2,
            "Limit: _conversionPath must contain at least 2 tokens"
        );

        sourceToken = _conversionPath[0];
        targetToken = _conversionPath[_conversionPath.length - 1];
        require(
            sourceToken != targetToken,
            "Limit: sourceToken and targetToken cannot be the same"
        );

        _checkAllowance(sourceToken, sovrynSwapNetwork, _amount);

        targetTokenAmount = ISovrynSwapNetwork(sovrynSwapNetwork).convertByPath(
                _conversionPath,
                _amount,
                _minReturn, // minReturn
                _receiver, // beneficiary
                address(0), // affiliateAccount
                0 // affiliateFee
            );
    }

    /**
     * @notice Returns list of all cancelled hashes.
     * @return canceledHashes Hashes of cancelled orders.
     * */
    function allCanceledHashes()
        public
        view
        override
        returns (bytes32[] memory)
    {
        return canceledHashes;
    }

    /**
     * @notice Returns the order hashes and the cancelled flag.
     * @return result Returns an array of struct with hashes and cancellation flag.
     * */
    function checkCanceledHashes(bytes32[] memory hashes)
        public
        view
        override
        returns (CanceledCheck[] memory result)
    {
        result = new CanceledCheck[](hashes.length);
        for (uint256 i = 0; i < hashes.length; i++) {
            bytes32 hash = hashes[i];
            result[i] = CanceledCheck(hash, canceledOfHash[hash]);
        }
    }

    /**
     * @notice Returns the filled orders and the respective amounts.
     * @return result Returns an array of struct with hashes and amount filled.
     * */
    function checkFilledAmountHashes(bytes32[] memory hashes)
        public
        view
        override
        returns (FilledAmountCheck[] memory result)
    {
        result = new FilledAmountCheck[](hashes.length);
        for (uint256 i = 0; i < hashes.length; i++) {
            bytes32 hash = hashes[i];
            result[i] = FilledAmountCheck(hash, filledAmountInOfHash[hash]);
        }
    }
}
