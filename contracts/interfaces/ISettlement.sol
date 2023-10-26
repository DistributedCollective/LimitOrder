// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/Orders.sol";
import "../libraries/MarginOrders.sol";
import "./IPriceFeeds.sol";

interface ISettlement {
    event Deposit(address to, uint256 amount);
    event Withdrawal(address receiver, uint256 amount);

    function deposit(address to) external payable;

    function withdraw(uint256 amount) external;
}