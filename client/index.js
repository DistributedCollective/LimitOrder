const { _TypedDataEncoder } = require("@ethersproject/hash");
const Web3 = require("web3");
const ethers = require('ethers');
const axios = require('axios');
const config = require('../src/config');
const { abi: orderBookAbi } = require('../deployments/localhost/OrderBook.json');
const ERC20Abi = require("../src/ERC20.json");
const SOV = "0x6a9A07972D07e58F0daf5122d11E069288A375fb";
const XUSD = "0x74858FE37d391f81F89472e1D8BC8Ef9CF67B3b1";

function Order(maker,
    fromToken,
    toToken,
    amountIn,
    amountOutMin,
    recipient = maker,
    deadline
) {
    this.maker = maker;
    this.fromToken = fromToken;
    this.toToken = toToken;
    this.amountIn = amountIn;
    this.amountOutMin = amountOutMin;
    this.recipient = recipient;
    this.deadline = deadline;
    
    this.messageHash = function(chainId, contractAddress) {
        const domain = {
            name: "OrderBook",
            version: "1",
            chainId,
            verifyingContract: contractAddress,
        };
        const types = {
            Order: [
                { name: "maker", type: "address" },
                { name: "fromToken", type: "address" },
                { name: "toToken", type: "address" },
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMin", type: "uint256" },
                { name: "recipient", type: "address" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const value = {
            maker: this.maker,
            fromToken: this.fromToken,
            toToken: this.toToken,
            amountIn: this.amountIn,
            amountOutMin: this.amountOutMin,
            recipient: this.recipient,
            deadline: this.deadline,
        };

        return _TypedDataEncoder.hash(domain, types, value);
    }
}

let web3, bal = 0, account, createOrderBtn;
$(document).ready(() => {
    if (typeof window.ethereum !== 'undefined') {
        connectWallet();
        createOrderBtn = $('#createOrder');
        createOrderBtn.on('click', createOrder);
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
        $('#accBal').text(Number(bal)/1e18);
    });
}

const getDeadline = hoursFromNow => ethers.BigNumber.from(Math.floor(Date.now() / 1000 + hoursFromNow * 3600));

async function createOrder() {
    const apiUrl = `${config.baseAPIUrl}/api/createOrder`;
    if (bal <= 0) {
        alert('Insufficient balance');
        return;
    }
    try {

        clearMsg();
        createOrderBtn.attr('disabled', 'disabled');

        const fromToken = SOV;
        const toToken = XUSD;
        const amountIn = ethers.utils.parseEther('10');
        const contract = new web3.eth.Contract(orderBookAbi, config.contracts.orderBook);
        const contractToken = new web3.eth.Contract(ERC20Abi, fromToken);

        showMsg('waiting approve token');
        await contractToken.methods.approve(config.contracts.settlement, amountIn)
            .send({ 
                from: account,
                gasPrice: ethers.utils.parseUnits('50', 'gwei')
            }, function (err, approveHash) {
                if (err) {
                    showMsg('reject approve');
                } else {
                    showMsg('approve tx', approveHash);
                }
            });

        const order = new Order(
            account,
            fromToken,
            toToken,
            amountIn,
            ethers.utils.parseEther('0.003'),
            account,
            getDeadline(24),
        );
        const chainId = config.chainId;
        const msg = order.messageHash(chainId, config.contracts.orderBook);
        showMsg('order msg', msg);
        
        const signature = await signTypeData(order);

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
    } catch(e) {
        showMsg(e);
        console.log(e);
        createOrderBtn.removeAttr('disabled');
    }
}

function clearMsg() {
    $('#msgDiv').html("");
}
function showMsg(...msg) {
    $('#msgDiv').append(`<p><pre>${msg.join(" ")}</pre></p>`)
}

async function signTypeData(order) {
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