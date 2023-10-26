// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "./SettlementStorage.sol";

contract SettlementLogic is ISettlement, SettlementStorage {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;


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