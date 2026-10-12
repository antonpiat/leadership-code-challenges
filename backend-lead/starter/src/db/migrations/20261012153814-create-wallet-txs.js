'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'wallet_txs',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          wallet_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'wallets', key: 'id' },
          },
          type: { type: Sequelize.STRING, allowNull: false },
          amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
          balance_after: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
          funding_tx_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'funding_txs', key: 'id' },
          },
          wager_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'wagers', key: 'id' },
          },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE wallet_txs
           ADD CONSTRAINT wallet_txs_type_check
             CHECK (type IN ('deposit', 'wager', 'withdrawal')),
           ADD CONSTRAINT wallet_txs_amount_sign
             CHECK ((type = 'deposit' AND amount > 0) OR (type <> 'deposit' AND amount < 0)),
           ADD CONSTRAINT wallet_txs_balance_after_non_negative
             CHECK (balance_after >= 0),
           ADD CONSTRAINT wallet_txs_one_cause
             CHECK (num_nonnulls(funding_tx_id, wager_id) = 1),
           ADD CONSTRAINT wallet_txs_cause_matches_type
             CHECK ((type = 'wager') = (wager_id IS NOT NULL)),
           ADD CONSTRAINT wallet_txs_funding_tx_once
             UNIQUE (funding_tx_id, type),
           ADD CONSTRAINT wallet_txs_wager_once
             UNIQUE (wager_id)`,
        { transaction },
      );

      await queryInterface.addIndex('wallet_txs', ['wallet_id', 'created_at'], { transaction });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('wallet_txs');
  }
};
