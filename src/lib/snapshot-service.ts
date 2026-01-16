import { db, OpenSimperfiDB, exportDatabaseDump, importDatabaseDump, SnapshotRecord } from './db';

const SNAPSHOT_RETENTION = 5;

const getTodayKey = () => new Date().toISOString().split('T')[0];

export const ensureDailySnapshot = async (targetDb: OpenSimperfiDB = db) => {
  const today = getTodayKey();
  const existing = await targetDb.snapshots.where('date').equals(today).first();
  if (existing) return;

  const payload = await exportDatabaseDump(targetDb);
  await targetDb.snapshots.add({
    date: today,
    createdAt: new Date().toISOString(),
    payload: JSON.stringify(payload),
  } as SnapshotRecord);

  const snapshots = await targetDb.snapshots.orderBy('date').reverse().toArray();
  const toRemove = snapshots.slice(SNAPSHOT_RETENTION);
  await Promise.all(toRemove.map((record) => targetDb.snapshots.delete(record.id!)));
};

export const restoreSnapshot = async (snapshotId: number, targetDb: OpenSimperfiDB = db) => {
  const snapshot = await targetDb.snapshots.get(snapshotId);
  if (!snapshot) {
    throw new Error('Snapshot not found');
  }
  const payload = JSON.parse(snapshot.payload);
  await importDatabaseDump(targetDb, payload);
};

export const listSnapshots = async (targetDb: OpenSimperfiDB = db) => {
  return targetDb.snapshots.orderBy('date').reverse().toArray();
};
