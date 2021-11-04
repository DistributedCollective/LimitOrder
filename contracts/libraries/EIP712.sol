// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

import "./openzeppelin/ECDSA.sol";

library EIP712 {
    function recover(
        // solhint-disable-next-line var-name-mixedcase
        bytes32 DOMAIN_SEPARATOR,
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal pure returns (address) {
        bytes32 digest = ECDSA.toTypedDataHash(DOMAIN_SEPARATOR, hash);
        return ECDSA.recover(digest, v, r, s);
    }
}
