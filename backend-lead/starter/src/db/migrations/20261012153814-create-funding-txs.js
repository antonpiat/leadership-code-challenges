'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // TODO: create funding_txs table (deposits + withdrawals)
    // TODO: add constraints
  },

  async down(queryInterface, Sequelize) {
    // TODO: drop funding_txs
  }
};
