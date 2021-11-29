// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "./OrderBookSwapStorage.sol";
import "../interfaces/IERC20.sol";
import "../libraries/EIP712.sol";
import "../libraries/Bytes32Pagination.sol";
import "../libraries/RSKAddrValidator.sol";

contract OrderBookSwapLogic is OrderBookSwapStorage {
    using Orders for Orders.Order;
    using Bytes32Pagination for bytes32[];

    event OrderCreated(bytes32 indexed hash, Orders.Order order);

    /**
     * @notice Replace constructor with initialize function for Upgradable Contracts
     * This function will be called only once by the owner
     * */
    function initialize() external onlyOwner initializer {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("OrderBook"),
                keccak256("1"),
                chainId,
                address(this)
            )
        );
    }

    function numberOfHashesOfMaker(address maker)
        public
        view
        returns (uint256)
    {
        return _hashesOfMaker[maker].length;
    }

    // Return the number of orders where fromToken is the origin token
    function numberOfHashesOfFromToken(address fromToken)
        public
        view
        returns (uint256)
    {
        return _hashesOfFromToken[fromToken].length;
    }

    // Return the number of orders where toToken is the target token
    function numberOfHashesOfToToken(address toToken)
        public
        view
        returns (uint256)
    {
        return _hashesOfToToken[toToken].length;
    }

    // Returns the number of all orders
    function numberOfAllHashes() public view returns (uint256) {
        return _allHashes.length;
    }

    // Returns an array of hashes of orders of a maker
    function hashesOfMaker(
        address maker,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfMaker[maker].paginate(page, limit);
    }

    // Returns an array of hashes of orders where fromToken is the origin token
    function hashesOfFromToken(
        address fromToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfFromToken[fromToken].paginate(page, limit);
    }

    // Returns an array of hashes of orders where toToken is the target token
    function hashesOfToToken(
        address toToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfToToken[toToken].paginate(page, limit);
    }

    // Return an array of all hashes
    function allHashes(uint256 page, uint256 limit)
        public
        view
        returns (bytes32[] memory)
    {
        return _allHashes.paginate(page, limit);
    }

    // Creates an order
    function createOrder(Orders.Order memory order) public {
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
            RSKAddrValidator.safeEquals(signer, order.maker),
            "invalid-signature"
        );

        require(orderOfHash[hash].maker == address(0), "order-exists");
        orderOfHash[hash] = order;

        _allHashes.push(hash);
        _hashesOfMaker[order.maker].push(hash);
        _hashesOfFromToken[order.fromToken].push(hash);
        _hashesOfToToken[order.toToken].push(hash);

        emit OrderCreated(hash, order);
    }

    function getMaker(bytes32 hash) public view returns (address maker) {
        Orders.Order memory order = orderOfHash[hash];
        maker = order.maker;
    }

    function getOrders(
        address maker,
        uint256 offset,
        uint256 limit
    ) public view returns (Orders.Order[] memory orders) {
        orders = new Orders.Order[](limit);
        bytes32[] memory hashes = _hashesOfMaker[maker];
        for (uint256 i = 0; i < limit; i++) {
            if (i + offset < hashes.length) {
                bytes32 hash = hashes[i + offset];
                orders[i] = orderOfHash[hash];
            }
        }
    }
}
