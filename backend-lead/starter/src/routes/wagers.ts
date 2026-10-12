import { Router } from 'express';
import { z } from 'zod';
import { moneyAmount } from '../lib/validation';
import * as wagerService from '../services/wagerService';

// mergeParams lets this router read :walletId from the mount path in app.ts
export const wagersRouter = Router({ mergeParams: true });

const wagerParams = z.object({ walletId: z.string().uuid() });
const wagerBody = z.object({ amount: moneyAmount });

wagersRouter.post('/', async (req, res, next) => {
    try {
        const { walletId } = wagerParams.parse(req.params);
        const body = wagerBody.parse(req.body);
        const result = await wagerService.placeWager(walletId, body.amount);

        switch (result.outcome) {
            case 'not_found':
                res.status(404).json({ error: 'wallet not found' });
                return;
            case 'insufficient_balance':
                res.status(422).json({ error: 'insufficient_balance', balance: result.balance });
                return;
            default:
                res.status(201).json({ id: result.wager.id, amount: result.wager.amount, balance: result.balance });
        }
    } catch (err) {
        next(err);
    }
});