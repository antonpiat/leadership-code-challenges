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
