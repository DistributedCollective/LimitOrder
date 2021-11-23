const { _TypedDataEncoder } = require("@ethersproject/hash");
const Web3 = require("web3");
const ethers = require('ethers');
const axios = require('axios');
const config = require('../src/config');
const { abi: orderBookAbi } = require('../deployments/rsktestnet/OrderBook.json');
const { abi: orderBookMarginAbi } = require('../deployments/rsktestnet/OrderBookMargin.json');
const { abi: settlementAbi } = require('../deployments/rsktestnet/Settlement.json');
const { ERC20: ERC20Abi, LoanToken: LoanTokenAbi } = require("../src/config/abis");
const Order = require('../src/Order');
const MarginOrder = require('../src/MarginOrder');

// function Order(maker,
//     fromToken,
//     toToken,
//     amountIn,
//     amountOutMin,
//     recipient = maker,
//     deadline,
//     created,
// ) {
//     this.maker = maker;
//     this.fromToken = fromToken;
//     this.toToken = toToken;
//     this.amountIn = amountIn;
//     this.amountOutMin = amountOutMin;
//     this.recipient = recipient;
//     this.deadline = deadline;
//     this.created = created;

//     this.messageHash = function(chainId, contractAddress) {
//         const domain = {
//             name: "OrderBook",
//             version: "1",
//             chainId,
//             verifyingContract: contractAddress,
//         };
//         const types = {
//             Order: [
//                 { name: "maker", type: "address" },
//                 { name: "fromToken", type: "address" },
//                 { name: "toToken", type: "address" },
//                 { name: "amountIn", type: "uint256" },
//                 { name: "amountOutMin", type: "uint256" },
//                 { name: "recipient", type: "address" },
//                 { name: "deadline", type: "uint256" },
//                 { name: "created", type: "uint256" },
//             ],
//         };
//         const value = {
//             maker: this.maker,
//             fromToken: this.fromToken,
//             toToken: this.toToken,
//             amountIn: this.amountIn,
//             amountOutMin: this.amountOutMin,
//             recipient: this.recipient,
//             deadline: this.deadline,
//             created: this.created,
//         };

//         return _TypedDataEncoder.hash(domain, types, value);
//     }
// }

// function MarginOrder(
//     loanId,
//     leverageAmount,
//     loanTokenAddress,
//     loanTokenSent,
//     collateralTokenSent,
//     collateralTokenAddress,
//     trader,
//     minReturn,
//     loanDataBytes,
//     deadline,
//     createdTimestamp,
// ) {
//     this.trader = trader;
//     this.loanId = loanId;
//     this.leverageAmount = leverageAmount;
//     this.loanTokenAddress = loanTokenAddress;
//     this.loanTokenSent = loanTokenSent;
//     this.collateralTokenSent = collateralTokenSent;
//     this.collateralTokenAddress = collateralTokenAddress;
//     this.minReturn = minReturn;
//     this.loanDataBytes = loanDataBytes;
//     this.deadline = deadline;
//     this.createdTimestamp = createdTimestamp;

//     this.messageHash = function (chainId, contractAddress) {
//         const domain = {
//             name: "OrderBookMargin",
//             version: "1",
//             chainId,
//             verifyingContract: contractAddress,
//         };
//         const types = {
//             Order: [
//                 { name: "loanId", type: "bytes32" },
//                 { name: "leverageAmount", type: "bytes32" },
//                 { name: "loanTokenAddress", type: "address" },
//                 { name: "loanTokenSent", type: "uint256" },
//                 { name: "collateralTokenSent", type: "uint256" },
//                 { name: "collateralTokenAddress", type: "address" },
//                 { name: "trader", type: "address" },
//                 { name: "minReturn", type: "uint256" },
//                 { name: "loanDataBytes", type: "bytes32" },
//                 { name: "deadline", type: "uint256" },
//                 { name: "createdTimestamp", type: "uint256" },
//             ],
//         };
//         const value = {
//             trader: trader,
//             loanId: loanId,
//             leverageAmount: leverageAmount,
//             loanTokenAddress: loanTokenAddress,
//             loanTokenSent: loanTokenSent,
//             collateralTokenSent: collateralTokenSent,
//             collateralTokenAddress: collateralTokenAddress,
//             minReturn: minReturn,
//             loanDataBytes: loanDataBytes,
//             deadline: deadline,
//             createdTimestamp: createdTimestamp,
//         };
//         return _TypedDataEncoder.hash(domain, types, value);
//     }
// }


