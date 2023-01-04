import { Wallet, Contract, utils } from "zksync-web3";
import * as hre from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { BigNumber, ethers } from "ethers";

export async function deployAAFactory(deployer: Deployer): Promise<Contract> {
    const factoryArtifact = await deployer.loadArtifact("AAFactory");
    const accountArtifact = await deployer.loadArtifact("TwoUserMultisig");
    const bytecodeHash = utils.hashBytecode(accountArtifact.bytecode);
  
    return await deployer.deploy(factoryArtifact, [bytecodeHash], undefined, [accountArtifact.bytecode]);
    }

export async function deploySpendLimit(deployer: Deployer): Promise<Contract> {
  const artifact = await deployer.loadArtifact("SpendLimit");
  return await deployer.deploy(artifact);
}

export async function deployAccount(deployer: Deployer, wallet: Wallet, owner1: Wallet, owner2: Wallet, factory_address:string, spendlimit_address:string): Promise<Contract> {
    const factoryArtifact = await hre.artifacts.readArtifact("AAFactory");
    const factory = new ethers.Contract(factory_address, factoryArtifact.abi, wallet);
  
    const salt = ethers.constants.HashZero;
    await(await factory.deployAccount(salt, owner1.address, owner2.address, spendlimit_address)).wait()
  
    const AbiCoder = new ethers.utils.AbiCoder();
    const account_address = utils.create2Address(
        factory.address,
        await factory.aaBytecodeHash(),
        salt,
        AbiCoder.encode(["address", "address", "address"], [owner1.address, owner2.address, spendlimit_address])
    );
  
    const accountArtifact = await deployer.loadArtifact("TwoUserMultisig");
    
    return new ethers.Contract(account_address, accountArtifact.abi, wallet)
  }

