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
        ISovrynSwapNetwork _sovrynSwapNetwork,
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
        setRelayerFee(2 * 10**17); // Relayer fee percent = 0.2
        setSwapOrderGas(800000);
        setMarginOrderGas(1800000);
        setMinSwapOrderSize(100);
        setMinMarginOrderSize(100);
    }

    // Fallback function to receive tokens
    // TODO: Check for vulnerabilites if any
    receive() external payable {
        if (msg.sender != WRBTC_ADDRESS) {
            deposit(msg.sender);
        }
    }

    // User deposits a balance to the contract
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

    // Withdraw user balance
    function withdraw(uint256 amount) public override {
        address payable receiver = msg.sender;
        require(balanceOf[receiver] >= amount, "insufficient-balance");
        balanceOf[receiver] -= amount;
        (bool success, ) = receiver.call{value: amount}("");
        require(success, "failed-to-transfer");
        emit Withdrawal(receiver, amount);
    }

    // Sets relayer fee
    function setRelayerFee(uint256 _relayerFeePercent)
        public
        override
        onlyOwner
    {
        require(_relayerFeePercent <= 10**20, "value too high");
        uint256 oldValue = relayerFeePercent;
        relayerFeePercent = _relayerFeePercent;

        emit SetRelayerFee(msg.sender, oldValue, relayerFeePercent);
    }

    // Set max gas for swap order
    function setSwapOrderGas(uint256 _newGas) public override onlyOwner {
        uint256 oldValue = swapOrderGas;
        swapOrderGas = _newGas;

        emit SetSwapOrderGas(msg.sender, oldValue, swapOrderGas);
    }

    // Set max gas for margin order
    function setMarginOrderGas(uint256 _newGas) public override onlyOwner {
        uint256 oldValue = marginOrderGas;
        marginOrderGas = _newGas;

        emit SetMarginOrderGas(msg.sender, oldValue, marginOrderGas);
    }

    // Set min swap order size
    function setMinSwapOrderSize(uint256 _minSwapOrderSize)
        public
        override
        onlyOwner
    {
        uint256 oldValue = minSwapOrderSize;
        minSwapOrderSize = _minSwapOrderSize;

        emit SetMinSwapOrderSize(msg.sender, oldValue, minSwapOrderSize);
    }

    // Set min margin order size
    function setMinMarginOrderSize(uint256 _minMarginOrderSize)
        public
        override
        onlyOwner
    {
        uint256 oldValue = minMarginOrderSize;
        minMarginOrderSize = _minMarginOrderSize;

        emit SetMinMarginOrderSize(msg.sender, oldValue, minMarginOrderSize);
    }

    // Fills an order by
    // swapping an exact amount of tokens for another token through the path passed as an argument
    // Returns the amount of the final token
    // Requires args.amountToFillIn to have already been approved to this
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

        uint256 relayerFee = _checkRelayerFee(
            args.order.fromToken,
            args.order.amountIn,
            args.amountToFillIn,
            true
        );

        uint256 actualAmountIn = args.amountToFillIn.sub(relayerFee);

        uint256 swapbackReturn = sovrynSwapNetwork.rateByPath(
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

        emit OrderFilled(
            hash,
            args.order.maker,
            actualAmountIn,
            amountOut,
            path
        );
    }

    // Fills multiple orders passed as an array
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

    // Fills a margin order
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

    // Fills multiple margin orders passed as an array
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

    // Checks if an order is canceled / already fully filled
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

    // Checks if an order is canceled / already fully filled
    function _validateMarginStatus(
        FillMarginOrderArgs memory args,
        bytes32 hash
    ) internal view {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[hash], "order-canceled");
        require(filledAmountInOfHash[hash] == 0, "already-filled");
    }

    function _marginTrade(
        MarginOrders.Order memory order,
        uint256 actualLoanTokenAmount,
        uint256 actualCollateralAmount
    ) internal returns (uint256 principalAmount, uint256 collateralAmount) {
        address loanTokenAdr = order.loanTokenAddress;

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
        uint256 _orderSizeInColl = order.collateralTokenSent;
        uint256 _loanTokenSentInColl;
        address _loanTokenAsset;

        if (order.loanTokenSent > 0) {
            _loanTokenAsset = ISovrynLoanToken(order.loanTokenAddress)
                .loanTokenAddress();
            address[] memory _path = sovrynSwapNetwork.conversionPath(
                _loanTokenAsset,
                order.collateralTokenAddress
            );
            _loanTokenSentInColl = sovrynSwapNetwork.rateByPath(
                _path,
                order.loanTokenSent
            );
            _orderSizeInColl = _orderSizeInColl.add(_loanTokenSentInColl);
        }

        uint256 _relayerFeeIncoll = _checkRelayerFee(
            order.collateralTokenAddress,
            _orderSizeInColl,
            _orderSizeInColl, //fill all order
            false
        );

        // relayerFee is fee pay for relayer of collateral
        relayerFee = SafeMath.min256(
            _relayerFeeIncoll,
            order.collateralTokenSent
        );
        actualCollateralAmount = order.collateralTokenSent.sub(relayerFee);

        // should also take fee of loan token
        if (_relayerFeeIncoll > relayerFee) {
            address[] memory _path = sovrynSwapNetwork.conversionPath(
                order.collateralTokenAddress,
                _loanTokenAsset
            );
            relayerFeeOnLoanAsset = sovrynSwapNetwork.rateByPath(
                _path,
                _relayerFeeIncoll.sub(relayerFee)
            );
            actualLoanTokenAmount = order.loanTokenSent.sub(
                relayerFeeOnLoanAsset
            );
        }
    }

    function _checkRelayerFee(
        address fromToken,
        uint256 orderSize,
        uint256 amountToFill,
        bool isSpot
    ) internal view returns (uint256 relayerFee) {
        uint256 estOrderFee = amountToFill.mul(relayerFeePercent).div(10**20);
        uint256 txGas = isSpot ? swapOrderGas : marginOrderGas;
        uint256 estTxFee = tx.gasprice.mul(txGas);
        uint256 minFeeAmount = estTxFee.mul(3).div(2);
        uint256 minFeeAmountInToken = minFeeAmount;

        if (fromToken != WRBTC_ADDRESS) {
            address[] memory path = sovrynSwapNetwork.conversionPath(
                WRBTC_ADDRESS,
                fromToken
            );
            minFeeAmountInToken = sovrynSwapNetwork.rateByPath(
                path,
                minFeeAmount
            );
        }

        if (estOrderFee < minFeeAmountInToken) {
            require(amountToFill > minFeeAmountInToken, "Order amount is too low to pay the relayer fee");
            require(
                orderSize > minFeeAmountInToken,
                "Order amount is too low to pay the relayer fee"
            );

            relayerFee = minFeeAmountInToken;
        } else {
            uint256 fillAmountInRBtc = amountToFill;
            uint256 minFillingAmount = isSpot
                ? minSwapOrderSize
                : minMarginOrderSize;
            if (fromToken != WRBTC_ADDRESS) {
                address[] memory pathToRbtc = sovrynSwapNetwork.conversionPath(
                    fromToken,
                    WRBTC_ADDRESS
                );
                fillAmountInRBtc = sovrynSwapNetwork.rateByPath(
                    pathToRbtc,
                    amountToFill
                );
            }

            require(
                fillAmountInRBtc >= minFillingAmount,
                "Filling amount is too low"
            );
            relayerFee = amountToFill.mul(relayerFeePercent).div(10**20);
        }
    }

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

    function _checkWithdrawalOnCancel(
        address owner,
        address token,
        uint256 amount
    ) internal {
        if (token == WRBTC_ADDRESS && balanceOf[owner] >= amount) {
            withdraw(amount);
        }
    }

    // internal functions
    // Checks the amount returned from the token swap
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

        require(
            IERC20(sourceToken).approve(address(sovrynSwapNetwork), _amount),
            "Error approving token"
        );

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
        address signer = EIP712.recover(
            DOMAIN_SEPARATOR1,
            hash,
            order.v,
            order.r,
            order.s
        );
        require(
            RSKAddrValidator.safeEquals(signer, order.maker),
            "invalid-signature"
        );
        require(msg.sender == order.maker, "not-called-by-maker");

        canceledOfHash[hash] = true;
        canceledHashes.push(hash);

        _checkWithdrawalOnCancel(order.maker, order.fromToken, order.amountIn);
        // if (
        //     order.fromToken == WRBTC_ADDRESS &&
        //     balanceOf[order.maker] >= order.amountIn
        // ) {
        //     withdraw(order.amountIn);
        // }

        emit OrderCanceled(hash, order.maker);
    }

    function cancelMarginOrder(MarginOrders.Order memory order)
        public
        override
    {
        bytes32 hash = order.hash();
        address signer = EIP712.recover(
            DOMAIN_SEPARATOR2,
            hash,
            order.v,
            order.r,
            order.s
        );
        require(
            RSKAddrValidator.safeEquals(signer, order.trader),
            "invalid-signature"
        );
        require(msg.sender == order.trader, "not-called-by-maker");

        if (order.collateralTokenSent > 0) {
            _checkWithdrawalOnCancel(
                order.trader,
                order.collateralTokenAddress,
                order.collateralTokenSent
            );
        }

        if (order.loanTokenSent > 0) {
            address _loanTokenAsset = ISovrynLoanToken(order.loanTokenAddress)
                .loanTokenAddress();
            _checkWithdrawalOnCancel(
                order.trader,
                _loanTokenAsset,
                order.loanTokenSent
            );
        }

        canceledOfHash[hash] = true;
        canceledHashes.push(hash);

        emit MarginOrderCanceled(hash, order.trader);
    }

    function allCanceledHashes()
        public
        view
        override
        returns (bytes32[] memory)
    {
        return canceledHashes;
    }

    // Stores the order hashes and the cancelled flag
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

    // Stores the filled orders and the respective amounts
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

    function approveTokenLoan(
        address loanToken,
        address asset,
        uint256 amount
    ) public onlyOwner {
        IERC20(asset).safeApprove(loanToken, amount);
    }
}
