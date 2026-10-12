import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import { FundingTx, Wallet, WalletTx } from '../src/db/models';
import { dec } from '../src/lib/money';

const app = createApp();

beforeAll(async () => {
    await sequelize.authenticate();
});

beforeEach(async () => {
    await sequelize.truncate({ cascade: true });
});

afterAll(async () => {
    await sequelize.close();
});

async function createMember(): Promise<{ memberId: string; walletId: string }> {
    const member = await request(app).post('/members').send({ username: 'alice01' });
    const memberId: string = member.body.member.id;
    const wallet = await request(app).get(`/members/${memberId}/wallet`);
    return { memberId, walletId: wallet.body.id };
}

// Creates a deposit and completes it through the PSP callback.
async function deposit(memberId: string, amount: string, turnoverMultiplier: number) {
    const res = await request(app).post('/deposits').send({ memberId, amount, turnoverMultiplier });
    await request(app).post('/psp/callbacks').send({ pspRef: res.body.pspRef, status: 'completed', amount });
}

function wager(walletId: string, amount: string) {
    return request(app).post(`/wallets/${walletId}/wagers`).send({ amount });
}

function withdraw(memberId: string, amount: string) {
    return request(app).post('/withdrawals').send({ memberId, amount });
}

async function ledgerSum(walletId: string) {
    const rows = await WalletTx.findAll({ where: { walletId } });
    return rows.reduce((sum, row) => sum.plus(row.amount), dec(0));
}

describe('POST /withdrawals', () => {
    it('blocks a withdrawal and reports the outstanding turnover', async () => {
        const { memberId, walletId } = await createMember();
        await deposit(memberId, '100', 1);
        await wager(walletId, '30');

        const res = await withdraw(memberId, '50');

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('turnover_not_met');
        expect(dec(res.body.outstandingTurnover).eq('70')).toBe(true);
        const wallet = (await Wallet.findByPk(walletId))!;
        expect(dec(wallet.balance).eq('70')).toBe(true);
    });

    it('unblocks once enough has been wagered', async () => {
        const { memberId, walletId } = await createMember();
        await deposit(memberId, '100', 1); // requires 100 of turnover
        await deposit(memberId, '100', 0); // requires none
        expect((await withdraw(memberId, '50')).status).toBe(422);

        await wager(walletId, '100'); // turnover now met, 100 left in the wallet
        const res = await withdraw(memberId, '50');

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('Pending');
        const wallet = (await Wallet.findByPk(walletId))!;
        expect(dec(wallet.balance).eq('50')).toBe(true);
        const withdrawal = (await FundingTx.findByPk(res.body.id))!;
        expect(withdrawal.type).toBe('withdrawal');
        expect((await ledgerSum(walletId)).eq(wallet.balance)).toBe(true);
    });

    it('allows an immediate withdrawal when the multiplier is 0', async () => {
        const { memberId } = await createMember();
        await deposit(memberId, '100', 0);

        expect((await withdraw(memberId, '100')).status).toBe(201);
    });

    it('rejects a withdrawal larger than the balance', async () => {
        const { memberId } = await createMember();
        await deposit(memberId, '100', 0);

        const res = await withdraw(memberId, '100.01');

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('insufficient_balance');
    });

    it('cannot be overdrawn by concurrent withdrawals', async () => {
        const { memberId, walletId } = await createMember();
        await deposit(memberId, '100', 0);

        const results = await Promise.all(Array.from({ length: 5 }, () => withdraw(memberId, '30')));

        expect(results.filter((r) => r.status === 201)).toHaveLength(3);
        const wallet = (await Wallet.findByPk(walletId))!;
        expect(dec(wallet.balance).eq('10')).toBe(true);
        expect((await ledgerSum(walletId)).eq(wallet.balance)).toBe(true);
    });

    it('returns 404 for an unknown member', async () => {
        const res = await withdraw('00000000-0000-4000-8000-000000000000', '10');
        expect(res.status).toBe(404);
    });
});