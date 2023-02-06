const ethers = require('ethers');
const AsyncLock = require('async-lock');
const { relayers } = require('../secrets/account');

const locker = new AsyncLock();
const lock = async (key) => {
    return new Promise(resolve => {
        locker.acquire(key, (release) => {
            resolve(release);
        });
    });
};

const waste = async (seconds) => {
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

class Relayer {
    init(provider) {
        this.provider = provider;
        this.relayers = relayers.map(({ privateKey }) => {
            return new ethers.Wallet(privateKey, provider);
        });
        this.pendingTxs = {};
        this.relayerNonces = {};
    }

    /**
     * returns a wallet with less than 4 pending transactions
     * @param {*} timeout the maximum waiting time in ms
     */
    async getAccount(timeout) {
        const stopAt = Date.now() + timeout;
        while(Date.now() < stopAt) {
            for (const relayer of this.relayers) {
                this.pendingTxs[relayer.address] = this.pendingTxs[relayer.address] || 0;
                const bal = await relayer.getBalance();
                if (bal.gt(ethers.constants.Zero) && this.pendingTxs[relayer.address] < 4) {
                    this.pendingTxs[relayer.address] ++;
                    return relayer;
                }
            }
            waste(0.5);
        }
    }

    /**
     * decreases the pending tx count for a wallet
     * @param {*} walletAddress
     */
    decreasePending(walletAddress) {
        for (const relayer of this.relayers) {
            if (relayer.address.toLowerCase() === walletAddress.toLowerCase()) {
                this.pendingTxs[relayer.address]--;
                return true;
            }
        }

        console.error("could not decrease the pending tx count for non-existing wallet address: " + walletAddress);
        return false;
    }

    /**
     * The Rsk node does not return a valid response occasionally for a short period of time
     * Thats why the request is repeated 5 times and in case it still fails the last nonce +1 is returned
     */
    async getNonce(wallet) {
        const lastNonce = this.relayerNonces[wallet.address];
        for (let cnt = 0; cnt < 5; cnt++) {
            try {
                const nonce = await wallet.getTransactionCount('pending');
                console.log('pending tx count %s, last nonce %s, attemp %s', nonce, lastNonce, cnt)
                if (lastNonce != null && nonce !== lastNonce + 1) {
                    console.log("nonce %d not expected %d", nonce, lastNonce + 1);
                    if (cnt === 4) {
                        console.log("giving up and returning it anyway")
                        return nonce;
                    }

                    await waste(0.5 ** 2 ** cnt);
                }
                else {
                    return nonce;
                }
            } catch (e) {
                console.error("Error retrieving transaction count");
                console.error(e);
            }
        }

        const finalNonce = lastNonce + 1 || 0;
        console.error("Returning guessed nonce %d", finalNonce);
        return finalNonce;
    }

    async getGasPrice() {
        const gasPrice = await this.provider.getGasPrice();
        return ethers.BigNumber.from(Math.round(Number(gasPrice) * 1.2).toString());
    }

    async sendTx(data) {
        let nonce, relayer;
        const release = await lock('relayer.sendTx');
        try {
            relayer = await this.getAccount(5 * 60 * 1000);
            if (!relayer) {
                console.log("No wallet has enough fund or available");
                release();
                return;
            }

            nonce = this.relayerNonces[relayer.address] = await this.getNonce(relayer);

            const tx = await relayer.sendTransaction({
                ...data,
                gasPrice: await this.getGasPrice(),
                nonce
            });

            if (tx) {
                console.log('sending tx %s, nonce %s', tx.hash, nonce);
                new Promise(async (resolve) => {
                    try {
                        await tx.wait();
                        console.log('tx %s, nonce %s confirmed', tx.hash, nonce);
                        resolve();
                    } catch (e) {
                        console.log('tx failed %s, nonce %s', tx.hash, nonce);
                        console.error(e);
                    } finally {
                        this.decreasePending(relayer.address);
                    }
                });

                return tx;
            } else {
                throw "Failed to send tx: " + JSON.stringify(data);
            }
        } catch (err) {
            if (nonce != null && relayer) {
                this.decreasePending(relayer.address);
            }
            throw err;
        } finally {
            release();
        }
    }
}

module.exports = new Relayer();
