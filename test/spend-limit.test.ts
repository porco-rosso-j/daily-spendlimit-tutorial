import * as chai from "chai";
const expect = chai.expect;
import { solidity } from 'ethereum-waffle';
chai.use(solidity);

import { Wallet, Provider, Contract, utils } from "zksync-web3";
import * as hre from "hardhat";
import { ethers, BigNumber } from "ethers";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
const rich_wallet = require('../local-setup/rich-wallets');
const dev_pk = rich_wallet[0].privateKey

const ETH_ADDRESS = "0x000000000000000000000000000000000000800A"
const SLEEP_TIME = 10 // 10 sec

import { toBN, Tx, consoleLimit, consoleAddreses, getBalances } from "./utils/helper"
import {
    deployAAFactory,
    deployAccount
} from "./utils/deploy"
import { sendTx } from "./utils/sendtx"

let provider: Provider
let wallet: Wallet
let deployer: Deployer
let user1: Wallet
let user2: Wallet

let factory: Contract
let account: Contract

before(async () => {
    provider = Provider.getDefaultProvider();
    wallet = new Wallet(dev_pk, provider);
    deployer = new Deployer(hre, wallet);

    user1 = Wallet.createRandom();
    user2 = Wallet.createRandom();
  
    factory = await deployAAFactory(deployer);
    account = await deployAccount(deployer, wallet, user1, user2, factory.address);
  
      // 100 ETH transfered to Account
      await (
          await wallet.sendTransaction({
          to: account.address,
          value: toBN("100")
      })
      ).wait()

      // Modify ONE_DAY from 24horus to 10 seconds for the sake of testing.
      await(
        await account.changeONE_DAY(10)
      ).wait()
  
  })

  describe("Deployment & Setup", function () {

    it("Should deploy contracts, send ETH, and set varible correctly", async function () {

      expect(await provider.getBalance(account.address)).to.eq(toBN("100"))
      expect((await account.ONE_DAY()).toNumber()).to.equal(10)
  
      expect(await account.owner1()).to.equal(user1.address)
      expect(await account.owner2()).to.equal(user2.address)

      await consoleAddreses(wallet, factory, account, user1, user2)

    });

    it("Set Limit: Should add ETH spendinglimit correctly", async function(){

        let tx = await account.populateTransaction.setSpendingLimit(
            ETH_ADDRESS, toBN("10"), { value: toBN("0") }
        );
    
        const txReceipt = await sendTx(provider, account, user1, user2, tx)
        await txReceipt.wait()

        const limit = await account.limits(ETH_ADDRESS)
        expect(limit.limit).to.eq(toBN("10"))
        expect(limit.available).to.eq(toBN("10"))
        expect(limit.resetTime.toNumber()).to.closeTo(Math.floor(Date.now() / 1000), 5)
        expect(limit.isEnabled).to.eq(true)

        await consoleLimit(limit)

    })

  it("Transfer ETH 1: Should transfer correctly", async function() {

    const balances = await getBalances(provider, wallet, account, user1)

    const tx = Tx(user1, "5")

    const txReceipt = await sendTx(provider, account, user1, user2, tx)
    await txReceipt.wait()

    expect((await provider.getBalance(account.address))).to.be.closeTo((balances.AccountETHBal).sub(toBN("5")), toBN("0.01"))
    expect((await provider.getBalance(user1.address))).to.eq(balances.User1ETHBal.add(toBN("5")))

    const limit = await account.limits(ETH_ADDRESS)
    await consoleLimit(limit)

    expect(limit.limit).to.eq(toBN("10"))
    expect(limit.available).to.eq(toBN("5"))
    expect(limit.resetTime.toNumber()).to.lt(Math.floor(Date.now() / 1000))
    expect(limit.isEnabled).to.eq(true)

    await getBalances(provider, wallet, account, user1)

  })

  it("Transfer ETH 2: Should revert due to spending limit", async function() {

    const balances = await getBalances(provider, wallet, account, user1)

    const tx = Tx(user1, "6")
    const txReceipt = await sendTx(provider, account, user1, user2, tx)
    await expect(txReceipt.wait()).to.be.reverted

    expect((await provider.getBalance(account.address))).to.be.closeTo(balances.AccountETHBal, toBN("0.01"))
    expect((await provider.getBalance(user1.address))).to.eq(balances.User1ETHBal)

    const limit = await account.limits(ETH_ADDRESS)
    await consoleLimit(limit)

    expect(limit.limit).to.eq(toBN("10"))
    expect(limit.available).to.eq(toBN("5"))
    expect(limit.resetTime.toNumber()).to.lt(Math.floor(Date.now() / 1000))
    expect(limit.isEnabled).to.eq(true)

    await getBalances(provider, wallet, account, user1)

  })


  it("Transfer ETH 3: Should revert first but succeed after the daily limit resets", async function() {

    const balances = await getBalances(provider, wallet, account, user1)

    const tx = Tx(user1, "6")
    const resetTime = ((await account.limits(ETH_ADDRESS)).resetTime).toNumber()

    if (Math.floor(Date.now()/ 1000) <= resetTime + SLEEP_TIME) { // before 10 seconds has passed
        const txReceipt = await sendTx(provider, account, user1, user2, tx)
        await expect(txReceipt.wait()).to.be.reverted
    }

    await utils.sleep(SLEEP_TIME * 1000); 

    if (Math.floor(Date.now()/ 1000) >= resetTime + SLEEP_TIME) { // after 10 seconds has passed
        const txReceipt = await sendTx(provider, account, user1, user2, tx)
        await txReceipt.wait()
    }

    expect((await provider.getBalance(account.address))).to.be.closeTo(balances.AccountETHBal.sub(toBN("6")), toBN("0.01"))
    expect((await provider.getBalance(user1.address))).to.eq((balances.User1ETHBal.add(toBN("6"))))
      
    const limit = await account.limits(ETH_ADDRESS)
    await consoleLimit(limit)

    expect(limit.limit).to.eq(toBN("10"))
    expect(limit.available).to.eq(toBN("4"))
    expect(limit.resetTime.toNumber()).to.gt(resetTime)
    expect(limit.isEnabled).to.eq(true)

    await getBalances(provider, wallet, account, user1)

  })

})


