import { db, OpenSimperfiDB, exportDatabaseDump, importDatabaseDump, DatabaseDump } from './db';

// 1. Export Function
export const exportData = async (targetDb: OpenSimperfiDB = db) => {
    try {
        const payload = await exportDatabaseDump(targetDb, { includeSnapshots: true });
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `opensimperfi-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Failed to export data:", error);
        throw new Error("Failed to export data");
    }
};

export const exportDataAsObject = async (targetDb: OpenSimperfiDB = db): Promise<DatabaseDump> => {
    return exportDatabaseDump(targetDb);
};

// 2. Import Function
export const importData = async (file: File, targetDb: OpenSimperfiDB = db): Promise<void> => {
    try {
        const text = await file.text();
        const data: DatabaseDump = JSON.parse(text);

        const hasAccounts = Array.isArray(data.accounts);
        const hasLegacyWallets = Array.isArray(data.wallets);
        if ((!hasAccounts && !hasLegacyWallets) || !data.trades || !data.ledger) {
            throw new Error('Invalid backup file structure: Missing required tables.');
        }

        await importDatabaseDump(targetDb, data);
    } catch (error) {
        console.error("Failed to import data:", error);
        throw error;
    }
};

export const importDataFromObject = async (payload: DatabaseDump, targetDb: OpenSimperfiDB = db) => {
    await importDatabaseDump(targetDb, payload);
};
