// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import "./OrderBookSwapStorage.sol";
import "../proxy/UpgradableProxy.sol";

/**
 * @title Order Book - Swap Proxy contract.
 * @dev OrderBookSwapProxy contract should be upgradable, use UpgradableProxy.
 * OrderBookSwapStorage is deployed with the upgradable functionality
 * by using this contract that inherits from UpgradableProxy to facilitate
 * the possibility of being enhanced and re-deployed.
 * */
contract OrderBookSwapProxy is OrderBookSwapStorage, UpgradableProxy {

}