let web3, bal = 0, account, createOrderBtn, cancelOrderBtn, createMarginOrderBtn;
$(document).ready(() => {
    if (typeof window.ethereum !== 'undefined') {
        connectWallet();
        createOrderBtn = $('#createOrder');
        cancelOrderBtn = $('#cancelOrder');
        createMarginOrderBtn = $('#createMarginOrder');
        createOrderBtn.on('click', createOrder);
        createMarginOrderBtn.on('click', createMarginOrder);
        cancelOrderBtn.on('click', cancelOrder);
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
            return alert('Wrong network');
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
    return new web3.eth.Contract(ERC20Abi, tokenAdr);;
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

async function createOrder() {
    const apiUrl = `${config.baseAPIUrl}/api/createOrder`;
    if (bal <= 0) {
        alert('Insufficient balance');
        return;
    }
    try {

        clearMsg();
        createOrderBtn.attr('disabled', 'disabled');

        const fromToken = config.tokens.SOV;
        const toToken = config.tokens.XUSD;
        const amountIn = ethers.utils.parseEther('10');
        const contract = new web3.eth.Contract(orderBookAbi, config.contracts.orderBook);

        showMsg('waiting approve token');
        await approveToken(fromToken, account, config.contracts.settlement, amountIn)
            .then(approveHash => {
                showMsg('approve tx', approveHash);
            })
            .catch(err => {
                showMsg('reject approve');
            });

        const order = new Order(
            account,
            fromToken,
            toToken,
            amountIn,
            ethers.utils.parseEther('0.003'),
            account,
            getDeadline(24),
            ethers.BigNumber.from(Math.floor(Date.now() / 1000))
        );
        const chainId = config.chainId;
        const msg = order.messageHash(chainId, config.contracts.orderBook);
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

        createOrderBtn.removeAttr('disabled');
    } catch (e) {
        showMsg(e);
        console.log(e);
        createOrderBtn.removeAttr('disabled');
    }
}

async function cancelOrder() {
    try {
        const orderHash = prompt('Enter order hash');
        if (orderHash) {
            clearMsg();
            cancelOrderBtn.attr('disabled', 'disabled');

            const contract = new web3.eth.Contract(settlementAbi, config.contracts.settlement);
            const txData = await contract.methods.cancelOrder(orderHash).encodeABI();
            const tx = await web3.eth.sendTransaction({
                from: account,
                to: config.contracts.settlement,
                data: txData,
                gasLimit: 100000,
                gasPrice: ethers.utils.parseUnits('10', 'gwei'),
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
        cancelOrderBtn.removeAttr('disabled');
    }
}

async function createMarginOrder() {
    if (bal <= 0) {
        alert('Insufficient balance');
        return;
    }

    try {

        clearMsg();
        createMarginOrderBtn.attr('disabled', 'disabled');
       
        const apiUrl = `${config.baseAPIUrl}/api/createMarginOrder`;
        const orderBookMargin = new web3.eth.Contract(orderBookMarginAbi, config.contracts.orderBookMargin);
        const loanToken = new web3.eth.Contract(LoanTokenAbi, config.loanContracts.iXUSD);
        const leverageAmount = ethers.utils.parseEther('2');
        const loanTokenSent = ethers.utils.parseEther('100');
        const collateralTokenSent = ethers.utils.parseEther('0');
        const collateralToken = config.tokens.WRBTC;
        const { collateral } = await loanToken.methods.getEstimatedMarginDetails(
            leverageAmount,
            loanTokenSent,
            collateralTokenSent,
            collateralToken,
        ).call();
        const minReturn = ethers.BigNumber.from(String(collateral)).div(2);

        const order = new MarginOrder(
            ethers.constants.HashZero,
            leverageAmount,
            loanToken.options.address,
            loanTokenSent,
            collateralTokenSent,
            collateralToken,
            account, //trader,
            minReturn,
            ethers.constants.HashZero, //loanDataBytes,
            getDeadline(24),//deadline,
            ethers.BigNumber.from(Math.floor(Date.now() / 1000)), //createdTimestamp,
        );

        showMsg('waiting approve tokens');
        if (Number(order.loanTokenSent) > 0) {
            const loanTokenAssetAddress = await loanToken.methods.loanTokenAddress().call();
            const token = await getTokenContract(loanTokenAssetAddress).methods.symbol().call();
            await approveToken(loanTokenAssetAddress, account, config.contracts.settlement, order.loanTokenSent)
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

        const chainId = config.chainId;
        const msg = order.messageHash(chainId, config.contracts.orderBookMargin);
        showMsg('order msg', msg);

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
            order.minReturn,
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

        createMarginOrderBtn.removeAttr('disabled');
    } catch (e) {
        showMsg(e);
        console.log(e);
        createMarginOrderBtn.removeAttr('disabled');
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
            chainId: config.chainId,
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
            chainId: config.chainId,
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
            minReturn: web3.utils.toBN(order.minReturn).toString(),
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
                { name: "minReturn", type: "uint256" },
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