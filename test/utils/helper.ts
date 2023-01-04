import { ethers, BigNumber} from "ethers";
import { Wallet, Provider, Contract, utils } from "zksync-web3";

export const toBN = (x: string): BigNumber => {
    return ethers.utils.parseEther(x)
}

export const Tx = (user1:Wallet, value:string) => {
    return {
        to: user1.address,
        value: ethers.utils.parseEther(value),
        data: "0x",
    }
}

export async function consoleLimit(limit) {
    console.log(
      '\n',
      '"Limit"', '\n',
      '- Limit: ', limit.limit.toString(), '\n',
      '- Spent: ', limit.spent.toString(), '\n',
      '- Reset Time: ', limit.resetTime.toString(), '\n',
      '- Now: ', (Math.floor(Date.now() / 1000)).toString(), '\n',
      '- isEnabled: ', limit.isEnabled.toString(), '\n',
      '\n',
    )
  }

export async function consoleAddreses(wallet, factory, spendLimit, account, user1, user2) {
    console.log(
        '\n',
        '-- Addresses -- ','\n',
        '- Wallet: ', wallet.address, '\n',
        '- Factory: ', factory.address, '\n',
        '- SpendLimit: ', spendLimit.address, '\n',
        '- Account: ', account.address, '\n',
        '- User1: ', user1.address, '\n',
        '- User2: ', user2.address, '\n',
        '\n',
      )
  }

  export async function getBalances(provider, wallet, account, user1) {

    const WalletETHBal = await provider.getBalance(wallet.address)
    const AccountETHBal = await provider.getBalance(account.address)
    const User1ETHBal = await provider.getBalance(user1.address)
  
    console.log(
        '\n',
        'Balances', '\n',
        '- Wallet ETH balance: ', WalletETHBal.toString(), '\n',
        '- Account ETH balance: ', AccountETHBal.toString(), '\n',
        '- User1 ETH balance: ', User1ETHBal.toString(), '\n',
        '\n',
      )
  
    const balances = {
        WalletETHBal, 
        AccountETHBal, 
        User1ETHBal 
    }
  
    return balances
    
  }