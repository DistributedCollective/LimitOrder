// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import "./SettlementStorage.sol";
import "../proxy/UpgradableProxy.sol";

/**
 * @title Settlement Proxy contract.
 * @dev Settlement Proxy contract should be upgradable, use UpgradableProxy.
 * SettlementStorage is deployed with the upgradable functionality
 * by using this contract that inherits from UpgradableProxy to facilitate
 * the possibility of being enhanced and re-deployed.
 * */
contract SettlementProxy is SettlementStorage, UpgradableProxy {

}
