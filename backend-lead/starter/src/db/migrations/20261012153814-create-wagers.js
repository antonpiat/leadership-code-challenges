'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'wagers',
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
          amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE wagers
           ADD CONSTRAINT wagers_amount_positive CHECK (amount > 0)`,
        { transaction },
      );

      await queryInterface.addIndex('wagers', ['wallet_id'], { transaction });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('wagers');
  }
};
