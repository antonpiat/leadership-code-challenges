import { FundingTxStatus } from '../db/models/fundingTx';

// Every status a funding transaction may move to from its current status.
// Completed, Failed and Disputed are final: nothing moves them automatically.
const allowedTransitions: Record<FundingTxStatus, FundingTxStatus[]> = {
    Pending: ['Completed', 'Failed', 'Disputed'],
    Completed: [],
    Failed: [],
    Disputed: [],
};

export function canTransition(from: FundingTxStatus, to: FundingTxStatus): boolean {
    return allowedTransitions[from].includes(to);
}