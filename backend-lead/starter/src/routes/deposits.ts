import { Router } from 'express';
import { z } from 'zod';
import { moneyAmount } from '../lib/validation';
import * as depositService from '../services/depositService';

export const depositsRouter = Router();

const createDepositBody = z.object({
    memberId: z.string().uuid(),
    amount: moneyAmount,
    turnoverMultiplier: z.number().int().min(0).default(1),
});

depositsRouter.post('/', async (req, res, next) => {
    try {
        const body = createDepositBody.parse(req.body);
        const deposit = await depositService.createDeposit(body.memberId, body.amount, body.turnoverMultiplier);
        if (!deposit) {
            res.status(404).json({ error: 'member not found' });
            return;
        }
        res.status(201).json({ id: deposit.id, pspRef: deposit.pspRef, status: deposit.status });
    } catch (err) {
        next(err);
    }
});