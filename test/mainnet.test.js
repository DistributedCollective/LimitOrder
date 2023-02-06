const path = require('path');
const ethers = require('ethers');
const axios = require('axios');
const Web3 = require('web3');
const abiDecoder = require('abi-decoder');
require('dotenv').config({ path: path.resolve(__dirname, '../.env')});

const config = require('../src/config/main');
const ABIs = require("../src/config/abis");
const Order = require('../src/Order');
const MarginOrder = require('../src/MarginOrder');
const { formatEther } = ethers.utils;

const web3 = new Web3(config.networkUrl);
const orderBookWeb3 = new Web3(config.orderBookNetwork);
const privateKey = process.env['PRIVATE_KEY'];

web3.eth.accounts.wallet.add(privateKey);
orderBookWeb3.eth.accounts.wallet.add(privateKey);
const account = web3.eth.accounts.wallet[0].address;
abiDecoder.addABI(ABIs.OrderBook);


const getTokenContract = (web3, tokenAdr) => {
    return new web3.eth.Contract(ABIs.ERC20, tokenAdr);;
};

const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(Date.now() / 1000 + hoursFromNow * 3600));

const approveToken = async (web3, tokenAdr, from, spender, amount) => {
    const contractToken = getTokenContract(web3, tokenAdr);
    const gasPrice = await getGasPrice(web3);
    return new Promise((resolve, reject) => {
        contractToken.methods.approve(spender, amount)
            .send({
                from: from,
                gasPrice,
                gas: 100000
            }, function (err, approveHash) {
                if (err) {
                    reject(err);
                } else {
                    resolve(approveHash);
                }
            });
    })
};

const getPriceAmm = async (web3, fromToken, toToken, amount) => {
    const contract = new web3.eth.Contract(ABIs.SovrynSwap, config.contracts.swap);
    const path = await contract.methods.conversionPath(fromToken, toToken).call();
    const rate = await contract.methods.rateByPath(path, amount).call();
    return ethers.BigNumber.from(rate);
}

const getGasPrice = async (web3) => {
    const gasPrice = await web3.eth.getGasPrice();
    return Math.round(gasPrice * 1.2).toString();
}

const waitTransaction = async (web3, txHash) => {
    let ntry = 0;
    return new Promise((resolve, reject) => {

        const wait = async () => {
            ntry++;
            const receipt = await web3.eth.getTransactionReceipt(txHash);
            if (receipt) return resolve(receipt);

            if (ntry > 90) return reject('exceed 90s for waiting transaction')
            setTimeout(wait, 1000);
        };

        console.log('waiting transaction receipt for tx ' + txHash);
        wait();
    });
}

async function createOrder(fromCurrency, toCurrency, amountIn) {
    const apiUrl = `${config.baseAPIUrl}/api/createOrder`;

    const contract = new web3.eth.Contract(ABIs.OrderBook, config.contracts.orderBook);
    const fromToken = config.tokens[fromCurrency];
    const toToken = config.tokens[toCurrency];
    if (!fromToken || !toToken) return console.log("Invalid from, toCurrency");

    let checkBal;
    if (fromToken.toLowerCase() == config.tokens.WRBTC.toLowerCase()) {
        checkBal = await web3.eth.getBalance(account);
    } else {
        checkBal = await getTokenContract(web3, fromToken).methods.balanceOf(account).call();
    }

    if (ethers.BigNumber.from(checkBal).lt(amountIn)) {
        return console.log("Insufficient token balance");
    }

    const minAmountOut = (await getPriceAmm(web3, fromToken, toToken, amountIn)).mul('8').div('10');
    console.log(`Min amount out: ${formatEther(minAmountOut)} ${toCurrency} for ${formatEther(amountIn)} ${fromCurrency}`);

    
    if (fromToken.toLowerCase() == config.tokens.WRBTC.toLowerCase()) {
        console.log(`sending ${formatEther(amountIn)} RBTC to Settlement`);
        const sendTx = await web3.eth.sendTransaction({
            from: account,
            to: config.contracts.settlement,
            value: amountIn,
            gasPrice: await getGasPrice(web3),
            gas: 50000
        });
        if (!sendTx || !sendTx.transactionHash) return;
        await waitTransaction(web3, sendTx.transactionHash);
    } else {
        console.log('waiting approve token');
        const approvedTx = await approveToken(web3, fromToken, account, config.contracts.settlement, amountIn)
            .then(approveHash => {
                console.log('approve tx', approveHash);
                return approveHash;
            })
            .catch(err => {
                console.log(e);
                console.log('reject approve');
            });

        if (!approvedTx) return;
        await waitTransaction(web3, approvedTx);
    }

    const order = new Order(
        account,
        fromToken,
        toToken,
        amountIn,
        minAmountOut,
        account,
        getDeadline(24),
        ethers.BigNumber.from(Math.floor(Date.now() / 1000))
    );

    const chainId = config.orderBookChainId;
    const msg = order.messageHash(chainId, config.contracts.orderBook);
    const hash = order.hash();
    console.log('order hash', hash);
    console.log('order msg', msg);

    const args = await order.toArgs(chainId, config.contracts.orderBook, "0x" + privateKey);
    const txData = await contract.methods.createOrder(args).encodeABI();

    const { data } = await axios.post(apiUrl, {
        data: txData,
        from: account
    }, { json: true });

    console.log('tx', JSON.stringify(data, null, 2));

    if (data && data.data && data.data.hash) {
        const receipt = await waitTransaction(orderBookWeb3, data.data.hash);
        const logs = abiDecoder.decodeLogs(receipt.logs) || [];
        console.log('logs', JSON.stringify(logs, null, 2));
    }
}


