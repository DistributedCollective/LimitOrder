// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

/*
    SovrynSwap LoanToken interface
*/

interface ISovrynLoanToken {
    //MarginTradeOrder =====================================================================================================================
    struct MarginTradeOrder {
        bytes32 loanId; /// 0 if new loan
        uint256 leverageAmount; /// Expected in x * 10**18 where x is the actual leverage (2, 3, 4, or 5).
        uint256 loanTokenSent;
        uint256 collateralTokenSent;
        address collateralTokenAddress;
        address trader;
        uint256 minReturn; // minimum position size in the collateral tokens
        bytes32 loanDataBytes; /// Arbitrary order data.
        uint256 createdTimestamp;
    }

    function marginTradeBySig(
        MarginTradeOrder memory order,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        returns (
            uint256,
            uint256 /// Returns new principal and new collateral added to trade.
        );
}
