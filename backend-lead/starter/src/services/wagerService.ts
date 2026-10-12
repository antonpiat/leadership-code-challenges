import { sequelize } from '../db/sequelize';
import { Wager, Wallet, WalletTx } from '../db/models';
import { dec } from '../lib/money';

export type WagerResult =
    | { outcome: 'not_found' }
    | { outcome: 'insufficient_balance'; balance: string }
    | { outcome: 'placed'; wager: Wager; balance: string };

// Debits the wallet, accrues turnover and writes the ledger entry, all in one transaction.
export async function placeWager(walletId: string, amount: string): Promise<WagerResult> {
    return sequelize.transaction(async (t) => {
        // Lock the wallet before reading the balance. A concurrent wager waits here,
        // then sees the reduced balance, so two wagers can't spend the same money.
        const wallet = await Wallet.findByPk(walletId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!wallet) {
            return { outcome: 'not_found' };
        }

        const stake = dec(amount);
        const balance = dec(wallet.balance);
        if (balance.lt(stake)) {
            return { outcome: 'insufficient_balance', balance: balance.toFixed() };
        }

        const newBalance = balance.minus(stake);
        wallet.balance = newBalance.toFixed();
        wallet.turnoverAccrued = dec(wallet.turnoverAccrued).plus(stake).toFixed();
        await wallet.save({ transaction: t });

        const wager = await Wager.create({ walletId, amount: stake.toFixed() }, { transaction: t });

        await WalletTx.create(
            {
                walletId,
                type: 'wager',
                amount: stake.negated().toFixed(), // debit, so negative
                balanceAfter: newBalance.toFixed(),
                wagerId: wager.id,
            },
            { transaction: t },
        );

        return { outcome: 'placed', wager, balance: newBalance.toFixed() };
    });
}