pragma solidity ^0.5.17;

import "../governance/FeeSharingProxy/FeeSharingLogic.sol";

contract FeeSharingProxyMockup is FeeSharingLogic {
	struct TestData {
		address loanPoolToken;
		uint32 maxCheckpoints;
		address receiver;
	}

	TestData public testData;

	constructor(IProtocol _protocol, IStaking _staking) public {
		protocol = _protocol;
		staking = _staking;
	}

	function withdraw(
		address _loanPoolToken,
		uint32 _maxCheckpoints,
		address _receiver
	) public {
		testData = TestData(_loanPoolToken, _maxCheckpoints, _receiver);
	}

	function trueWithdraw(
		address _loanPoolToken,
		uint32 _maxCheckpoints,
		address _receiver
	) public {
		super.withdraw(_loanPoolToken, _maxCheckpoints, _receiver);
	}

	function addCheckPoint(address loanPoolToken, uint256 poolTokenAmount) public {
		uint96 amount96 = safe96(poolTokenAmount, "FeeSharingProxy::withdrawFees: pool token amount exceeds 96 bits");
		_addCheckpoint(loanPoolToken, amount96);
	}
}
