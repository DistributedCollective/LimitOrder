// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import "./OrderBookMarginStorage.sol";
import "../proxy/UpgradableProxy.sol";

/**
 * @title Order Book - Margin Proxy contract.
 * @dev OrderBookMarginProxy contract should be upgradable, use UpgradableProxy.
 * OrderBookMarginStorage is deployed with the upgradable functionality
 * by using this contract that inherits from UpgradableProxy to facilitate
 * the possibility of being enhanced and re-deployed.
 * */
contract OrderBookMarginProxy is OrderBookMarginStorage, UpgradableProxy {

}
