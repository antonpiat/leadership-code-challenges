import { sequelize } from '../db/sequelize';
import { FundingTx, Wallet, WalletTx } from '../db/models';
import { dec } from '../lib/money';

export type WithdrawalResult =
    | { outcome: 'not_found' }
    | { outcome: 'turnover_not_met'; outstandingTurnover: string }
    | { outcome: 'insufficient_balance'; balance: string }
    | { outcome: 'created'; withdrawal: FundingTx; balance: string };

// Debits the wallet now and records a Pending withdrawal for a human to approve later.
export async function createWithdrawal(memberId: string, amount: string): Promise<WithdrawalResult> {
    return sequelize.transaction(async (t) => {
        // Lock the wallet first: both checks below must see numbers no concurrent request can change
        const wallet = await Wallet.findOne({ where: { memberId }, transaction: t, lock: t.LOCK.UPDATE });
        if (!wallet) {
            return { outcome: 'not_found' };
        }

        // Anti-abuse rule: total wagered must reach total required before any withdrawal
        const required = dec(wallet.turnoverRequired);
        const accrued = dec(wallet.turnoverAccrued);
        if (accrued.lt(required)) {
            return { outcome: 'turnover_not_met', outstandingTurnover: required.minus(accrued).toFixed() };
        }

        const value = dec(amount);
        const balance = dec(wallet.balance);
        if (balance.lt(value)) {
            return { outcome: 'insufficient_balance', balance: balance.toFixed() };
        }

        const newBalance = balance.minus(value);
        wallet.balance = newBalance.toFixed();
        await wallet.save({ transaction: t });

        const withdrawal = await FundingTx.create(
            { walletId: wallet.id, type: 'withdrawal', status: 'Pending', amount: value.toFixed() },
            { transaction: t },
        );

        await WalletTx.create(
            {
                walletId: wallet.id,
                type: 'withdrawal',
                amount: value.negated().toFixed(), // debit, so negative
                balanceAfter: newBalance.toFixed(),
                fundingTxId: withdrawal.id,
            },
            { transaction: t },
        );

        return { outcome: 'created', withdrawal, balance: newBalance.toFixed() };
    });
}