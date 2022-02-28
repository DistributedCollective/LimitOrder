import { Pair, Token, TokenAmount } from "@sushiswap/sdk";
import { Contract, ethers } from "ethers";
import TokenEntry, { toToken } from "./types/TokenEntry";
import config from "./config";
import swapAbi from "./config/abi_sovrynSwap.json";

export type OnSync = (pair: Pair) => Promise<void> | void;

class Pairs {
    static async fetch(provider: ethers.providers.BaseProvider) {
        const swapContract = new Contract(config.contracts.sovrynSwap, swapAbi, provider);
        const tokens: TokenEntry[]  = config.tokens;
        const tokenCombinations: [Token, Token][] = [];
        for (const entryA of tokens) {
            const tokenA = toToken(entryA);
            for (const entryB of tokens) {
                const tokenB = toToken(entryB);
                if (tokenA.address !== tokenB.address && tokenA.sortsBefore(tokenB)) {
                    tokenCombinations.push([tokenA, tokenB]);
                }
            }
        }
        const pairs = await Promise.all(
            tokenCombinations.map(async pair => {
                const [tokenA, tokenB] = pair;
                try {
                    const path = await swapContract.conversionPath(tokenA.address, tokenB.address);
                    const balA: any = ethers.constants.WeiPerEther.mul(1);
                    const balB: any = await swapContract.rateByPath(path, balA);
                    return new Pair(new TokenAmount(tokenA, balA), new TokenAmount(tokenB, balB));
                } catch (e) {
                    return null;
                }
            })
        );
        return { tokens: tokens.map(token => toToken(token)), pairs: pairs.filter(pair => pair != null) };
    }
}

export default Pairs;
