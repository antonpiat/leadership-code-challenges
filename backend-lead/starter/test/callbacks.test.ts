import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import { FundingTx, Wallet, WalletTx } from '../src/db/models';
import { dec } from '../src/lib/money';

const app = createApp();

let warnSpy: jest.SpyInstance;

beforeAll(async () => {
    await sequelize.authenticate();
    // The 404 and 409 tests log warnings on purpose; keep the test output clean
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
});

beforeEach(async () => {
    await sequelize.truncate({ cascade: true });
});

afterAll(async () => {
    warnSpy.mockRestore();
    await sequelize.close();
});

async function setup(amount = '100.50', turnoverMultiplier = 1) {
    const member = await request(app).post('/members').send({ username: 'alice01' });
    const memberId: string = member.body.member.id;
    const deposit = await request(app).post('/deposits').send({ memberId, amount, turnoverMultiplier });
    return { memberId, depositId: deposit.body.id as string, pspRef: deposit.body.pspRef as string };
}

function callback(pspRef: string, status: string, amount: string) {
    return request(app).post('/psp/callbacks').send({ pspRef, status, amount });
}

async function walletOf(memberId: string) {
    return (await Wallet.findOne({ where: { memberId } }))!;
}

describe('POST /psp/callbacks', () => {
    it('credits the wallet and adds turnover on completion', async () => {
        const { memberId, pspRef } = await setup('100.50', 2);

        const res = await callback(pspRef, 'completed', '100.50');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('Completed');
        const wallet = await walletOf(memberId);
        expect(dec(wallet.balance).eq('100.50')).toBe(true);
        expect(dec(wallet.turnoverRequired).eq('201')).toBe(true);
        expect(await WalletTx.count()).toBe(1);
    });

    it('does not double-credit a sequential duplicate', async () => {
        const { memberId, pspRef } = await setup();

        const first = await callback(pspRef, 'completed', '100.50');
        const second = await callback(pspRef, 'completed', '100.50');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        const wallet = await walletOf(memberId);
        expect(dec(wallet.balance).eq('100.50')).toBe(true);
        expect(await WalletTx.count()).toBe(1);
    });

    it('does not double-credit concurrent duplicates', async () => {
        const { memberId, pspRef } = await setup();

        const results = await Promise.all(
            Array.from({ length: 10 }, () => callback(pspRef, 'completed', '100.50')),
        );

        expect(results.every((r) => r.status === 200)).toBe(true);
        const wallet = await walletOf(memberId);
        expect(dec(wallet.balance).eq('100.50')).toBe(true);
        expect(await WalletTx.count()).toBe(1);
    });

    it('does not credit a failed payment, and rejects a later completion', async () => {
        const { memberId, pspRef } = await setup();

        const failed = await callback(pspRef, 'failed', '100.50');
        const completed = await callback(pspRef, 'completed', '100.50');

        expect(failed.status).toBe(200);
        expect(completed.status).toBe(409);
        const wallet = await walletOf(memberId);
        expect(dec(wallet.balance).isZero()).toBe(true);
        expect(await WalletTx.count()).toBe(0);
    });

    it('marks a mismatched amount as Disputed without crediting', async () => {
        const { memberId, depositId, pspRef } = await setup('100.50');

        const res = await callback(pspRef, 'completed', '999');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('Disputed');
        const deposit = await FundingTx.findByPk(depositId);
        expect(dec(deposit!.callbackAmount!).eq('999')).toBe(true);
        const wallet = await walletOf(memberId);
        expect(dec(wallet.balance).isZero()).toBe(true);
        expect(await WalletTx.count()).toBe(0);
    });

    it('returns 404 for an unknown pspRef', async () => {
        const res = await callback('does-not-exist', 'completed', '10');
        expect(res.status).toBe(404);
    });
});