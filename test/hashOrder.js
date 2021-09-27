const Web3 = require('web3');
var web3 = new Web3("https://mainnet.sovryn.app/rpc");

const str= "Order(bytes32 loanId,uint256 leverageAmount,address loanTokenAddress,uint256 loanTokenSent,uint256 collateralTokenSent,address collateralTokenAddress,address trader,uint256 minReturn,bytes32 loanDataBytes,uint256 deadline,uint256 createdTimestamp)";
const str2 = "Order(address maker,address fromToken,address toToken,uint256 amountIn,uint256 amountOutMin,address recipient,uint256 deadline,uint256 created)";

const h = web3.utils.soliditySha3(str2);
console.log(h);
