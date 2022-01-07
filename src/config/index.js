let config = require('./local');

if (process.argv.indexOf('--testnet') >= 0) {
    config = require('./testnet');
} else if (process.argv.indexOf('--mainnet') >= 0) {
    config = require('./main');
}

module.exports = config;
