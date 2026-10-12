'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // TODO: add turnover columns to wallets
    // TODO: block negative balance
  },

  async down(queryInterface, Sequelize) {
    // TODO: remove turnover columns and constraint
  }
};
