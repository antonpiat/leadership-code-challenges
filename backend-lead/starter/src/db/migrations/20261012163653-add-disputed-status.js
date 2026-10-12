'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'funding_txs',
        'callback_amount',
        { type: Sequelize.DECIMAL(36, 18), allowNull: true },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE funding_txs
           DROP CONSTRAINT funding_txs_status_check,
           ADD CONSTRAINT funding_txs_status_check
             CHECK (status IN ('Pending', 'Completed', 'Failed', 'Disputed'))`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE funding_txs
           DROP CONSTRAINT funding_txs_status_check,
           ADD CONSTRAINT funding_txs_status_check
             CHECK (status IN ('Pending', 'Completed', 'Failed'))`,
        { transaction },
      );
      await queryInterface.removeColumn('funding_txs', 'callback_amount', { transaction });
    });
  }
};
