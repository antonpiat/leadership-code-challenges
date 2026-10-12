import { Transaction } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { FundingTx, Wallet, WalletTx } from '../db/models';
import { FundingTxStatus } from '../db/models/fundingTx';
import { dec } from '../lib/money';
import { canTransition } from '../lib/stateMachine';

export type CallbackStatus = 'completed' | 'failed';

export type CallbackResult =
    | { outcome: 'unknown' }
    | { outcome: 'applied' | 'duplicate' | 'conflict'; status: FundingTxStatus };

// Applies a PSP callback exactly once, however many times or how concurrently it arrives.
export async function handleCallback(
    pspRef: string,
    callbackStatus: CallbackStatus,
    callbackAmount: string,
): Promise<CallbackResult> {
    return sequelize.transaction(async (t) => {
        // Lock the deposit row. A concurrent duplicate waits here until this transaction
        // commits, then reads the updated status and becomes a no-op.
        const deposit = await FundingTx.findOne({
            where: { pspRef, type: 'deposit' },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!deposit) {
            return { outcome: 'unknown' };
        }

        const target = targetStatus(deposit, callbackStatus, callbackAmount);

        // Same result as before: a repeated delivery. Nothing to do.
        if (deposit.status === target) {
            return { outcome: 'duplicate', status: deposit.status };
        }
        // Anything else not allowed by the state machine is rejected, not applied.
        if (!canTransition(deposit.status, target)) {
            return { outcome: 'conflict', status: deposit.status };
        }

        if (target === 'Completed') {
            await creditWallet(deposit, t);
        }

        deposit.status = target;
        deposit.callbackAmount = callbackAmount;
        await deposit.save({ transaction: t });

        return { outcome: 'applied', status: target };
    });
}

// Which status this callback asks for. A completed callback with the wrong amount is Disputed.
function targetStatus(deposit: FundingTx, callbackStatus: CallbackStatus, callbackAmount: string): FundingTxStatus {
    if (callbackStatus === 'failed') {
        return 'Failed';
    }
    return dec(callbackAmount).eq(deposit.amount) ? 'Completed' : 'Disputed';
}

// Credits the wallet, adds the turnover requirement, and writes the ledger entry.
async function creditWallet(deposit: FundingTx, t: Transaction): Promise<void> {
    // Lock order is always deposit first, then wallet, which prevents deadlocks.
    const wallet = await Wallet.findByPk(deposit.walletId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!wallet) {
        throw new Error(`Wallet ${deposit.walletId} not found for deposit ${deposit.id}`);
    }

    const amount = dec(deposit.amount);
    const newBalance = dec(wallet.balance).plus(amount);
    const addedTurnover = amount.times(deposit.turnoverMultiplier ?? 0);

    wallet.balance = newBalance.toFixed();
    wallet.turnoverRequired = dec(wallet.turnoverRequired).plus(addedTurnover).toFixed();
    await wallet.save({ transaction: t });

    // The unique key (funding_tx_id, type) makes a second credit for this deposit impossible.
    await WalletTx.create(
        {
            walletId: wallet.id,
            type: 'deposit',
            amount: amount.toFixed(),
            balanceAfter: newBalance.toFixed(),
            fundingTxId: deposit.id,
        },
        { transaction: t },
    );
}