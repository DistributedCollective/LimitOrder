require("dotenv/config");

const { task } = require("hardhat/config");

require("@nomiclabs/hardhat-ganache");
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer"); //yarn run hardhat size-contracts
require("solidity-coverage"); // $ npx hardhat coverage
require("hardhat-deploy");
require("hardhat-deploy-ethers");
//require("hardhat-log-remover");
//require("hardhat-docgen");
//require("hardhat-abi-exporter");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
/// this is for use with ethers.js
task("accounts", "Prints the list of accounts", async () => {
    const accounts = await ethers.getSigners();

    for (const account of accounts.address) {
        const wallet = ethers.Wallet.fromMnemonic("test test test test test test test test test test test junk", "m/44'/60'/0'/0");

        console.log(account);
    }
});

/*task("accounts", "Prints accounts", async (_, { web3 }) => {
    console.log();
    console.log(await web3.eth.getAccounts());
});*/

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
/**/
const accounts = {
    mnemonic: "test test test test test test test test test test test junk",
};

module.exports = {
    solidity: {
        compilers: [
            {
                version: "0.5.17",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    }
                }
            },
            {
                version: "0.6.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            }
        ],
    },
    abiExporter: {
        path: "./abi",
        clear: true,
        flat: false,
        only: [],
        except: [],
        spacing: 4,
    },
    contractSizer: {
        alphaSort: false,
        runOnCompile: false,
        disambiguatePaths: false,
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            gas: 12000000,
            blockGasLimit: 12000000,
            allowUnlimitedContractSize: true,
            live: false,
            saveDeployments: true,
            accounts,
        },
        localhost: {
            url: 'http://127.0.0.1:8545',
            gas: 12000000,
            blockGasLimit: 12000000,
            allowUnlimitedContractSize: true,
            live: false,
            saveDeployments: true,
            accounts,
        },
        rsktestnet: {
            url: "https://testnet.sovryn.app/rpc",
            accounts: [process.env.PRIVATE_KEY, process.env.PRIVATE_KEY_RELAYER],
            network_id: 31,
            confirmations: 4,
            gasMultiplier: 1.25,
            //timeout: 20000, // increase if needed; 20000 is the default value
            //allowUnlimitedContractSize, //EIP170 contrtact size restriction temporal testnet workaround
        },
        mainnet: {
            url: "https://mainnet.sovryn.app/rpc",
            accounts: [process.env.PRIVATE_KEY],
            network_id: 30,
            //timeout: 20000, // increase if needed; 20000 is the default value
        },
    },
    paths: {
        sources: "./contracts",
        tests: "./tests",
    },
    mocha: {
        timeout: 800000,
        grep: "^(?!.*; using Ganache).*",
    },
    docgen: {
        path: "./docs",
        clear: true,
    },
    namedAccounts: {
        deployer: 0,
        relayer: 1,
        user: 2,
    },
};
