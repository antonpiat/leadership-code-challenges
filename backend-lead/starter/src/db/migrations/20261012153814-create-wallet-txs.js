'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // TODO: create wallet_txs ledger table
    // TODO: prevent duplicate entries for the same deposit or wager
  },

  async down(queryInterface, Sequelize) {
    // TODO: drop wallet_txs
  }
};
