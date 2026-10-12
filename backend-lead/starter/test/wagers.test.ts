import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import { Wallet, WalletTx } from '../src/db/models';
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

// Creates a member whose wallet holds `amount` from a completed deposit.
async function fundedWallet(amount = '100'): Promise<string> {
    const member = await request(app).post('/members').send({ username: 'alice01' });
    const memberId: string = member.body.member.id;
    const deposit = await request(app).post('/deposits').send({ memberId, amount });
    await request(app).post('/psp/callbacks').send({ pspRef: deposit.body.pspRef, status: 'completed', amount });
    const wallet = await request(app).get(`/members/${memberId}/wallet`);
    return wallet.body.id;
}

function wager(walletId: string, amount: string | number) {
    return request(app).post(`/wallets/${walletId}/wagers`).send({ amount });
}

async function ledgerSum(walletId: string) {
    const rows = await WalletTx.findAll({ where: { walletId } });
    return rows.reduce((sum, row) => sum.plus(row.amount), dec(0));
}

describe('POST /wallets/:walletId/wagers', () => {
    it('debits the wallet, accrues turnover and writes a ledger entry', async () => {
        const walletId = await fundedWallet('100');

        const res = await wager(walletId, '30');

        expect(res.status).toBe(201);
        const wallet = (await Wallet.findByPk(walletId))!;
        expect(dec(wallet.balance).eq('70')).toBe(true);
        expect(dec(wallet.turnoverAccrued).eq('30')).toBe(true);
        expect((await ledgerSum(walletId)).eq(wallet.balance)).toBe(true);
    });

    it('rejects a wager larger than the balance and changes nothing', async () => {
        const walletId = await fundedWallet('100');

        const res = await wager(walletId, '100.01');

        expect(res.status).toBe(422);
        const wallet = (await Wallet.findByPk(walletId))!;
        expect(dec(wallet.balance).eq('100')).toBe(true);
        expect(dec(wallet.turnoverAccrued).isZero()).toBe(true);
    });

    it('cannot be overdrawn by concurrent wagers', async () => {
        const walletId = await fundedWallet('100');

        // 5 x 30 = 150 against a balance of 100: only 3 can succeed
        const results = await Promise.all(Array.from({ length: 5 }, () => wager(walletId, '30')));

        expect(results.filter((r) => r.status === 201)).toHaveLength(3);
        expect(results.filter((r) => r.status === 422)).toHaveLength(2);
        const wallet = (await Wallet.findByPk(walletId))!;
        expect(dec(wallet.balance).eq('10')).toBe(true);
        expect((await ledgerSum(walletId)).eq(wallet.balance)).toBe(true);
    });

    it('returns 404 for an unknown wallet', async () => {
        const res = await wager('00000000-0000-4000-8000-000000000000', '10');
        expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid walletId or amount', async () => {
        const walletId = await fundedWallet('100');

        expect((await wager('not-a-uuid', '10')).status).toBe(400);
        expect((await wager(walletId, '-10')).status).toBe(400);
        expect((await wager(walletId, 10)).status).toBe(400);
    });
});