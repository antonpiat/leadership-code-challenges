import { randomUUID } from 'crypto';
import { FundingTx, Wallet } from '../db/models';

// Returns null if the member has no wallet (the route turns that into a 404).
export async function createDeposit(
    memberId: string,
    amount: string,
    turnoverMultiplier: number,
): Promise<FundingTx | null> {
    const wallet = await Wallet.findOne({ where: { memberId } });
    if (!wallet) {
        return null;
    }

    return FundingTx.create({
        walletId: wallet.id,
        type: 'deposit',
        status: 'Pending',
        amount,
        pspRef: randomUUID(),
        turnoverMultiplier,
    });
}