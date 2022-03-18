const ethers = require('ethers');
const AsyncLock = require('async-lock');
const { relayers } = require('../secrets/account');

const locker = new AsyncLock();
// let cnt = 0;
const lock = async (key) => {
    // const uuid = "#" + (++cnt)
    // console.log(uuid, 'locking', key)
    return new Promise(resolve => {
        locker.acquire(key, (release) => {
            resolve(release);
        }).then(() => {
            // console.log("<<<<<<" + uuid, 'released', key)
        });
    });
};

const waste = async (seconds) => {
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

class Relayer {
    init(provider) {
        this.provider = provider;
        this.relayers = relayers.map(({privateKey}) => {
            return new ethers.Wallet(privateKey, provider);
        });
        this.pendingTxs = {};
    }

    async getAccount() {
        for (const relayer of this.relayers) {
            const bal = await relayer.getBalance();
            if (bal.gt(ethers.constants.Zero) && Object.keys(this.pendingTxs[relayer.address]||{}).length < 5) {
                return relayer;
            }
        }
    }

    async getGasPrice() {
        const gasPrice = await this.provider.getGasPrice();
        return ethers.BigNumber.from(Math.round(Number(gasPrice) * 1.2).toString());
    }

    async sendTx(data, retry) {
        let nonce, relayer, release;
        try {
            release = await lock('relayer.sendTx');
            relayer = await this.getAccount();
            if (!relayer) {
                retry = (retry || 0) + 1;
                console.log("No wallet has enough fund or available, retry #" + retry);

                if (retry < 10) {
                    await waste(15);
                    release();
                    return this.sendTx(data, retry);
                }
                release();
                return;
            }

            this.pendingTxs[relayer.address] = this.pendingTxs[relayer.address] || {};
            nonce = await relayer.getTransactionCount('latest');
            nonce += Object.keys(this.pendingTxs[relayer.address]).length;

            this.pendingTxs[relayer.address][nonce] = data;
            release();
      
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
                        delete this.pendingTxs[relayer.address][nonce];
                        console.log('tx %s, nonce %s confirmed', tx.hash, nonce);
                        resolve();
                    } catch (e) {
                        delete this.pendingTxs[relayer.address][nonce];
                        console.log('tx failed %s, nonce %s', tx.hash, nonce);
                        console.error(e);
                    }
                });

                return tx;
            } else {
                throw "Failed to send tx: " + JSON.stringify(data);
            }
        } catch (err) {
            if (nonce != null && relayer) {
                delete this.pendingTxs[relayer.address][nonce];
            }
            release && release();
            throw err;
        }
    }
}

module.exports = new Relayer();