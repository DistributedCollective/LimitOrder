import { constants, ethers } from "ethers";
import config, { RelayerAccount } from "./config";
import testnet from "./config/testnet";

class RSK {
    provider: ethers.providers.JsonRpcProvider;
    accounts: RelayerAccount[];
    pendingHashes = {};

    static Mainnet = new RSK(config.rpcNode, config.accounts);
    static Testnet = new RSK(testnet.rpcNode, config.accounts);

    private constructor(nodeUrl: string, accounts: RelayerAccount[]) {
        this.provider = new ethers.providers.JsonRpcProvider(nodeUrl);
        this.accounts = accounts;
    }

    async getWallet(): Promise<ethers.Wallet> {
        for (const acc of this.accounts) {
            const nrPending = this.getNrPending(acc.address);

            if (nrPending >= 4) continue;

            const wallet = new ethers.Wallet(acc.pKey, this.provider);
            const bal = await wallet.getBalance();
            if (bal.gt(constants.Zero)) {
                return wallet;
            }
        }
    }

    addPendingHash(adr: string, hash: string) {
        this.pendingHashes[hash] = adr.toLowerCase();
    }

    removeHash(hash: string) {
        delete this.pendingHashes[hash];
    }

    getNrPending(adr: string) {
        return Object.keys(this.pendingHashes)
            .filter(h => this.pendingHashes[h] == adr.toLowerCase()).length;
    }

    async getNonce(adr: string) {
        const nrPending = this.getNrPending(adr);
        const nonce = await this.provider.getTransactionCount(adr, 'latest');
        return nonce + nrPending - 1;
    }
}

export default RSK;
