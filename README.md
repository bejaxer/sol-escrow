# sol-escrow

## Build the contract

`anchor build`

## Test the contract

`anchor test`

## Deploy the contract

`solana-keygen pubkey [target/deploy/escrow-keypair.json path]`

Update the program-id on the lib.rs

`solana program deploy [target/deploy/escrow.so path]`
