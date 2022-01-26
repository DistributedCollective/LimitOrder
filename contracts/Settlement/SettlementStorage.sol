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

    // solhint-disable-next-line var-name-mixedcase
    bytes32 public DOMAIN_SEPARATOR2;

    // Array of cancelled hashes
    bytes32[] internal canceledHashes;

    // Hash of an order => if canceled
    mapping(bytes32 => bool) public canceledOfHash;

    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;

    // User => Balance
    mapping(address => uint256) public balanceOf;

    //RBTC/WRBTC addresses
    address public RBTC_ADDRESS;
    address public WRBTC_ADDRESS;

    ISovrynSwapNetwork public sovrynSwapNetwork;

    // Address of OrderBook proxy
    address public orderBookAddress;

    // Address of OrderBookMargin proxy
    address public orderBookMarginAddress;

    // Relayer Fee Percent
    uint256 public relayerFeePercent;

    // Minimum Fee
    uint256 public minFee; //in wrbtc
}
