import { DataTypes, Model, Sequelize } from 'sequelize';

export type FundingTxType = 'deposit' | 'withdrawal';
export type FundingTxStatus = 'Pending' | 'Completed' | 'Failed' | 'Disputed';

export class FundingTx extends Model {
    declare id: string;
    declare walletId: string;
    declare type: FundingTxType;
    declare status: FundingTxStatus;
    declare amount: string;
    declare pspRef: string | null;
    declare turnoverMultiplier: number | null;
    declare callbackAmount: string | null;
}

export function initFundingTx(sequelize: Sequelize): void {
    FundingTx.init(
        {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            walletId: { type: DataTypes.UUID, allowNull: false },
            type: { type: DataTypes.STRING, allowNull: false },
            status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Pending' },
            amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
            pspRef: { type: DataTypes.STRING, allowNull: true, unique: true },
            turnoverMultiplier: { type: DataTypes.INTEGER, allowNull: true },
            callbackAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        },
        { sequelize, tableName: 'funding_txs', underscored: true },
    );
}