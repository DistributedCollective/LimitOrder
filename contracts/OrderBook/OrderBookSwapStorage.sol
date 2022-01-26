// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import "../proxy/Initializable.sol";
import "../proxy/Ownable.sol";
import "../libraries/Orders.sol";

/**
 * @title Order Book - Swap Storage contract.
 * @notice Just the storage part of Order Book - Swap contract, no functions,
 * only constant, variables and required structures (mappings).
 * Used by OrderBookSwapProxy.
 * */
contract OrderBookSwapStorage is Initializable, Ownable {
    // solhint-disable-next-line var-name-mixedcase
    bytes32 internal DOMAIN_SEPARATOR;

    // Array of hashes of all orders
    bytes32[] internal _allHashes;

    // Address of order maker => hashes (orders)
    mapping(address => bytes32[]) internal _hashesOfMaker;

    // Address of fromToken => hashes (orders)
    mapping(address => bytes32[]) internal _hashesOfFromToken;

    // Address of toToken => hashes (orders)
    mapping(address => bytes32[]) internal _hashesOfToToken;

    // Hash of an order => the order and its data
    mapping(bytes32 => Orders.Order) public orderOfHash;
}
