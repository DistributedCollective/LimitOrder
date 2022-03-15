const { _TypedDataEncoder } = require("@ethersproject/hash");
const Web3 = require("web3");
const ethers = require('ethers');
const axios = require('axios');
const abiDecoder = require('abi-decoder');
const config = require('../src/config/testnet');
const ABIs = require("../src/config/abis");
const Order = require('../src/Order');
const MarginOrder = require('../src/MarginOrder');
const { formatEther } = require("@ethersproject/units");

let web3, bal = 0, account;
$(document).ready(() => {
    if (typeof window.ethereum !== 'undefined') {
        connectWallet();
        abiDecoder.addABI(ABIs.OrderBook);

        $('#sellSovXusdBtn').on('click', function () {
            createOrder('SOV', 'XUSD', ethers.utils.parseEther('10'), $(this));
        });

        $('#buySovXusdbtn').on('click', function () {
            createOrder('XUSD', 'SOV', ethers.utils.parseEther('10'), $(this));
        });
        
        $('#sellSovWrbtcBtn').on('click', function () {
            createOrder('SOV', 'WRBTC', ethers.utils.parseEther('10'), $(this));
        });
        $('#buySovWrbtcCBtn').on('click', function () {
            createOrder('WRBTC', 'SOV', ethers.utils.parseEther('1'), $(this));
        });
        
        $('#sellSovBProBtn').on('click', function () {
            createOrder('SOV', 'BPRO', ethers.utils.parseEther('10'), $(this));
        });
        $('#buySovBProBtn').on('click', function () {
            createOrder('BPRO', 'SOV', ethers.utils.parseEther('0.001'), $(this));
        });
        
        $('#sellSovDocBtn').on('click', function () {
            createOrder('SOV', 'DOC', ethers.utils.parseEther('10'), $(this));
        });
        $('#buySovDocBtn').on('click', function () {
            createOrder('DOC', 'SOV', ethers.utils.parseEther('10'), $(this));
        });
        
        $('#sellSovUsdtBtn').on('click', function () {
            createOrder('SOV', 'USDT', ethers.utils.parseEther('10'), $(this));
        });
        $('#buySovUsdtBtn').on('click', function () {
            createOrder('USDT', 'SOV', ethers.utils.parseEther('10'), $(this));
        });
        
        $('#sellSovEthsBtn').on('click', function () {
            createOrder('SOV', 'ETHs', ethers.utils.parseEther('10'), $(this));
        });
        $('#buySovEthsBtn').on('click', function () {
            createOrder('ETHs', 'SOV', ethers.utils.parseEther('0.05'), $(this));
        });
        
        $('#sellSovBnbsBtn').on('click', function () {
            createOrder('SOV', 'BNBs', ethers.utils.parseEther('10'), $(this));
        });
        $('#buySovBnbsBtn').on('click', function () {
            createOrder('BNBs', 'SOV', ethers.utils.parseEther('0.1'), $(this));
        });


        $('#sellXusdWrbtcBtn').on('click', function () {
            createOrder('XUSD', 'WRBTC', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyXusdWrbtcBtn').on('click', function () {
            createOrder('WRBTC', 'XUSD', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellXusdBproBtn').on('click', function () {
            createOrder('XUSD', 'BRPO', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyXusdBproBtn').on('click', function () {
            createOrder('BPRO', 'XUSD', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellXusdDocBtn').on('click', function () {
            createOrder('XUSD', 'DOC', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyXusdDocBtn').on('click', function () {
            createOrder('DOC', 'XUSD', ethers.utils.parseEther('10'), $(this));
        });

        $('#sellXusdUsdtBtn').on('click', function () {
            createOrder('XUSD', 'USDT', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyXusdUsdtBtn').on('click', function () {
            createOrder('USDT', 'XUSD', ethers.utils.parseEther('10'), $(this));
        });

        $('#sellXusdEthsBtn').on('click', function () {
            createOrder('XUSD', 'ETHs', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyXusdEthsBtn').on('click', function () {
            createOrder('ETHs', 'XUSD', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellXusdBnbsBtn').on('click', function () {
            createOrder('XUSD', 'BNBs', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyXusdBnbsBtn').on('click', function () {
            createOrder('BNBs', 'XUSD', ethers.utils.parseEther('0.1'), $(this));
        });


        $('#sellRbtcBproBtn').on('click', function () {
            createOrder('WRBTC', 'BRPO', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyRbtcBproBtn').on('click', function () {
            createOrder('BRPO', 'WRBTC', ethers.utils.parseEther('0.1'), $(this));
        });
        
        $('#sellRbtcUsdtBtn').on('click', function () {
            createOrder('WRBTC', 'USDT', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyRbtcUsdtBtn').on('click', function () {
            createOrder('USDT', 'WRBTC', ethers.utils.parseEther('100'), $(this));
        });
        
        $('#sellRbtcDocBtn').on('click', function () {
            createOrder('WRBTC', 'DOC', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyRbtcDocBtn').on('click', function () {
            createOrder('DOC', 'WRBTC', ethers.utils.parseEther('100'), $(this));
        });

        $('#sellRbtcEthsBtn').on('click', function () {
            createOrder('WRBTC', 'ETHs', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyRbtcEthsBtn').on('click', function () {
            createOrder('ETHs', 'WRBTC', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellRbtcBnbsBtn').on('click', function () {
            createOrder('WRBTC', 'BNBs', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyRbtcBnbsBtn').on('click', function () {
            createOrder('BNBs', 'WRBTC', ethers.utils.parseEther('0.1'), $(this));
        });


        $('#sellBproDocBtn').on('click', function () {
            createOrder('BPRO', 'DOC', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyBproDocBtn').on('click', function () {
            createOrder('DOC', 'BPRO', ethers.utils.parseEther('100'), $(this));
        });

        $('#sellBproUsdtBtn').on('click', function () {
            createOrder('BPRO', 'USDT', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyBproUsdtBtn').on('click', function () {
            createOrder('USDT', 'BPRO', ethers.utils.parseEther('100'), $(this));
        });

        $('#sellBproEthsBtn').on('click', function () {
            createOrder('BPRO', 'ETHs', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyBproEthsBtn').on('click', function () {
            createOrder('ETHs', 'BPRO', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellBproBnbsBtn').on('click', function () {
            createOrder('BPRO', 'BNBs', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyBproBnbsBtn').on('click', function () {
            createOrder('BNBs', 'BPRO', ethers.utils.parseEther('0.1'), $(this));
        });


        $('#sellDocUsdtBtn').on('click', function () {
            createOrder('DOC', 'USDT', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyDocUsdtBtn').on('click', function () {
            createOrder('USDT', 'DOC', ethers.utils.parseEther('10'), $(this));
        });

        $('#sellDocEthsBtn').on('click', function () {
            createOrder('DOC', 'ETHs', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyDocEthsBtn').on('click', function () {
            createOrder('ETHs', 'DOC', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellDocBnbsBtn').on('click', function () {
            createOrder('DOC', 'BNBs', ethers.utils.parseEther('10'), $(this));
        });
        $('#buyDocBnbsBtn').on('click', function () {
            createOrder('BNBs', 'DOC', ethers.utils.parseEther('0.1'), $(this));
        });


        $('#sellUsdtEthsBtn').on('click', function () {
            createOrder('USDT', 'ETHs', ethers.utils.parseEther('100'), $(this));
        });
        $('#buyUsdtEthsBtn').on('click', function () {
            createOrder('ETHs', 'USDT', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellUsdtBnbsBtn').on('click', function () {
            createOrder('USDT', 'BNBs', ethers.utils.parseEther('100'), $(this));
        });
        $('#buyUsdtBnbsBtn').on('click', function () {
            createOrder('BNBs', 'USDT', ethers.utils.parseEther('0.1'), $(this));
        });

        $('#sellEthsBnbsBtn').on('click', function () {
            createOrder('ETHs', 'BNBs', ethers.utils.parseEther('0.1'), $(this));
        });
        $('#buyEthsBnbsBtn').on('click', function () {
            createOrder('BNBs', 'ETHs', ethers.utils.parseEther('0.1'), $(this));
        });


        $('#longBTCx2').on('click', function () {
            createMarginOrder('long', '200', $(this));
        });
        $('#shortBTCx2').on('click', function () {
            createMarginOrder('short', '20', $(this));
        });
        
        $('#cancelOrder').on('click', function () {
            cancelOrder($(this));
        });
        $('#cancelMarginOrder').on('click', function () {
            cancelMarginOrder($(this));
        });
    } else {
        alert('Metamask is not found!');
    }
});

async function connectWallet() {
    const connectBtn = $('#connectWallet');
    connectBtn.click(async () => {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        web3 = new Web3(window.ethereum);
        const chainId = await web3.eth.getChainId();

        if (chainId != config.chainId) {
            // return alert('Wrong network');
        }

        account = accounts[0];
        $('#connectedContent').show();
        $('#accAdr').text(account);
        bal = await web3.eth.getBalance(account);
        console.log('connected account', account, bal);
        $('#accBal').text(Number(bal) / 1e18);
    });
}

const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(Date.now() / 1000 + hoursFromNow * 3600));

const getTokenContract = (tokenAdr) => {
    return new web3.eth.Contract(ABIs.ERC20, tokenAdr);
};

const getGasPrice = async () => {
    const gasPrice = await web3.eth.getGasPrice();
    return Math.round(gasPrice * 1.2).toString();
}

const approveToken = async (tokenAdr, from, spender, amount) => {
    const contractToken = getTokenContract(tokenAdr);
    const gasPrice = await getGasPrice();
    return new Promise((resolve, reject) => {
        contractToken.methods.approve(spender, amount)
            .send({
                from: from,
                gasPrice
            }, function (err, approveHash) {
                if (err) {
                    reject(err);
                } else {
                    resolve(approveHash);
                }
            });
    })
};

const getPriceAmm = async (fromToken, toToken, amount) => {
    const contract = new web3.eth.Contract(ABIs.SovrynSwap, config.contracts.swap);
    const path = await contract.methods.conversionPath(fromToken, toToken).call();
    const rate = await contract.methods.rateByPath(path, amount).call();
    return ethers.BigNumber.from(rate);
}

const waitTransaction = async (txHash) => {
    let ntry = 0;
    return new Promise((resolve, reject) => {

        const wait = async () => {
            ntry ++;
            const receipt = await web3.eth.getTransactionReceipt(txHash);
            if (receipt) return resolve(receipt);
            
            if (ntry > 90) return reject('exceed 90s for waiting transaction')
            setTimeout(wait, 1000);
        };

        showMsg('waiting transaction receipt for tx ' + txHash);
        wait();
    });
}

/**
 * Get fee for swap order on [toToken]
 */
const getSwapOrderFeeOut = async (amountIn, fromToken, toToken) => {
    const swapContract = new web3.eth.Contract(ABIs.SovrynSwap, config.contracts.swap);
    const settlement = new web3.eth.Contract(ABIs.Settlement, config.contracts.settlement);
    const orderSize = ethers.BigNumber.from(String(amountIn));
    let orderFee = orderSize.mul(2).div(1000); //-0.2% relayer fee
    let minFeeAmount = await settlement.methods.minSwapOrderTxFee().call();
    console.log('minFeeAmount', Number(minFeeAmount));

    let minFeeInToken = minFeeAmount;
    if (fromToken != config.tokens.WRBTC) {
        const rbtcPath = await swapContract.methods.conversionPath(config.tokens.WRBTC, fromToken).call();
        minFeeInToken = await swapContract.methods.rateByPath(rbtcPath, minFeeAmount).call();
    }

    if (orderFee.lt(minFeeInToken)) orderFee = minFeeInToken;

    const path = await swapContract.methods.conversionPath(fromToken, toToken).call();
    const feeOnToToken = await swapContract.methods.rateByPath(path, orderFee).call();

    return feeOnToToken;
}

async function createOrder(fromCurrency, toCurrency, amountIn, btn, priceBuffer = 1) {
    const apiUrl = `${config.baseAPIUrl}/api/createOrder`;
    if (bal <= 0) {
        alert('Insufficient balance');
        return;
    }
    try {
        clearMsg();
        btn.attr('disabled', 'disabled');
        
        const contract = new web3.eth.Contract(ABIs.OrderBook, config.contracts.orderBook);
        const fromToken = config.tokens[fromCurrency];
        const toToken = config.tokens[toCurrency];
        if (!fromToken || !toToken) return showMsg(`Token not found for currency ${fromCurrency}, ${toCurrency}`);

        let minAmountOut = (await getPriceAmm(fromToken, toToken, amountIn));
        minAmountOut = minAmountOut.mul((priceBuffer * 1000).toFixed(0)).div('1000');
        const price = Number(minAmountOut)/Number(amountIn);
        const feeOut = await getSwapOrderFeeOut(amountIn, fromToken, toToken);
        minAmountOut = minAmountOut.sub(feeOut);
        showMsg(`Min amount out: ${formatEther(minAmountOut)} ${toCurrency} for ${formatEther(amountIn)} ${fromCurrency} at price ${price}`);
        showMsg(`Fee out: ~${formatEther(feeOut)} ${toCurrency}`);

        if (minAmountOut.lt(0)) {
            return alert("Amount is less than relayer fee");
        }

        if (fromToken == config.tokens.WRBTC) {
            showMsg(`sending ${formatEther(amountIn)} rbtc to Settlement contract`);
            await web3.eth.sendTransaction({
                from: account,
                to: config.contracts.settlement,
                value: amountIn
            });
        } else {
            showMsg('waiting approve token');
            const approved = await approveToken(fromToken, account, config.contracts.settlement, amountIn)
                .then(approveHash => {
                    showMsg('approve tx', approveHash);
                    return true;
                })
                .catch(err => {
                    showMsg('reject approve');
                });
    
            if (!approved) return;
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
        showMsg('order hash', hash);
        showMsg('order msg', msg);

        const signature = await signTypeOrderData(order);

        showMsg('signature', signature);
        const sig = ethers.utils.splitSignature(signature);
        showMsg(JSON.stringify(sig, null, 2))

        const args = [
            order.maker,
            order.fromToken,
            order.toToken,
            order.amountIn,
            order.amountOutMin,
            order.recipient,
            order.deadline,
            order.created,
            sig.v,
            sig.r,
            sig.s,
        ];
        const txData = await contract.methods.createOrder(args).encodeABI();

        const { status, data } = await axios.post(apiUrl, {
            data: txData,
            from: account
        }, { json: true });

        showMsg('tx', JSON.stringify(data, null, 2));
        if (data && data.data && data.data.hash) {
            const receipt = await waitTransaction(data.data.hash);
            const logs = abiDecoder.decodeLogs(receipt.logs) || [];
            showMsg('logs', JSON.stringify(logs, null, 2));
        }

        btn.removeAttr('disabled');
    } catch (e) {
        showMsg(e);
        console.log(e);
        btn.removeAttr('disabled');
    }
}

async function createMarginOrder(pos, amountUSD, $btn) {
    if (bal <= 0) {
        alert('Insufficient balance');
        return;
    }

    try {

        clearMsg();
        $btn.attr('disabled', 'disabled');
       
        const apiUrl = `${config.baseAPIUrl}/api/createMarginOrder`;
        const orderBookMargin = new web3.eth.Contract(ABIs.OrderBookMargin, config.contracts.orderBookMargin);
        let loanToken, collateralToken, loanTokenAddress,
            loanTokenSent = ethers.utils.parseEther('0'),
            collateralTokenSent = ethers.utils.parseEther('0');
        const leverageAmount = ethers.utils.parseEther('2');
        let collateralTokenSymbol;

        if (pos == 'long') {
            loanTokenAddress = config.tokens.XUSD;
            loanToken = new web3.eth.Contract(ABIs.LoanToken, config.loanContracts.iXUSD);
            loanTokenSent = ethers.utils.parseEther(amountUSD);
            collateralToken = config.tokens.WRBTC;
            collateralTokenSymbol = 'RBTC';
        } else {
            loanTokenAddress = config.tokens.WRBTC;
            loanToken = new web3.eth.Contract(ABIs.LoanToken, config.loanContracts.iRBTC);
            collateralToken = config.tokens.XUSD;
            collateralTokenSent = ethers.utils.parseEther(amountUSD);
            collateralTokenSymbol = 'XUSD';
        }

        const minEntryPrice = await getCurEntryPrice(loanTokenAddress, loanTokenSent, collateralToken, collateralTokenSent);
        showMsg("Min entry price", ethers.utils.formatEther(minEntryPrice), collateralTokenSymbol);

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

        showMsg('waiting approve tokens');
        if (Number(order.loanTokenSent) > 0) {
            const token = await getTokenContract(loanTokenAddress).methods.symbol().call();
            await approveToken(loanTokenAddress, account, config.contracts.settlement, order.loanTokenSent)
                .then(approveHash => {
                    showMsg(`approved ${Number(order.loanTokenSent)/1e18} ${token}, tx`, approveHash);
                })
                .catch(err => {
                    showMsg(`rejected approve ${token}`);
                });
        }
        if (Number(order.collateralTokenSent) > 0) {
            const token = await getTokenContract(collateralToken).methods.symbol().call();
            await approveToken(collateralToken, account, config.contracts.settlement, order.collateralTokenSent)
                .then(approveHash => {
                    showMsg(`approved ${Number(order.collateralTokenSent)/1e18} ${token}, tx`, approveHash);
                })
                .catch(err => {
                    showMsg(`rejected approve ${token}`);
                });
        }

        const chainId = config.orderBookChainId;
        const msg = order.messageHash(chainId, config.contracts.orderBookMargin);
        showMsg('order msg', msg);
        showMsg('order hash', order.hash());

        const signature = await signTypeMarginOrderData(order);

        showMsg('signature', signature);
        const sig = ethers.utils.splitSignature(signature);
        showMsg(JSON.stringify(sig, null, 2))

        const args = [
            order.loanId,
            order.leverageAmount,
            order.loanTokenAddress,
            order.loanTokenSent,
            order.collateralTokenSent,
            order.collateralTokenAddress,
            order.trader,
            order.minEntryPrice,
            order.loanDataBytes,
            order.deadline,
            order.createdTimestamp,
            sig.v,
            sig.r,
            sig.s,
        ];
        const txData = await orderBookMargin.methods.createOrder(args).encodeABI();

        const { status, data } = await axios.post(apiUrl, {
            data: txData,
            from: account
        }, { json: true });

        showMsg('tx', JSON.stringify(data, null, 2));

        $btn.removeAttr('disabled');
    } catch (e) {
        showMsg(e);
        console.log(e);
        $btn.removeAttr('disabled');
    }
}

async function getCurEntryPrice(loanTokenAddress, loanTokenSent, collateralTokenAddress, collateralTokenSent) {
    const swapContract = new web3.eth.Contract(ABIs.SovrynSwap, config.contracts.swap);
    let totalLoanDeposited = loanTokenSent;

    if (collateralTokenSent.gt(ethers.constants.Zero)) {
        path = await swapContract.methods.conversionPath(collateralTokenAddress, loanTokenAddress).call();
        const amn = await swapContract.methods.rateByPath(path, collateralTokenSent).call();
        totalLoanDeposited = ethers.BigNumber.from(amn).add(totalLoanDeposited);
    }

    const pathLoan2Col = await swapContract.methods.conversionPath(loanTokenAddress, collateralTokenAddress).call();
    let colAmn = await swapContract.methods.rateByPath(pathLoan2Col, totalLoanDeposited).call();
    colAmn = ethers.BigNumber.from(colAmn);

    return colAmn.mul(ethers.constants.WeiPerEther).div(totalLoanDeposited).mul(20).div(100); // 0.2 * cur price
}

async function cancelOrder($btn) {
    try {
        const orderHash = prompt('Enter order hash');
        if (orderHash) {
            clearMsg();
            $btn.attr('disabled', 'disabled');
            const { data: { data: orders } } = await axios.get(`${config.baseAPIUrl}/api/orders/${account}`, { json: true });

            let order = (orders || []).find(o => o.hash == orderHash);

            if (!order) return showMsg('Order hash is not found on your history');

            const contract = new web3.eth.Contract(ABIs.Settlement, config.contracts.settlement);
            const txData = await contract.methods.cancelOrder([
                order.maker,
                order.fromToken,
                order.toToken,
                ethers.BigNumber.from(order.amountIn.hex),
                ethers.BigNumber.from(order.amountOutMin),
                order.recipient,
                ethers.BigNumber.from(order.deadline),
                ethers.BigNumber.from(order.created),
                order.v,
                order.r,
                order.s,
            ]).encodeABI();
            const tx = await web3.eth.sendTransaction({
                from: account,
                to: config.contracts.settlement,
                data: txData,
                gasLimit: 500000,
                gasPrice: await getGasPrice(),
            }, (err, txHash) => {
                err && console.log(err);
                if (txHash) {
                    showMsg('tx hash: ', txHash);
                }
            });

            showMsg('receipt', JSON.stringify(tx, null, 2));
        }
    } catch (e) {
        showMsg(e);
        console.log(e);
    } finally {
        $btn.removeAttr('disabled');
    }
}

async function cancelMarginOrder($btn) {
    try {
        const orderHash = prompt('Enter order hash');
        if (orderHash) {
            clearMsg();
            $btn.attr('disabled', 'disabled');
            const { data: { data: orders } } = await axios.get(`${config.baseAPIUrl}/api/orders/${account}?isMargin=1`, { json: true });

            let order = (orders || []).find(o => o.hash == orderHash);

            if (!order) return showMsg('Margin Order hash is not found on your history');

            const contract = new web3.eth.Contract(ABIs.Settlement, config.contracts.settlement);
            const txData = await contract.methods.cancelMarginOrder([
                order.loanId,
                order.leverageAmount,
                order.loanTokenAddress,
                ethers.BigNumber.from(order.loanTokenSent),
                ethers.BigNumber.from(order.collateralTokenSent),
                order.collateralTokenAddress,
                order.trader,
                ethers.BigNumber.from(order.minEntryPrice),
                order.loanDataBytes,
                ethers.BigNumber.from(order.deadline),
                ethers.BigNumber.from(order.createdTimestamp),
                order.v,
                order.r,
                order.s,
            ]).encodeABI();
            const tx = await web3.eth.sendTransaction({
                from: account,
                to: config.contracts.settlement,
                data: txData,
                gasLimit: 500000,
                gasPrice: await getGasPrice(),
            }, (err, txHash) => {
                err && console.log(err);
                if (txHash) {
                    showMsg('tx hash: ', txHash);
                }
            });

            showMsg('receipt', JSON.stringify(tx, null, 2));
        }
    } catch (e) {
        showMsg(e);
        console.log(e);
    } finally {
        $btn.removeAttr('disabled');
    }
}

function clearMsg() {
    $('#msgDiv').html("");
}
function showMsg(...msg) {
    $('#msgDiv').append(`<p><pre>${msg.join(" ")}</pre></p>`)
}

async function signTypeOrderData(order) {
    const msgParams = JSON.stringify({
        domain: {
            chainId: config.orderBookChainId,
            name: 'OrderBook',
            verifyingContract: config.contracts.orderBook,
            version: '1'
        },

        message: {
            maker: order.maker,
            fromToken: order.fromToken,
            toToken: order.toToken,
            amountIn: web3.utils.toBN(order.amountIn).toString(),
            amountOutMin: web3.utils.toBN(order.amountOutMin).toString(),
            recipient: order.recipient,
            deadline: web3.utils.toBN(order.deadline).toString(),
            created: web3.utils.toBN(order.created).toString(),
        },
        primaryType: 'Order',
        types: {
            EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
            ],
            Order: [
                { name: "maker", type: "address" },
                { name: "fromToken", type: "address" },
                { name: "toToken", type: "address" },
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMin", type: "uint256" },
                { name: "recipient", type: "address" },
                { name: "deadline", type: "uint256" },
                { name: "created", type: "uint256" },
            ],
        },
    });
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            method: 'eth_signTypedData_v4',
            params: [account, msgParams],
            from: account,
        }, function (err, res) {
            console.log(err, res)
            if (res && res.result) resolve(res.result);
            else reject(err);
        })
    })
}

/**
 * @param {MarginOrder} order 
 */
async function signTypeMarginOrderData(order) {
    const msgParams = JSON.stringify({
        domain: {
            chainId: config.orderBookChainId,
            name: 'OrderBookMargin',
            verifyingContract: config.contracts.orderBookMargin,
            version: '1'
        },

        message: {
            loanId: order.loanId,
            leverageAmount: web3.utils.toBN(order.leverageAmount).toString(),
            loanTokenAddress: order.loanTokenAddress,
            loanTokenSent: web3.utils.toBN(order.loanTokenSent).toString(),
            collateralTokenSent: web3.utils.toBN(order.collateralTokenSent).toString(),
            collateralTokenAddress: order.collateralTokenAddress,
            trader: order.trader,
            minEntryPrice: web3.utils.toBN(order.minEntryPrice).toString(),
            loanDataBytes: order.loanDataBytes,
            deadline: web3.utils.toBN(order.deadline).toString(),
            createdTimestamp: web3.utils.toBN(order.createdTimestamp).toString(),
        },
        primaryType: 'Order',
        types: {
            EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
            ],
            Order: [
                { name: "loanId", type: "bytes32" },
                { name: "leverageAmount", type: "uint256" },
                { name: "loanTokenAddress", type: "address" },
                { name: "loanTokenSent", type: "uint256" },
                { name: "collateralTokenSent", type: "uint256" },
                { name: "collateralTokenAddress", type: "address" },
                { name: "trader", type: "address" },
                { name: "minEntryPrice", type: "uint256" },
                { name: "loanDataBytes", type: "bytes32" },
                { name: "deadline", type: "uint256" },
                { name: "createdTimestamp", type: "uint256" },
            ],
        },
    });
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            method: 'eth_signTypedData_v4',
            params: [account, msgParams],
            from: account,
        }, function (err, res) {
            console.log(err, res)
            if (res && res.result) resolve(res.result);
            else reject(err);
        })
    })
}