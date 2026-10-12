import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import { FundingTx } from '../src/db/models';

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

async function createMember(username = 'alice01'): Promise<string> {
    const res = await request(app).post('/members').send({ username });
    return res.body.member.id;
}

describe('POST /deposits', () => {
    it('creates a pending deposit with a pspRef', async () => {
        const memberId = await createMember();

        const res = await request(app).post('/deposits').send({ memberId, amount: '100.50' });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('Pending');
        expect(res.body.pspRef).toEqual(expect.any(String));
    });

    it('does not move money yet', async () => {
        const memberId = await createMember();
        await request(app).post('/deposits').send({ memberId, amount: '100.50' });

        const wallet = await request(app).get(`/members/${memberId}/wallet`);
        expect(Number(wallet.body.balance)).toBe(0);
    });

    it('returns 404 for an unknown member', async () => {
        const res = await request(app)
            .post('/deposits')
            .send({ memberId: '00000000-0000-4000-8000-000000000000', amount: '10' });
        expect(res.status).toBe(404);
    });

    it.each([100.5, '0', '-5', '1e5', 'abc', '.5'])('rejects invalid amount %p', async (amount) => {
        const memberId = await createMember();
        const res = await request(app).post('/deposits').send({ memberId, amount });
        expect(res.status).toBe(400);
    });

    it('defaults turnoverMultiplier to 1', async () => {
        const memberId = await createMember();
        const res = await request(app).post('/deposits').send({ memberId, amount: '10' });

        const deposit = await FundingTx.findByPk(res.body.id);
        expect(deposit?.turnoverMultiplier).toBe(1);
    });

    it('accepts a turnoverMultiplier of 0', async () => {
        const memberId = await createMember();
        const res = await request(app).post('/deposits').send({ memberId, amount: '10', turnoverMultiplier: 0 });

        expect(res.status).toBe(201);
        const deposit = await FundingTx.findByPk(res.body.id);
        expect(deposit?.turnoverMultiplier).toBe(0);
    });

    it.each([-1, 1.5, '2'])('rejects invalid turnoverMultiplier %p', async (turnoverMultiplier) => {
        const memberId = await createMember();
        const res = await request(app).post('/deposits').send({ memberId, amount: '10', turnoverMultiplier });
        expect(res.status).toBe(400);
    });
});