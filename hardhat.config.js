require("dotenv/config");

require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-solhint");
require("hardhat-spdx-license-identifier");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("hardhat-gas-reporter");
require("solidity-coverage");

const accounts = {
    mnemonic: "test test test test test test test test test test test junk",
};

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            gas: 12000000,
            blockGasLimit: 12000000,
            allowUnlimitedContractSize: true,
            accounts,
            live: false,
            saveDeployments: true,
        },
        localhost: {
            url: 'http://127.0.0.1:8545',
            gas: 12000000,
            blockGasLimit: 12000000,
            allowUnlimitedContractSize: true,
            accounts,
            live: false,
            saveDeployments: true,
        },
        rsktestnet: {
             url: 'https://testnet.sovryn.app/rpc',
             accounts: [process.env.PRIVATE_KEY],
             network_id: 31,
             confirmations: 3,
             gas: 6800000,
        },
    },
    namedAccounts: {
        deployer: 0,
        relayer: 1,
        user: 2,
    },
    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
        currency: "USD",
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
        excludeContracts: ["contracts/mock/", "contracts/libraries/"],
    },
    solidity: {
        version: "0.6.12",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    mocha: {
        timeout: 200000,
    },
};
