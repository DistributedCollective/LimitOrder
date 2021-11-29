// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import "../proxy/Initializable.sol";
import "../proxy/Ownable.sol";
import "../libraries/MarginOrders.sol";

/**
 * @title Order Book - Margin Storage contract.
 * @notice Just the storage part of Order Book - Margin contract, no functions,
 * only constant, variables and required structures (mappings).
 * Used by OrderBookMarginProxy.
 * */
contract OrderBookMarginStorage is Initializable, Ownable {
    // solhint-disable-next-line var-name-mixedcase
    bytes32 public DOMAIN_SEPARATOR;

    // Array of hashes of all orders
    bytes32[] internal _allHashes;

    // Address of order trader => hashes (orders)
    mapping(address => bytes32[]) internal _hashesOfTrader;

    // Address of collateralToken => hashes (orders)
    mapping(address => bytes32[]) internal _hashesOfCollateralToken;

    // Hash of an order => the order and its data
    mapping(bytes32 => MarginOrders.Order) public orderOfHash;
}
