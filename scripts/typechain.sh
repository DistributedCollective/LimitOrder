#!/bin/bash

npx typechain --target ethers-v5 --out-dir ./src/contracts "deployments/rsktestnet/*.json"

cp -R ./src/contracts ../limitorders_relayer/src/
rm -R ./src/contracts
