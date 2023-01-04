import { Wallet } from 'zksync-web3';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';

export default async function (hre: HardhatRuntimeEnvironment) {
  const wallet = new Wallet("ab22105985fa7a751c90cfe08613290f1fb3b4310b309a4f51f0a7f95b8855a5");
  const deployer = new Deployer(hre, wallet);
  const spendLimitArtifact = await deployer.loadArtifact('SpendLimit');

  const spendLimit = await deployer.deploy(spendLimitArtifact);
  console.log(` spendLimit address: ${spendLimit.address}`);

}