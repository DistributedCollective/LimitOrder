let config = require('./testnet');

console.log(process.argv);
if (process.argv.indexOf('--local') >= 0) {
    config = require('./local');
} else if (process.argv.indexOf('--mainnet') >= 0) {
    config = require('./main');
}

module.exports = config;
