import { utils, Wallet, Provider, Contract, EIP712Signer, types} from 'zksync-web3';
import * as ethers from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const ETH_ADDRESS = "0x000000000000000000000000000000000000800A"
const MULTISIG_ADDRESS = '<MULTISIG_ADDRESS>'
const SPENDLIMIT_ADDRESS = '<SPEND_LIMIT_ADDRESS>'

export default async function (hre: HardhatRuntimeEnvironment) { 
  const provider = new Provider('https://zksync2-testnet.zksync.dev');
  const wallet = new Wallet('<WALLET_PRIVATE_KEY>', provider);
  const owner1 = new Wallet('<OWNER1_PRIVATE_KEY>', provider)
  const owner2 = new Wallet('<OWNER2_PRIVATE_KEY>', provider)

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
        gasLimit: ethers.BigNumber.from(5000000), // contant 5M since estimateGas() causes constant error
        data: "0x"
      }
    
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

  const spendLimitArtifact = await hre.artifacts.readArtifact('SpendLimit');
  const spendLimit = new Contract(SPENDLIMIT_ADDRESS, spendLimitArtifact.abi, wallet)

  const limit = await spendLimit.getLimit(MULTISIG_ADDRESS, ETH_ADDRESS)
  console.log("limit: ", limit.limit.toString())
  console.log("available: ", limit.available.toString())
  console.log("resetTime: ", limit.resetTime.toString())
  console.log("Enabled: ", limit.isEnabled)

}