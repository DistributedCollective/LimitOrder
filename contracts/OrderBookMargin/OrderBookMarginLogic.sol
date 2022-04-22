// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "./OrderBookMarginStorage.sol";
import "../interfaces/IERC20.sol";
import "../libraries/EIP712.sol";
import "../libraries/Bytes32Pagination.sol";
import "../libraries/RSKAddrValidator.sol";

/**
 * @title Limit OrderBook - Margin Logic Contract.
 * @notice This contract creates a Limit OrderBook for Margin trading.
 * It has several other getter functions.
 * */
contract OrderBookMarginLogic is OrderBookMarginStorage {
    using MarginOrders for MarginOrders.Order;
    using Bytes32Pagination for bytes32[];

    /// @notice Emitted when a Margin Limit Order is created
    /// @param hash The hash of the order struct
    /// @param order The Order struct
    event MarginOrderCreated(bytes32 indexed hash, MarginOrders.Order order);

    /**
     * @notice Replace constructor with initialize function for Upgradable Contracts.
     * This function will be called only once by the owner.
     * */
    function initialize() external onlyOwner initializer {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("OrderBookMargin"),
                keccak256("1"),
                30,
                address(this)
            )
        );
    }

    /**
     * @notice Creates a Margin limit order.
     * */
    function createOrder(MarginOrders.Order memory order) public {
        order.validate();

        bytes32 hash = order.hash();
        address signer = EIP712.recover(
            DOMAIN_SEPARATOR,
            hash,
            order.v,
            order.r,
            order.s
        );
        require(
            RSKAddrValidator.safeEquals(signer, order.trader),
            "invalid-signature"
        );

        require(orderOfHash[hash].trader == address(0), "order-exists");
        orderOfHash[hash] = order;

        _allHashes.push(hash);
        _hashesOfTrader[order.trader].push(hash);
        _hashesOfCollateralToken[order.collateralTokenAddress].push(hash);

        emit MarginOrderCreated(hash, order);
    }

    /**
     * @notice Returns the number of orders created by the trader.
     * */
    function numberOfHashesOfTrader(address trader)
        public
        view
        returns (uint256)
    {
        return _hashesOfTrader[trader].length;
    }

    /**
     * @notice Returns the number of orders where collateralToken is the target token.
     * */
    function numberOfHashesOfCollateralToken(address collateralToken)
        public
        view
        returns (uint256)
    {
        return _hashesOfCollateralToken[collateralToken].length;
    }

    /**
     * @notice Returns the number of all margin limit orders.
     * */
    function numberOfAllHashes() public view returns (uint256) {
        return _allHashes.length;
    }

    /**
     * @notice Returns an array of hashes of orders of a trader.
     * */
    function hashesOfTrader(
        address trader,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfTrader[trader].paginate(page, limit);
    }

    /**
     * @notice Returns an array of hashes of orders where collateralToken is the target token.
     * */
    function hashesOfCollateralToken(
        address collateralToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfCollateralToken[collateralToken].paginate(page, limit);
    }

    /**
     * @notice Return an array of all hashes.
     * */
    function allHashes(uint256 page, uint256 limit)
        public
        view
        returns (bytes32[] memory)
    {
        return _allHashes.paginate(page, limit);
    }

    /**
     * @notice Returns the address of maker for an order.
     * */
    function getTrader(bytes32 hash) public view returns (address trader) {
        MarginOrders.Order memory order = orderOfHash[hash];
        trader = order.trader;
    }

    /**
     * @notice Returns all orders(specified by offset/start and limit/count) of a maker.
     * */
    function getOrders(
        address trader,
        uint256 offset,
        uint256 limit
    ) public view returns (MarginOrders.Order[] memory orders) {
        orders = new MarginOrders.Order[](limit);
        bytes32[] memory hashes = _hashesOfTrader[trader];
        for (uint256 i = 0; i < limit; i++) {
            if (i + offset < hashes.length) {
                bytes32 hash = hashes[i + offset];
                orders[i] = orderOfHash[hash];
            }
        }
    }
}
