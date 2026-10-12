import { Router } from 'express';
import { z } from 'zod';
import { moneyAmount } from '../lib/validation';
import * as withdrawalService from '../services/withdrawalService';

export const withdrawalsRouter = Router();

const withdrawalBody = z.object({
    memberId: z.string().uuid(),
    amount: moneyAmount,
});

withdrawalsRouter.post('/', async (req, res, next) => {
    try {
        const body = withdrawalBody.parse(req.body);
        const result = await withdrawalService.createWithdrawal(body.memberId, body.amount);

        switch (result.outcome) {
            case 'not_found':
                res.status(404).json({ error: 'member not found' });
                return;
            case 'turnover_not_met':
                res.status(422).json({ error: 'turnover_not_met', outstandingTurnover: result.outstandingTurnover });
                return;
            case 'insufficient_balance':
                res.status(422).json({ error: 'insufficient_balance', balance: result.balance });
                return;
            default:
                res.status(201).json({
                    id: result.withdrawal.id,
                    status: result.withdrawal.status,
                    amount: result.withdrawal.amount,
                    balance: result.balance,
                });
        }
    } catch (err) {
        next(err);
    }
});