import { ethers } from "ethers";
import { Trade } from "@sushiswap/sdk";

interface MarginOrder {
    hash: string;
    loanId: string;
    leverageAmount: ethers.BigNumber;
    loanTokenAddress: string;
    loanTokenSent: ethers.BigNumber;
    collateralTokenSent: ethers.BigNumber;
    collateralTokenAddress: string;
    trader: string;
    minEntryPrice: ethers.BigNumber;
    loanDataBytes: string;
    deadline: ethers.BigNumber;
    createdTimestamp: ethers.BigNumber;
    v: number;
    r: string;
    s: string;
    trade?: Trade;
}

export default MarginOrder;
