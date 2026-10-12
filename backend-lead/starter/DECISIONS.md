# Decisions

## Dependencies
Ran `npm audit fix` (safe updates only). Remaining warnings need major
version upgrades that could break the project, so I left them.

## Schema
- One `funding_txs` table for deposits and withdrawals.
- Turnover stored as two columns on the wallet.
- Every balance change goes into a ledger (`wallet_txs`).
- The database blocks duplicate ledger entries and invalid values.
- Migrations created with `sequelize-cli migration:generate`.

## Policies
- Unknown member on deposit: 404.
- `pspRef` is a random UUID: unique and unguessable.
- Callback amount differs from deposit: no credit, deposit marked `Disputed` for manual review.
- Unknown `pspRef` in callback: 404, nothing changes.
- Repeated callback with the same status: 200, nothing changes.
- Conflicting callback (e.g. failed after completed): 409, nothing changes.

## Locking & concurrency
- Callback runs in one transaction: lock the deposit row, then the wallet row.
- Duplicate callbacks wait for each other; the second sees the final status and does nothing.
