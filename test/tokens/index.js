const fs = require("fs");
const path = require("path");
const { Token } = require("@sushiswap/sdk");

const load = file => JSON.parse(String(fs.readFileSync(path.resolve(__dirname, file))));

const xusd = load("./XUSD.json");
const sov = load("./SOV.json");
const wrbtc = load("./WRBTC.json");

module.exports = {
    
    XUSD: [30, 31, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, xusd[current], 18, "XUSD", "XUSD"),
        }),
        {}
    ),
    SOV: [30,31, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, sov[current], 18, "SOV", "SOV"),
        }),
        {}
    ),
    WRBTC: [30,31, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, wrbtc[current], 18, "WRBTC", "WRBTC"),
        }),
        {}
    ),
};
