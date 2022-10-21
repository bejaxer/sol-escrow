use anchor_lang::{prelude::*, solana_program::program::invoke};

#[cfg(not(feature = "local-testing"))]
declare_id!("FFuyrsPLstdzs8Q3ywzsy1X7j57ZBZCa3sQGSqv9SLKA");
#[cfg(feature = "local-testing")]
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod constants {
    pub const SOL_VAULT_PDA_SEED: &[u8] = b"SOL_VAULT";
    pub const LOCK_PERIOD: u64 = 300; // 5 minutes
}

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn lock(ctx: Context<Lock>, amount: u64) -> Result<()> {
        // validation check
        if amount == 0 {
            return Err(ErrorCode::ZeroAmount.into());
        }

        // transfer sol from user to the vault
        let from = &ctx.accounts.owner;
        let to = &ctx.accounts.sol_vault_account;

        let ix =
            anchor_lang::solana_program::system_instruction::transfer(from.key, to.key, amount);
        invoke(&ix, &[from.to_account_info(), to.to_account_info()])?;

        // update the user data
        let user_escrow_account = &mut ctx.accounts.user_escrow_account;
        user_escrow_account.sol_amount += amount;
        user_escrow_account.end_time =
            (Clock::get().unwrap().unix_timestamp as u64) + constants::LOCK_PERIOD;

        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        // validation check
        let user_escrow_account = &ctx.accounts.user_escrow_account;

        if user_escrow_account.end_time > (Clock::get().unwrap().unix_timestamp as u64) {
            return Err(ErrorCode::Locked.into());
        }

        // transfer sol from vault to the user
        let from = &ctx.accounts.sol_vault_account;
        let to = &ctx.accounts.owner;

        **from.try_borrow_mut_lamports()? = from
            .lamports()
            .checked_sub(user_escrow_account.sol_amount)
            .ok_or(ProgramError::InvalidArgument)?;
        **to.try_borrow_mut_lamports()? = to
            .lamports()
            .checked_add(user_escrow_account.sol_amount)
            .ok_or(ProgramError::InvalidArgument)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction()]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = initializer,
        seeds = [ constants::SOL_VAULT_PDA_SEED.as_ref() ],
        space = 0,
        bump,
    )]
    pub sol_vault_account: AccountInfo<'info>,

    #[account(mut)]
    pub initializer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction[]]
pub struct Lock<'info> {
    #[account(
        mut,
        seeds = [ constants::SOL_VAULT_PDA_SEED.as_ref() ],
        bump,
    )]
    pub sol_vault_account: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [ owner.key().as_ref( )],
        space = 24,
        bump,
    )]
    pub user_escrow_account: Box<Account<'info, EscrowAccount>>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction[]]
pub struct Claim<'info> {
    #[account(
        mut,
        seeds = [ constants::SOL_VAULT_PDA_SEED.as_ref() ],
        bump,
    )]
    pub sol_vault_account: AccountInfo<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [ owner.key().as_ref( )],
        bump
    )]
    pub user_escrow_account: Box<Account<'info, EscrowAccount>>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct EscrowAccount {
    pub sol_amount: u64,
    pub end_time: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Zero amount")]
    ZeroAmount, // 6000, 0x1770

    #[msg("Locked")]
    Locked, // 6001, 0x1771
}
