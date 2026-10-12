import { Router } from 'express';
import { z } from 'zod';
import { moneyAmount } from '../lib/validation';
import * as callbackService from '../services/callbackService';

export const pspRouter = Router();

const callbackBody = z.object({
    pspRef: z.string().min(1),
    status: z.enum(['completed', 'failed']),
    amount: moneyAmount,
});

pspRouter.post('/callbacks', async (req, res, next) => {
    try {
        const body = callbackBody.parse(req.body);
        const result = await callbackService.handleCallback(body.pspRef, body.status, body.amount);

        switch (result.outcome) {
            case 'unknown':
                // eslint-disable-next-line no-console
                console.warn('PSP callback for unknown pspRef', body.pspRef);
                res.status(404).json({ error: 'unknown pspRef' });
                return;
            case 'conflict':
                // eslint-disable-next-line no-console
                console.warn('PSP callback conflicts with current status', body.pspRef, body.status, result.status);
                res.status(409).json({ error: 'invalid_transition', status: result.status });
                return;
            default:
                // applied or duplicate: both are a success for the PSP, so it stops retrying
                res.status(200).json({ status: result.status });
        }
    } catch (err) {
        next(err);
    }
});