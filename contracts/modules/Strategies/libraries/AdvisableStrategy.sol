// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "./BaseStrategy.sol";

abstract contract AdvisableStrategy is BaseStrategy, AccessControl {
  /// @notice Constant containing the hash of the ADVISOR_ROLE
  bytes32 public constant ADVISOR_ROLE = keccak256("ADVISOR_ROLE");

  constructor(address owner_) {
    _setupRole(DEFAULT_ADMIN_ROLE, address(owner_));
  }

  function transferAdvisory(address newAdvisor_) external onlyRole(ADVISOR_ROLE) {
    _revokeRole(ADVISOR_ROLE, msg.sender);
    _grantRole(ADVISOR_ROLE, newAdvisor_);
  }
}
