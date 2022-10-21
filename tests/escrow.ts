import * as anchor from '@project-serum/anchor'
import { web3, Program } from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'
import assert from 'assert'
import { Escrow } from '../target/types/escrow'

let program = anchor.workspace.Escrow as Program<Escrow>

const envProvider = anchor.AnchorProvider.env()

let provider = envProvider

function setProvider(p: anchor.AnchorProvider) {
  provider = p
  anchor.setProvider(p)
  program = new anchor.Program(
    program.idl,
    program.programId,
    p
  ) as Program<Escrow>
}
setProvider(provider)

describe('escrow', () => {
  // Vault
  let solVaultPubkey: PublicKey
  const solVaultSeed = 'SOL_VAULT'

  // Alice
  const alicePubkey = provider.wallet.publicKey
  let aliceEscrowAccountPubkey: PublicKey

  before(async () => {
    let bump
    ;[solVaultPubkey, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode(solVaultSeed))],
      program.programId
    )
    ;[aliceEscrowAccountPubkey, bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [alicePubkey.toBuffer()],
        program.programId
      )
  })

  it('Initialize', async () => {
    await program.rpc.initialize({
      accounts: {
        initializer: provider.wallet.publicKey,
        solVaultAccount: solVaultPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    })
  })

  describe('Alice actions', async () => {
    it('Lock zero amount', async () => {
      await assert.rejects(
        async () => {
          await program.rpc.lock(new anchor.BN(0), {
            accounts: {
              solVaultAccount: solVaultPubkey,
              userEscrowAccount: aliceEscrowAccountPubkey,
              owner: alicePubkey,
              systemProgram: anchor.web3.SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
          })
        },
        {
          message:
            'AnchorError occurred. Error Code: ZeroAmount. Error Number: 6000. Error Message: Zero amount.',
        }
      )
    })
    it('Lock 1 sol', async () => {
      const amount = 1_000_000_000
      const oldVaultBalance = await provider.connection.getBalance(
        solVaultPubkey
      )

      await program.rpc.lock(new anchor.BN(amount), {
        accounts: {
          solVaultAccount: solVaultPubkey,
          userEscrowAccount: aliceEscrowAccountPubkey,
          owner: alicePubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      })

      const aliceEscrowAccount = await program.account.escrowAccount.fetch(
        aliceEscrowAccountPubkey
      )
      assert.equal(aliceEscrowAccount.solAmount.toString(), amount)

      const newVaultBalance = await provider.connection.getBalance(
        solVaultPubkey
      )
      assert.equal(newVaultBalance - oldVaultBalance, amount)
    })
    it('Lock 2 sol more', async () => {
      const amount = 2_000_000_000
      const oldVaultBalance = await provider.connection.getBalance(
        solVaultPubkey
      )

      await program.rpc.lock(new anchor.BN(amount), {
        accounts: {
          solVaultAccount: solVaultPubkey,
          userEscrowAccount: aliceEscrowAccountPubkey,
          owner: alicePubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      })

      const aliceEscrowAccount = await program.account.escrowAccount.fetch(
        aliceEscrowAccountPubkey
      )
      assert.equal(aliceEscrowAccount.solAmount.toString(), 3_000_000_000)

      const newVaultBalance = await provider.connection.getBalance(
        solVaultPubkey
      )
      assert.equal(newVaultBalance - oldVaultBalance, amount)
    })
    it('Claim locked', async () => {
      await assert.rejects(
        async () => {
          await program.rpc.claim({
            accounts: {
              solVaultAccount: solVaultPubkey,
              userEscrowAccount: aliceEscrowAccountPubkey,
              owner: alicePubkey,
              systemProgram: anchor.web3.SystemProgram.programId,
            },
          })
        },
        {
          message:
            'AnchorError occurred. Error Code: Locked. Error Number: 6001. Error Message: Locked.',
        }
      )
    })
    it('Claim unlocked', async () => {
      const amount = 3_000_000_000
      const oldBalance = await provider.connection.getBalance(alicePubkey)
      const oldVaultBalance = await provider.connection.getBalance(
        solVaultPubkey
      )

      await sleep(300000) // wait 5 minutes
      await program.rpc.claim({
        accounts: {
          solVaultAccount: solVaultPubkey,
          userEscrowAccount: aliceEscrowAccountPubkey,
          owner: alicePubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      })

      await assert.rejects(
        async () => {
          await program.account.escrowAccount.fetch(aliceEscrowAccountPubkey)
        },
        {
          message:
            'Account does not exist ' + aliceEscrowAccountPubkey.toString(),
        }
      )

      const newBalance = await provider.connection.getBalance(alicePubkey)
      assert.equal(newBalance > oldBalance, true)

      const newVaultBalance = await provider.connection.getBalance(
        solVaultPubkey
      )
      assert.equal(oldVaultBalance - newVaultBalance, amount)
    })
  })
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