describe("Spending Limit Updates", function () {

    beforeEach(async function () {
        await utils.sleep(SLEEP_TIME * 1000);

        let tx = await account.populateTransaction.setSpendingLimit(
            ETH_ADDRESS, toBN("10"), { value: toBN("0") }
        );
    
      const txReceipt = await sendTx(provider, account, user1, user2, tx)
      await txReceipt.wait()

    });

    it("Should succeed after overwriting SpendLimit", async function() {
        const balances = await getBalances(provider, wallet, account, user1)

        const tx1 = Tx(user1, "15")
        const txReceipt1 = await sendTx(provider, account, user1, user2, tx1)
        await expect(txReceipt1.wait()).to.be.reverted
    
        await utils.sleep(SLEEP_TIME * 1000);
    
        // Increase Limit
        const tx2 = await account.populateTransaction.setSpendingLimit(
            ETH_ADDRESS, toBN("20"), { value: toBN("0") }
            )
    
        const txReceipt2 = await sendTx(provider, account, user1, user2, tx2)
        await txReceipt2.wait()

        const txReceipt3 = await sendTx(provider, account, user1, user2, tx1)
        await txReceipt3.wait()
    
        expect((await provider.getBalance(account.address))).to.be.closeTo(balances.AccountETHBal.sub(toBN("15")), toBN("0.01"))
        expect((await provider.getBalance(user1.address))).to.eq((balances.User1ETHBal.add(toBN("15"))))

    
        const limit = await account.limits(ETH_ADDRESS)
        await consoleLimit(limit)

        expect(limit.limit).to.eq(toBN("20"))
        expect(limit.available).to.eq(toBN("5"))
        expect(limit.resetTime.toNumber()).to.lt(Math.floor(Date.now() / 1000))
        expect(limit.isEnabled).to.eq(true)
    
        
        await getBalances(provider, wallet, account, user1)
      })

      it("Should succeed after removing SpendLimit", async function() {
        const balances = await getBalances(provider, wallet, account, user1)

        const tx1 = Tx(user1, "30")
        const txReceipt1 = await sendTx(provider, account, user1, user2, tx1)
        await expect(txReceipt1.wait()).to.be.reverted
    
        await utils.sleep(SLEEP_TIME * 1000); 
    
        // Remove Limit
        const tx2 = await account.populateTransaction.removeSpendingLimit(
            ETH_ADDRESS, { value: toBN("0") }
            )
    
        const txReceipt2 = await sendTx(provider, account, user1, user2, tx2)
        await txReceipt2.wait()

        const txReceipt3 = await sendTx(provider, account, user1, user2, tx1)
        await txReceipt3.wait()
    
        expect((await provider.getBalance(account.address))).to.be.closeTo(balances.AccountETHBal.sub(toBN("30")), toBN("0.01"))
        expect((await provider.getBalance(user1.address))).to.eq((balances.User1ETHBal.add(toBN("30"))))

        const limit = await account.limits(ETH_ADDRESS)
        await consoleLimit(limit)

        expect(limit.limit).to.eq(toBN("0"))
        expect(limit.available).to.eq(toBN("0"))
        expect(limit.resetTime.toNumber()).to.eq(0)
        expect(limit.isEnabled).to.eq(false)
    
        await getBalances(provider, wallet, account, user1)
      })

      it("Should revert. Invalid update of SpendLimit", async function() {

        const tx1 = await account.populateTransaction.setSpendingLimit(
            ETH_ADDRESS, toBN("100"), { value: toBN("0"), gasLimit: ethers.utils.hexlify(600000) }
            )
    
        const txReceipt1 = await sendTx(provider, account, user1, user2, tx1)
        await expect(txReceipt1.wait()).to.be.reverted
    
        const tx2 = await account.populateTransaction.removeSpendingLimit(
            ETH_ADDRESS, { value: toBN("0"), gasLimit: ethers.utils.hexlify(600000) }
            )
    
        const txReceipt2 = await sendTx(provider, account, user1, user2, tx2)
        await expect(txReceipt2.wait()).to.be.reverted
    
        const limit = await account.limits(ETH_ADDRESS)
        await consoleLimit(limit)

        expect(limit.limit).to.eq(toBN("10"))
        expect(limit.available).to.eq(toBN("10"))
        expect(limit.resetTime.toNumber()).to.lt(Math.floor(Date.now() / 1000))
        expect(limit.isEnabled).to.eq(true)
    
      })
})