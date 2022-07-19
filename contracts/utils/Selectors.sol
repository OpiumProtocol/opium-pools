// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

library Selectors {
    bytes4 internal constant ERC20_TRANSFER = bytes4(keccak256(bytes("transfer(address,uint256)")));
    bytes4 internal constant ERC20_APPROVE = bytes4(keccak256(bytes("approve(address,uint256)")));
}
