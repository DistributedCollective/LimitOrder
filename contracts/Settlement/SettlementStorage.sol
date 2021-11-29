// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import "../proxy/Initializable.sol";
import "../proxy/Ownable.sol";
import "../libraries/Orders.sol";
import "../interfaces/ISovrynSwapNetwork.sol";

/**
 * @title Settlement Storage contract.
 * @notice Just the storage part of Settlement contract, no functions,
 * only constant, variables and required structures (mappings).
 * Used by SettlementProxy.
 * */
contract SettlementStorage is Initializable, Ownable {
    // solhint-disable-next-line var-name-mixedcase
    bytes32 public DOMAIN_SEPARATOR1;
    bytes32 public DOMAIN_SEPARATOR2;

    // Hash of an order => if canceled
    mapping(bytes32 => bool) public canceledOfHash;
    bytes32[] internal canceledHashes;
    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;
    // Hash of user balance
    mapping(address => uint256) public balanceOf;

    address public RBTC_ADDRESS = address(0);
    address public WRBTC_ADDRESS;

    ISovrynSwapNetwork public sovrynSwapNetwork;
    address public orderBookAddress;
    address public orderBookMarginAddress;

    uint256 public relayerFeePercent;
    uint256 public minFee; //in wrbtc
}
