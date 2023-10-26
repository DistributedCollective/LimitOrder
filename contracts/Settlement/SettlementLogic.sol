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
        address receiver = to != address(0) ? to : msg.sender;
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
}