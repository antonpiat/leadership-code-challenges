import BigNumber from 'bignumber.js';
import { z } from 'zod';

// A positive amount as a decimal string, e.g. "100" or "100.50".
// Strings only: a JSON number like 0.1 may already have lost precision.
// Max 18 digits before and after the dot, to fit DECIMAL(36,18).
export const moneyAmount = z
    .string()
    .regex(/^\d{1,18}(\.\d{1,18})?$/, 'must be a decimal string, e.g. "100.50"')
    .refine((v) => new BigNumber(v).gt(0), 'must be greater than 0');