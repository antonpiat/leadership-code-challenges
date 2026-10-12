'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'wallets',
        'turnover_required',
        { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: '0' },
        { transaction },
      );
      await queryInterface.addColumn(
        'wallets',
        'turnover_accrued',
        { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: '0' },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE wallets
           ADD CONSTRAINT wallets_balance_non_negative
             CHECK (balance >= 0),
           ADD CONSTRAINT wallets_turnover_required_non_negative
             CHECK (turnover_required >= 0),
           ADD CONSTRAINT wallets_turnover_accrued_non_negative
             CHECK (turnover_accrued >= 0)`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE wallets
           DROP CONSTRAINT wallets_balance_non_negative,
           DROP CONSTRAINT wallets_turnover_required_non_negative,
           DROP CONSTRAINT wallets_turnover_accrued_non_negative`,
        { transaction },
      );
      await queryInterface.removeColumn('wallets', 'turnover_accrued', { transaction });
      await queryInterface.removeColumn('wallets', 'turnover_required', { transaction });
    });
  },
};
