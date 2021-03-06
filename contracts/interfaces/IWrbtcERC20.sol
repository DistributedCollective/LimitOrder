// SPDX-License-Identifier: MIT

/**
 * Copyright 2017-2020, bZeroX, LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0.
 */

pragma solidity >=0.5.0 <0.6.13;

import "./IWrbtc.sol";
import "./IERC20.sol";

abstract contract IWrbtcERC20 is IWrbtc, IERC20 {}
