'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'funding_txs',
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
          status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'Pending' },
          amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
          psp_ref: { type: Sequelize.STRING, allowNull: true, unique: true },
          turnover_multiplier: { type: Sequelize.INTEGER, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE funding_txs
           ADD CONSTRAINT funding_txs_type_check
             CHECK (type IN ('deposit', 'withdrawal')),
           ADD CONSTRAINT funding_txs_status_check
             CHECK (status IN ('Pending', 'Completed', 'Failed')),
           ADD CONSTRAINT funding_txs_amount_positive
             CHECK (amount > 0),
           ADD CONSTRAINT funding_txs_multiplier_non_negative
             CHECK (turnover_multiplier >= 0),
           ADD CONSTRAINT funding_txs_deposit_fields
             CHECK (type <> 'deposit' OR (psp_ref IS NOT NULL AND turnover_multiplier IS NOT NULL))`,
        { transaction },
      );

      await queryInterface.addIndex('funding_txs', ['wallet_id'], { transaction });
    });

  },

  async down(queryInterface) {
    await queryInterface.dropTable('funding_txs');
  }
};
