const { network } = require("hardhat");
const Web3 = require('web3');
const path = require('path');
const abis = require('../src/config/abis');
require('dotenv').config({ path: path.resolve(__dirname, '../.env')});

const configs = require('../src/config');
const web3 = new Web3(configs.networkUrl);
const BN = web3.utils.BN;
const MAX_UINT256 = new BN('2').pow(new BN('256')).sub(new BN('1'));
const amount = MAX_UINT256;
const amountThreshold = amount.div(new BN('10')).mul(new BN('9')); // 90% of uint256 might be enough
const maxPendingTransactions = 4;
const settlementContract = new web3.eth.Contract(abis.Settlement, configs.contracts.settlement);
const ownerPk = process.env['PRIVATE_KEY'];
web3.eth.accounts.wallet.add(ownerPk);

let loanContracts = configs.loanContracts, tokens = configs.tokens;
let ownerAdr = web3.eth.accounts.wallet[0].address;
if (network.name === "hardhat" || network.name === "localhost") {
    ownerAdr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // HardHat Account
}

async function approve(localLoanContracts, localTokens) {
    if (configs.chainId == 31337) {
        loanContracts = localLoanContracts;
        tokens = localTokens;
    }

    for (const iLoan of Object.keys(loanContracts)) {
        const iLoanAdr = loanContracts[iLoan];

        for (const token of Object.keys(tokens)) {
            const tokenAdr = tokens[token];
            await approveToken(token, tokenAdr, configs.contracts.settlement, iLoanAdr);
        }
    }
}

const alreadyApproved = {};
let numPendingTransactions = 0;
async function approveToken(tokenSymbol, tokenAddress, settlmentAdr, spenderAddress) {
    tokenAddress = tokenAddress.toLowerCase();
    settlmentAdr = settlmentAdr.toLowerCase();
    spenderAddress = spenderAddress.toLowerCase();
    const cacheKey = `${tokenAddress}-${settlmentAdr}-${spenderAddress}`;
    if (alreadyApproved[cacheKey]) {
        console.log(`already approved ${spenderAddress} to spend ${tokenSymbol} on behalf of ${settlmentAdr}`);
        return;
    }
    alreadyApproved[cacheKey] = true;

    const tokenContract = new web3.eth.Contract(abis.ERC20, tokenAddress);
    if (!tokenContract) {
        throw new Error(`unknown token: ${tokenAddress}`);
    }
    const allowance = await tokenContract.methods.allowance(settlmentAdr, spenderAddress).call();
    if (new BN(allowance).gt(amountThreshold)) {
        console.log(`${spenderAddress} already has enough allowance to spend ${tokenSymbol} on behalf of ${settlmentAdr}`);
        return;
    }

    await waitForPendingTransactions();
    const nonce = await web3.eth.getTransactionCount(ownerAdr, 'pending');
    let gasPrice = await web3.eth.getGasPrice();
    gasPrice = Math.round(gasPrice * 1.2);
    console.log(`approving ${spenderAddress} to spend unlimited ${tokenSymbol} on behalf of ${settlmentAdr} (nonce ${nonce})`);

    numPendingTransactions++;
    const txHash = await new Promise((resolve, reject) => {
        settlementContract.methods.approveTokenLoan(spenderAddress, tokenAddress, amount).send({
            nonce,
            from: ownerAdr,
            gas: 200000,
            gasPrice,
        }).once(
            'transactionHash',
            hash => resolve(hash)
        ).catch(
            error => reject(error)
        );
    });
    console.log("tx hash:", txHash);
    waitForTransaction(txHash).then(txReceipt => {
        numPendingTransactions--;
        if (txReceipt.status) {
            console.log(`Approval transaction successful for ${tokenSymbol}: ${txHash}`);
        } else {
            console.error(`Errored approval transaction for ${tokenSymbol}: ${txHash}`);
        }
    }).catch(e => {
        console.error('Error waiting approval transaction', e);
    });
}

async function waitForPendingTransactions(max = maxPendingTransactions) {
    let iteration = 0;
    while (numPendingTransactions >= max) {
        if (iteration % 10 === 0) {
            // avoid spam by only logging every 10 seconds
            console.log(`Waiting until there are less than ${max} pending transactions (currently ${numPendingTransactions})...`)
        }
        iteration++;
        await wasteTime(1);
    }
}

async function waitForTransaction(txHash) {
    while (true) {
        let txReceipt = await web3.eth.getTransactionReceipt(txHash);
        if (txReceipt) {
            return txReceipt;
        }
        await wasteTime(3);
    }
}

async function wasteTime(sec) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
}

if (require.main === module) {
    console.log("running approve from script");
    approve().then(() => {
        console.log('All wallets approved. Waiting for all transactions');
        waitForPendingTransactions(1).then(() => {
            console.log('All wallets approved successfully.')
        }).catch(e => {
            console.error('Error waiting for transactions', e);
        });
    }).catch(e => {
        console.error('Error in approval:', e);
    })
}

module.exports = { approve };