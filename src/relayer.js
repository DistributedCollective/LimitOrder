const ethers = require('ethers');
const { relayers } = require('../secrets/account');

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
            // console.log(relayer.address, this.pendingTxs[relayer.address], new Date(), Number(bal));
            if (bal.gt(ethers.constants.Zero) && Object.keys(this.pendingTxs[relayer.address]||{}).length < 4) {
                return relayer;
            }
        }
    }

    async getGasPrice() {
        const gasPrice = await this.provider.getGasPrice();
        return ethers.BigNumber.from(Math.round(Number(gasPrice) * 1.2).toString());
    }

    async sendTx(data) {
        let nonce, relayer;
        try {
            relayer = await this.getAccount();
            if (!relayer) throw "No wallet has enough fund or available";

            this.pendingTxs[relayer.address] = this.pendingTxs[relayer.address] || {};
            nonce = await relayer.getTransactionCount('pending');
            nonce += Object.keys(this.pendingTxs[relayer.address]).length;

            this.pendingTxs[relayer.address][nonce] = data;
            const tx = await relayer.sendTransaction({
                ...data,
                gasPrice: await this.getGasPrice(),
                nonce
            });

            delete this.pendingTxs[relayer.address][nonce];

            if (tx) {
                return tx;
            } else {
                throw "Failed to send tx: " + JSON.stringify(data);
            }
        } catch (err) {
            if (nonce != null && relayer) {
                delete this.pendingTxs[relayer.address][nonce];
            }
            throw err;
        }
    }
}

module.exports = new Relayer();