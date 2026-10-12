# Design: adding a new PSP in one day

## The idea
The money logic already exists. `handleCallback` locks the deposit, checks the state machine and the amount, and writes the ledger. That's the part that must never break, and it should be the same for every PSP.

What's different between PSPs is only the outside: their message format, their signature, their status words, whether amounts come in cents. So a new PSP only needs code for that outside part. It proves the message is genuine and turns it into one standard shape. It never touches money.

In short: **adapters translate, the core decides.**

## What a junior actually does
1. Run `npm run psp:new -- paylocal`. This creates the folder, a fixtures folder and a contract test that fails until the work is done.
2. Write `verify` and `normalize` for that PSP.
3. Paste real callback bodies from the PSP's sandbox into `fixtures/`.
4. Add one config block.
5. When `npm test` passes, it's done.

They never touch the money code. `callbackService.ts` is owned by the payments
team (CODEOWNERS), so any change there needs a senior to approve it.

## Layout
```
src/psp/
  adapter.ts          # the interface every PSP follows
  registry.ts         # config id → adapter
  toMajorUnits.ts     # the only place amounts are converted from cents
  paylocal/
    adapter.ts        # verify + normalize + acknowledge
    paylocal.test.ts  # contract tests
    fixtures/         # real sandbox messages
src/routes/pspCallbacks.ts       # POST /psp/:pspId/callbacks
src/services/callbackService.ts  # handleCallback, shared by every PSP
```

## The adapter
```ts
interface PspAdapter {
  id: string;                                     // e.g. 'paylocal'
  verify(raw: RawRequest, secret: string): void;  // throws if not genuine
  normalize(raw: RawRequest): NormalizedCallback;
  acknowledge(): HttpResponse;                    // the reply that stops retries
}

type NormalizedCallback = {
  pspRef: string;
  status: 'completed' | 'failed' | 'pending';
  amount: string;     // normal units, e.g. "100.50"
  currency: string;
};
```

**Verify first, always.** It checks the signature on the raw bytes, because that's what the PSP signed. If it fails, we return 401 and nothing else runs.

**Then normalize.** Each PSP says "success" differently (`success`, `paid`,`00`), so the adapter maps them to ours. The adapter also owns the amount format: if this PSP sends cents (`10050`), it calls `toMajorUnits(value, currency)` to get `"100.50"`. That's a fact about the PSP's messages, so it lives in code and is tested by the fixtures, not set in config. Nobody writes their own money conversion.

**An adapter can't touch the database.** A lint rule blocks `src/psp/` from importing the database or services, and it runs on every pull request. So the worst mistake a junior can make is rejecting a valid callback. That's annoying and easy to spot, but it can't lose money.

## Small changes to the core
Today `handleCallback` takes a reference, a status and an amount. For this design it gains three things; locking, the state machine and the ledger stay exactly the same:
- a **`pspId`**, because two PSPs might use the same reference   (`UNIQUE(psp_id, psp_ref)`);
- a **currency check**: if it doesn't match the deposit, it's `Disputed`, just   like a wrong amount;
- a **`pending` status that does nothing**. Some PSPs send "success" and then a   late "pending". The late one can't undo a credit.

## What the PSP gets back
A retry only helps if the next attempt could succeed. So:
- **Unknown `pspId` → 404, before verify.** There is no adapter to check or acknowledge the message, so we reject it and alert. A *disabled* PSP is different: `enabled: false` stops new deposits, but its callbacks keep working, so payments already in flight still complete.
- **Verification fails → 401.** We don't trust the message, so we don't confirm it.
- **Our own failure (database down, timeout) → 5xx.** A retry might work, so we want one.
- **Everything else → `acknowledge()`.** Credited, duplicate, disputed, unknown reference, or a conflicting status. Retrying an unknown reference or a conflict gives the same answer every time, so we confirm receipt to stop the retries, and handle the problem ourselves: unknown and conflict raise an alert, disputed goes to manual review.

The current Part A endpoint returns 404 and 409 instead, so the mock PSP and
the tests can see each outcome. With real PSPs, those become acknowledged and
alerted.

## Config
```yaml
paylocal:
  enabled: true
  brands: [brand-a]
  webhookSecret: vault://psp/paylocal/webhook-secret
```
The registry is built from this file. An unknown PSP is rejected; a disabled one takes no new deposits but still settles the ones in flight.

## Testing without calling the PSP
- **Fixtures:** real messages captured once from the PSP's sandbox and saved next to the adapter. CI never calls the real PSP.
- **One shared contract test suite for every adapter:** a valid signature is accepted, a tampered message is rejected, every status maps correctly, amounts convert exactly, and a duplicate or late `pending` doesn't change the wallet. It runs the fixtures through `verify`, `normalize` and the real `handleCallback`.
- **Exactly-once crediting** is already covered by the existing callback tests, so it isn't retested per PSP.
- **A sandbox check runs nightly,** outside CI, because sandboxes are unreliable.

## Sketch
```
PSP ──▶ POST /psp/:pspId/callbacks
              │  find the adapter in config
              │──── unknown pspId ──────────▶ 404 + alert
              ▼
   ┌──────── src/psp/<id>/adapter.ts ───┐
   │ 1. verify signature ───────────────┼──▶ 401 if not genuine
   │ 2. normalize → { pspRef, status,   │
   │                  amount, currency }│
   └─────────────────┬──────────────────┘
                     ▼
   ┌──────── handleCallback (shared) ───┐
   │ lock deposit → state machine →     │
   │ amount + currency check →          │──▶ 5xx if we fail (PSP retries)
   │ credit + ledger                    │
   └─────────────────┬──────────────────┘
                     ▼
        acknowledge() → PSP stops retrying
        (credited, duplicate, disputed, unknown pspRef, conflict;
         the last three also alert or go to review)
```