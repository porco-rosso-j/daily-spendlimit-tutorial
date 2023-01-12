# Daily Spending Limit Tutorial

## Introduction

In this tutorial, we go through an example of how to implement the daily spending limit feature with Account Abstraction wallet on zkSync. We will build `SpendLimit` contract inherited from a multi-sig wallet contract and prevents the wallet from spending ETH more than the limit amount preliminarily set by the account.

## Prerequisite

The project in this tutorial is implemented with Account Abstraction wallet that you can learn about how to build on [the existing tutorial](https://v2-docs.zksync.io/dev/tutorials/custom-aa-tutorial.html#prerequisite). Hence, it is encouraged to finish that tutorial first, and read [the basics of Account Abstraction](https://v2-docs.zksync.io/dev/developer-guides/aa.html) on zkSync.

## Installing dependencies

We will use hardhat-plugins to deploy and perform transactions. First, let’s install all the dependencies for it:

```shell
mkdir custom-spendlimit-tutorial
cd custom-spendlimit-tutorial
yarn init -y
yarn add -D typescript ts-node ethers zksync-web3 hardhat @matterlabs/hardhat-zksync-solc @matterlabs/hardhat-zksync-deploy
```

Additionally, please install a few packages that allow us to utilize [zkSync smart contracts](https://v2-docs.zksync.io/dev/developer-guides/contracts/system-contracts.html).

```shell
yarn add @matterlabs/zksync-contracts @openzeppelin/contracts @openzeppelin/contracts-upgradeable
```

Lastly, create `hardhat.config.ts` config file and contracts and `deploy` folders like [quickstart tutorial](https://v2-docs.zksync.io/dev/developer-guides/hello-world.html).

\*TIP You can use the zkSync CLI to scaffold a project automatically. Find [more info about the zkSync CLI here](https://v2-docs.zksync.io/api/tools/zksync-cli/).

## Design

Now, let’s dive into the design and implementation of the daily spending limit feature that helps prevent an account from spending more than its owner wants it to do.

`SpendLimit` contract is inherited from `Account` contract as a module that has the following functionalities:

- Allow account to enable the daily spending limit in a token (ETH in this example).
- Allow account to change (increase/decrease or remove) the limit.
- Reject token transfer if the daily spending limit has been exceeded.
- Restore available amount for spending after 24 hours. 


### Basic structure

Below is the skeleton of the SpendLimit contract:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SpendLimit {

    uint public ONE_DAY = 24 hours;

    modifier onlyAccount() {
        require(
            msg.sender == address(this),
            "Only account that inherits this contract can call this method"
        );
        _;
    }

    function setSpendingLimit(address _token, uint _amount) public onlyAccount {
    }

    function removeSpendingLimit(address _token) public onlyAccount {
    }
    
    function _isValidUpdate(address _token) internal view returns(bool) {
    }

    function _updateLimit(address _token, uint _limit, uint _available, uint _resetTime, bool _isEnabled) private {
    }

    function _checkSpendingLimit(address _token, uint _amount) internal {
    }

}
```

First, add the mapping `limits` and struct `Limit` that serve as data storage for the state of daily limits accounts enable. The roles of each variable in the struct are commented out below.

```solidity
    struct Limit {
        uint limit;      // amount of daily spending limit
        uint available;  // available amount that can be spent
        uint resetTime;  // block.timestamp at the available amount is restored.
        bool isEnabled;  // true when the daily spending limit is enabled
    }

    mapping(address => Limit) public limits; // token => Limit
```

### Setting and Removal of the daily spending limit

And the implementation of the setting and removal of Limit is the following.

```solidity

    /// this function enables a daily spending limit for specific token.
    function setSpendingLimit(address _token, uint _amount) public onlyAccount {
        require(_amount != 0, "Invalid amount");

        uint resetTime;
        uint timestamp = block.timestamp; // L1 batch timestamp

        if (isValidUpdate(_token)) {
            resetTime = timestamp + ONE_DAY;
        } else {
            resetTime = timestamp;
        }
        
        _updateLimit(_token, _amount, _amount, resetTime, true);
    } 

    // this function disables an active daily spending limit,
    function removeSpendingLimit(address _token) public onlyAccount {
        require(isValidUpdate(_token), "Invalid Update");
        _updateLimit(_token, 0, 0, 0, false);
    }

    // verify if the update to a Limit struct is valid
    function _isValidUpdate(address _token) internal view returns(bool) {

        if (limits[_token].isEnabled) {
            require(limits[_token].limit == limits[_token].available || block.timestamp > limits[_token].resetTime,
                "Invalid Update");

            return true;
        } else {
            return false;
        }
    }

    // storage-modifying private function called by either setSpendingLimit or removeSpendingLimit
    function _updateLimit(address _token, uint _limit, uint _available, uint _resetTime, bool _isEnabled) private {
        Limit storage limit = limits[_token];
        limit.limit = _limit;
        limit.available = _available;
        limit.resetTime = _resetTime;
        limit.isEnabled = _isEnabled;
    }

```

Both `setSpendingLimit` and `removeSpendingLimit` can only be called by account contracts that inherit this contract `SpendLimit`, which is ensured by `onlyAccount` modifier. They call `_updateLimit` and pass the arguments to it to modify the storage data of Limit after the verification in `_isValidUpdate` suceeds.

`setSpendingLimit` enables a non-zero daily spending limit for a specific token, and `removeSpendingLimit` disables the active daily spending limit, decreasing `limit` and `available` to 0 and setting `isEnabled` false.

`_isValidUpdate` returns false if the spendling limit is not enabled and also throws `Invalid Update` error unless it is either it is first spending after enabling or called after 24 hours have passed since the last update to ensure that users can't freely modify(increase or remove) the daily limit to spend more.

### Checking if spendable

```solidity

    // this function is called by account before execution.
    function _checkSpendingLimit(address _token, uint _amount) internal {
        Limit memory limit = limits[_token];

        if(!limit.isEnabled) return;

        uint timestamp = block.timestamp; // l1BatchTimestamp

        if (limit.limit != limit.available && timestamp > limit.resetTime) {
            limit.resetTime = timestamp + ONE_DAY;
            limit.available = limit.limit;

        } else if (limit.limit == limit.available) {
            limit.resetTime = timestamp + ONE_DAY;
        }

        require(limit.available >= _amount, 'Exceed daily limit');

        limit.available -= _amount;
        limits[_token] = limit;
    }
```

`_checkSpendingLimit` function is called by account contract itself before execution.

 If the daily spending limit is disabled, the checking process immediately stops.

```solidity
if(!limit.isEnabled) return;
```

Before checking spending amount, it renews `resetTime` and `available` amount if a day has already passed since the last update : timestamp > resetTime. Or only `resetTime` is updated if it's the first spending after enabling limit. Otherwise, these processes are skipped.  

```solidity

if (limit.limit != limit.available && timestamp > limit.resetTime) {
      limit.resetTime = timestamp + ONE_DAY;
      limit.available = limit.limit;

} else if (limit.limit == limit.available) { 
      limit.resetTime = timestamp + ONE_DAY;
}
        
```

And, it checks to see if the account is able to spend a specified amount of the token. If the amount doesn't exceed the available, it decrements the `available` amount.

```solidity
require(limit.available >= _amount, 'Exceed daily limit');

limit.available -= _amount;
```

### Full code

Now, here is the full code of the SpendLimit contract. But one thing to be noted is that the value in `ONE_DAY` is set to 60 (60 seconds) insted of 86400 (24 hours) for the sake of the testing we will carry out later. So, don't forget to change the value or copy&paste the full code below for deploying.

```solidity

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SpendLimit {
    
    // uint public ONE_DAY = 24 hours; 
    uint public ONE_DAY = 1 minutes; // set to 1 min for tutorial

    /// This struct serves as data storage of daily limits users enable
    /// limit: amount of daily spending limit 
    /// available: available amount that can be spent 
    /// resetTime: block.timestamp at the available amount is restored
    /// isEnabled: true when the daily spending limit is enabled
    struct Limit {
        uint limit;
        uint available;
        uint resetTime;
        bool isEnabled;
    }

    mapping(address => Limit) public limits; // token => Limit

    modifier onlyAccount() {
        require(
            msg.sender == address(this),
            "Only account that inherits this contract can call this method"
        );
        _;
    }

    /// this function enables a daily spending limit for specific token.
    /// @param _token ETH or ERC20 token address that the given spending limit is applied to.
    /// @param _amount non-zero limit.
    function setSpendingLimit(address _token, uint _amount) public onlyAccount {
        require(_amount != 0, "Invalid amount");

        uint resetTime;
        uint timestamp = block.timestamp; // L1 batch timestamp

        if (isValidUpdate(_token)) {
            resetTime = timestamp + ONE_DAY;
        } else {
            resetTime = timestamp;
        }
        
        _updateLimit(_token, _amount, _amount, resetTime, true);
    } 

    // this function disables an active daily spending limit,
    // decreasing each uint number in Limit struct to zero and setting isEnabled false.
    function removeSpendingLimit(address _token) public onlyAccount {
        require(isValidUpdate(_token), "Invalid Update");
        _updateLimit(_token, 0, 0, 0, false);
    }

    // verify if the update to a Limit struct is valid
    // Ensure that users can't freely modify(increase or remove) the daily limit to spend more.
    function isValidUpdate(address _token) internal view returns(bool) {

        // Reverts unless it is first spending after enabling 
        // or called after 24 hours have passed since last update.
        if (limits[_token].isEnabled) {
            require(limits[_token].limit == limits[_token].available || block.timestamp > limits[_token].resetTime,
                "Invalid Update");

            return true;
        } else {
            return false;
        }
    }

    // storage-modifying private function called by either setSpendingLimit or removeSpendingLimit
    function _updateLimit(address _token, uint _limit, uint _available, uint _resetTime, bool _isEnabled) private {
        Limit storage limit = limits[_token];
        limit.limit = _limit;
        limit.available = _available;
        limit.resetTime = _resetTime;
        limit.isEnabled = _isEnabled;
    }

    // this function is called by account before execution.
    // Verify an account is able to spend a given amount of token and records a new available amount.
    function _checkSpendingLimit(address _token, uint _amount) internal {
        Limit memory limit = limits[_token];

        // return if spending limit hasn't been enabled yet
        if(!limit.isEnabled) return;

        uint timestamp = block.timestamp; // L1 batch timestamp

        // Renew resetTime and available amount, which is only performed
        // if a day has already passed since the last update : timestamp > resetTime
        if (limit.limit != limit.available && timestamp > limit.resetTime) {
            limit.resetTime = timestamp + ONE_DAY;
            limit.available = limit.limit;

        // Or only resetTime is updated if it's the first spending after enabling limit
        } else if (limit.limit == limit.available) {
            limit.resetTime = timestamp + ONE_DAY;
        }

        // reverts if amount exceeds the remaining available amount. 
        require(limit.available >= _amount, 'Exceed daily limit');

        // decrement `available` 
        limit.available -= _amount;
        limits[_token] = limit;
    }

}

```

### Modification to Account contract

That's pretty much for `SpendLimit`. Now, you also need to add `AAFactory.sol` and `Account.sol` from the existing tutorial on Account Abstraction. Those two contracts can be [downloadable here](https://github.com/matter-labs/custom-aa-tutorial/tree/main/contracts).

However, a change is needed: inserts a call `_checkSpendingLimit` from `_executeTransaction` of `TwoUserMultisig.sol` like below, which only gets triggered if `value` is non-zero.

```solidity

    ・・・

    function _executeTransaction(Transaction calldata _transaction) internal {
        address to = address(uint160(_transaction.to));
        uint256 value = _transaction.reserved[1];
        bytes memory data = _transaction.data;

        // This part //
        if ( value > 0 ) {
            _checkSpendingLimit(address(ETH_TOKEN_SYSTEM_CONTRACT), value);
        }
        // This part //

        if (to == address(DEPLOYER_SYSTEM_CONTRACT)) {

    ・・・

```

Since we set the spending limit of ETH in this example, the first argument in `_checkSpendingLimit` is `address(ETH_TOKEN_SYSTEM_CONTRACT)`, which is imported from a system contract calld `system-contracts/Constant.sol`.

Note: The formal ETH address on zkSync is `0x000000000000000000000000000000000000800a`, neither the common one `0xEee...EEeE` used by protocols as a placeholder on Ethereum, nor `0x000...000` which you can use via utils of `zksync-web3` package ([See](https://v2-docs.zksync.io/api/js/utils.html#the-address-of-ether)).

### Compile

Now, before deploying the contracts above, run:

```shell
yarn hardhat compile
```

## Deploying the smart contract

Finally, we are ready to deploy the contracts.

Below is a file that combines `deploy-factory.ts` and `deploy-multisig.ts` in the tutorial on Account Abstraction. So, create `deploy-factory-multisig.ts` and copy&paste this sample code in it.

```typescript
import { utils, Wallet, Provider, EIP712Signer, types } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

export default async function (hre: HardhatRuntimeEnvironment) {
	const provider = new Provider("https://zksync2-testnet.zksync.dev");
	const wallet = new Wallet("<WALLET_PRIVATE_KEY>", provider);
	const deployer = new Deployer(hre, wallet);
	const factoryArtifact = await deployer.loadArtifact("AAFactory");
	const aaArtifact = await deployer.loadArtifact("TwoUserMultisig");

	// If wallet on zkSync doesn't have enough funds.
	// const depositAmount = ethers.utils.parseEther('0.1');
	// const depositHandle = await deployer.zkWallet.deposit({
	//   to: deployer.zkWallet.address,
	//   token: utils.ETH_ADDRESS,
	//   amount: depositAmount,
	// });
	// await depositHandle.wait();

	const factory = await deployer.deploy(
		factoryArtifact,
		[utils.hashBytecode(aaArtifact.bytecode)],
		undefined,
		[aaArtifact.bytecode]
	);

	console.log(`AA factory address: ${factory.address}`);

	const aaFactory = new ethers.Contract(
		factory.address,
		factoryArtifact.abi,
		wallet
	);

	const owner1 = Wallet.createRandom();
	const owner2 = Wallet.createRandom();
	console.log("owner1 pk: ", owner1.privateKey);
	console.log("owner2 pk: ", owner2.privateKey);

	const salt = ethers.constants.HashZero;

	const tx = await aaFactory.deployAccount(
		salt,
		owner1.address,
		owner2.address
	);
	await tx.wait();

	const abiCoder = new ethers.utils.AbiCoder();
	const multisigAddress = utils.create2Address(
		factory.address,
		await aaFactory.aaBytecodeHash(),
		salt,
		abiCoder.encode(["address", "address"], [owner1.address, owner2.address])
	);

	console.log(`Multisig deployed on address ${multisigAddress}`);

	await (
		await wallet.sendTransaction({
			to: multisigAddress,
			value: ethers.utils.parseEther("0.01"),
		})
	).wait();

	let aaTx = await aaFactory.populateTransaction.deployAccount(
		salt,
		Wallet.createRandom().address,
		Wallet.createRandom().address
	);

	const gasLimit = await provider.estimateGas(aaTx);
	const gasPrice = await provider.getGasPrice();

	aaTx = {
		...aaTx,
		from: multisigAddress,
		gasLimit: gasLimit,
		gasPrice: gasPrice,
		chainId: (await provider.getNetwork()).chainId,
		nonce: await provider.getTransactionCount(multisigAddress),
		type: 113,
		customData: {
			ergsPerPubdata: utils.DEFAULT_ERGS_PER_PUBDATA_LIMIT,
		} as types.Eip712Meta,
		value: ethers.BigNumber.from(0),
	};
	const signedTxHash = EIP712Signer.getSignedDigest(aaTx);

	const signature = ethers.utils.concat([
		ethers.utils.joinSignature(owner1._signingKey().signDigest(signedTxHash)),
		ethers.utils.joinSignature(owner2._signingKey().signDigest(signedTxHash)),
	]);

	aaTx.customData = {
		...aaTx.customData,
		customSignature: signature,
	};

	const sentTx = await provider.sendTransaction(utils.serialize(aaTx));
	await sentTx.wait();
}
```

Then, after changing `<WALLET_PRIVATE_KEY>`, run:

```shell
yarn hardhat deploy-zksync --script deploy/deploy-factory-multisig.ts
```

the oupput would look like the following:

```shell
AA factory address: 0x9db333Cb68Fb6D317E3E415269a5b9bE7c72627Ds
owner1 pk: 0x71b552f26d193ab45ca474e29895721f97607580cd671c6c46b8b163c1c62c2d
owner2 pk: 0x84ea93d7a0b6f6c8de9c17a4dd0847c921d6f0963ac142fe2749880b814bdccb
Multisig deployed on address 0xCEBc59558938bccb43A6C94769F87bBdb770E956
```

So, we are ready to use `SpendLimit`. For the tests, now please open [zkSync2.0 testnet explorer](https://zksync2-testnet.zkscan.io/) and search for the deployed Multisig contract address on to be able to examine balances and transactions we will make in the next sections.

## Set the daily spending limit

First, please create `setLimit.ts` and after paste the example code below, replace the undefined multisig address and private key string values with the ones we got in the previous section.

To enable the daily spending limit, you need to call `setSpendingLimit` function with two parameters: token address and amount limit. Token address is ETH_ADDRESS and the limit parameter is "0.005" in the example below. (can be any number)

```typescript
import {
	utils,
	Wallet,
	Provider,
	Contract,
	EIP712Signer,
	types,
} from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const ETH_ADDRESS = "0x000000000000000000000000000000000000800A";
const MULTISIG_ADDRESS = "<MULTISIG_ADDRESS>";

export default async function (hre: HardhatRuntimeEnvironment) {
	const provider = new Provider("https://zksync2-testnet.zksync.dev");
	const wallet = new Wallet("<WALLET_PRIVATE_KEY>", provider);
	const owner1 = new Wallet("<OWNER1_PRIVATE_KEY>", provider);
	const owner2 = new Wallet("<OWNER2_PRIVATE_KEY>", provider);

	const multisigArtifact = await hre.artifacts.readArtifact("TwoUserMultisig");
	const multisig = new Contract(MULTISIG_ADDRESS, multisigArtifact.abi, wallet);

	let setLimitTx = await multisig.populateTransaction.setSpendingLimit(
		ETH_ADDRESS,
		ethers.utils.parseEther("0.005")
	);

	setLimitTx = {
		...setLimitTx,
		from: MULTISIG_ADDRESS,
		chainId: (await provider.getNetwork()).chainId,
		nonce: await provider.getTransactionCount(MULTISIG_ADDRESS),
		type: 113,
		customData: {
			ergsPerPubdata: utils.DEFAULT_ERGS_PER_PUBDATA_LIMIT,
		} as types.Eip712Meta,
		value: ethers.BigNumber.from(0),
	};

	setLimitTx.gasPrice = await provider.getGasPrice();
	setLimitTx.gasLimit = await provider.estimateGas(setLimitTx);

	const signedTxHash = EIP712Signer.getSignedDigest(setLimitTx);
	const signature = ethers.utils.concat([
		ethers.utils.joinSignature(owner1._signingKey().signDigest(signedTxHash)),
		ethers.utils.joinSignature(owner2._signingKey().signDigest(signedTxHash)),
	]);

	setLimitTx.customData = {
		...setLimitTx.customData,
		customSignature: signature,
	};

	const sentTx = await provider.sendTransaction(utils.serialize(setLimitTx));
	await sentTx.wait();

	const limit = await multisig.limits(ETH_ADDRESS);
	console.log("limit: ", limit.limit.toString());
	console.log("available: ", limit.available.toString());
	console.log("resetTime: ", limit.resetTime.toString());
	console.log("Enabled: ", limit.isEnabled);
}
```

The expected output would mostly look like this:

```shell
limit:  5000000000000000
available:  5000000000000000
resetTime:  1672928333
Enabled:  true
```

## Perform ETH transfer

Finally, we will see if SpendLimit contract works and refuses the ETH transfer that exceeds the daily limit. Let's create `transferETH.ts` with the example code below.

```typescript
import {
	utils,
	Wallet,
	Provider,
	Contract,
	EIP712Signer,
	types,
} from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const ETH_ADDRESS = "0x000000000000000000000000000000000000800A";
const MULTISIG_ADDRESS = "<MULTISIG_ADDRESS>";

export default async function (hre: HardhatRuntimeEnvironment) {
	const provider = new Provider("https://zksync2-testnet.zksync.dev");
	const wallet = new Wallet("<WALLET_PRIVATE_KEY>", provider);
	const owner1 = new Wallet("<OWNER1_PRIVATE_KEY>", provider);
	const owner2 = new Wallet("<OWNER2_PRIVATE_KEY>", provider);

	let ethTransferTx = {
		from: MULTISIG_ADDRESS,
		to: wallet.address,
		chainId: (await provider.getNetwork()).chainId,
		nonce: await provider.getTransactionCount(MULTISIG_ADDRESS),
		type: 113,
		customData: {
			ergsPerPubdata: utils.DEFAULT_ERGS_PER_PUBDATA_LIMIT,
		} as types.Eip712Meta,
		value: ethers.utils.parseEther("0.0051"), // 0.0051 fails but 0.0049 succeeds
		gasPrice: await provider.getGasPrice(),
		gasLimit: ethers.BigNumber.from(10000000), // contant 10M since estimateGas() causes an error
		data: "0x",
	};

	const signedTxHash = EIP712Signer.getSignedDigest(ethTransferTx);
	const signature = ethers.utils.concat([
		ethers.utils.joinSignature(owner1._signingKey().signDigest(signedTxHash)),
		ethers.utils.joinSignature(owner2._signingKey().signDigest(signedTxHash)),
	]);

	ethTransferTx.customData = {
		...ethTransferTx.customData,
		customSignature: signature,
	};

	const sentTx = await provider.sendTransaction(utils.serialize(ethTransferTx));
	await sentTx.wait();

	const multisigArtifact = await hre.artifacts.readArtifact("TwoUserMultisig");
	const multisig = new Contract(MULTISIG_ADDRESS, multisigArtifact.abi, wallet);

	const limit = await multisig.limits(ETH_ADDRESS);
	console.log("limit: ", limit.limit.toString());
	console.log("available: ", limit.available.toString());
	console.log("resetTime: ", limit.resetTime.toString());
	console.log("Enabled: ", limit.isEnabled);
}
```

To make a transfer, run:

```shell
yarn hardhat deploy-zksync --script deploy/transferETH.ts
```

Although the error message doesn't give us any concrete reason like "Exceed spending limit", it's anticipated that the transaction was reverted like below:

```shell
An unexpected error occurred:

Error: transaction failed...
```

Then, it's recommended to rerun the code with a different ETH amount that doesn't exceed the limit, say "0.0049", to ensure that the SpendLimit contract doesn't refuse the amount less than the limit.

If the transaction succeeds, the output would be like the following:

```shell
limit:  5000000000000000
available:  100000000000000
```

The value `available` in Limit struct was decremented, and now only 0.0001 ETH is available for transfer.

Then, now if we want to transfer more than the current available amount, 0.0001 ETH, we are supposed to wait 24 hours so that the reset will happen and the available amount will recover.

Nevertheless, since the `ONE_DAY` is set to 60 only for this test, another transfer with any amount less than the limit would succeed accordingly after a minute. Let's change the value for ETH transfer, say "0.003", and after a minute, run:

```shell
yarn hardhat deploy-zksync --script deploy/transferETH.ts

```

The reset was carried out successfully, which made another transfer possible.

```shell
limit:  5000000000000000
available: 2000000000000000 // 0.005 - 0.003 = 0.002

```

## Complete Project

You can download the complete project [here](https://github.com/porco-rosso-j/daily-spendlimit-tutorial). Additionally, the repository contains a test folder that can perform more detailed testing than this tutorial on zkSync local network.

## Learn more

- To learn more about L1->L2 interaction on zkSync, check out the [documentation](https://v2-docs.zksync.io/dev/developer-guides/bridging/l1-l2.html).
- To learn more about the zksync-web3 SDK, check out its [documentation](https://v2-docs.zksync.io/api/js).
- To learn more about the zkSync hardhat plugins, check out their [documentation](https://v2-docs.zksync.io/api/hardhat).