async function createMarginOrder(pos, amountUSD, leverage) {
    try {
        const apiUrl = `${config.baseAPIUrl}/api/createMarginOrder`;
        const orderBookMargin = new web3.eth.Contract(ABIs.OrderBookMargin, config.contracts.orderBookMargin);
        let loanToken, collateralToken,
            loanTokenSent = ethers.utils.parseEther('0'),
            collateralTokenSent = ethers.utils.parseEther('0');
        const leverageAmount = ethers.utils.parseEther(leverage);

        if (pos == 'long') {
            loanToken = new web3.eth.Contract(ABIs.LoanToken, config.loanContracts.iXUSD);
            collateralToken = config.tokens.WRBTC;
            loanTokenSent = ethers.utils.parseEther(amountUSD);
        } else {
            loanToken = new web3.eth.Contract(ABIs.LoanToken, config.loanContracts.iRBTC);
            collateralToken = config.tokens.XUSD;
            collateralToken = ethers.utils.parseEther(amountUSD);
        }
        const { collateral } = await loanToken.methods.getEstimatedMarginDetails(
            leverageAmount,
            loanTokenSent,
            collateralTokenSent,
            collateralToken,
        ).call();
        const minEntryPrice = ethers.BigNumber.from(String(collateral)).div(2);

        const order = new MarginOrder(
            ethers.constants.HashZero,
            leverageAmount,
            loanToken.options.address,
            loanTokenSent,
            collateralTokenSent,
            collateralToken,
            account, //trader,
            minEntryPrice,
            ethers.constants.HashZero, //loanDataBytes,
            getDeadline(24),//deadline,
            ethers.BigNumber.from(Math.floor(Date.now() / 1000)), //createdTimestamp,
        );

        console.log('waiting approve tokens');
        if (Number(order.loanTokenSent) > 0) {
            const loanTokenAssetAddress = await loanToken.methods.loanTokenAddress().call();
            const token = await getTokenContract(web3, loanTokenAssetAddress).methods.symbol().call();
            await approveToken(web3, loanTokenAssetAddress, account, config.contracts.settlement, order.loanTokenSent)
                .then(approveHash => {
                    console.log(`approved ${formatEther(order.loanTokenSent)} ${token}, tx`, approveHash);
                    return waitTransaction(web3, approveHash);
                })
                .catch(err => {
                    console.log(`rejected approve ${token}`);
                    console.log(err);
                });
        }
        if (Number(order.collateralTokenSent) > 0) {
            const token = await getTokenContract(web3, collateralToken).methods.symbol().call();
            await approveToken(web3, collateralToken, account, config.contracts.settlement, order.collateralTokenSent)
                .then(approveHash => {
                    console.log(`approved ${formatEther(order.collateralTokenSent)} ${token}, tx`, approveHash);
                    return waitTransaction(web3, approveHash);
                })
                .catch(err => {
                    console.log(`rejected approve ${token}`);
                    console.log(err);
                });
        }

        const chainId = config.orderBookChainId;
        const msg = order.messageHash(chainId, config.contracts.orderBookMargin);
        console.log('order msg', msg);

        const args = await order.toArgs(chainId, config.contracts.orderBookMargin, '0x' + privateKey);
        const txData = await orderBookMargin.methods.createOrder(args).encodeABI();

        const { data } = await axios.post(apiUrl, {
            data: txData,
            from: account
        }, { json: true });

        console.log('tx', JSON.stringify(data, null, 2));
        if (data && data.data && data.data.hash) {
            const receipt = await waitTransaction(orderBookWeb3, data.data.hash);
            const logs = abiDecoder.decodeLogs(receipt.logs) || [];
            console.log('logs', JSON.stringify(logs, null, 2));
        }
    } catch (e) {
        console.log(e);
    }
}

(async function start() {
     await createOrder('WRBTC', 'SOV', ethers.utils.parseEther('0.0005'));
    // await createOrder('SOV', 'XUSD', ethers.utils.parseEther('2'));
   // await createMarginOrder('long', '50', '3');
})();
