import Dexie, { Table } from 'dexie';

const DB_LIST_KEY = 'opensimperfi:dbs';
const CURRENT_DB_KEY = 'opensimperfi:current-db';
const DB_NAME_PREFIX = 'OpenSimperfiDB::';
const DEFAULT_DB_ID = 'primary';
const DEFAULT_DB_LABEL = 'Primary Portfolio';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const memoryStorage: Record<string, string> = {};

const SPA_REDIRECT_STORAGE_KEY = '__opensimperfi_redirect';

const readStorage = (key: string): string | null => {
  if (isBrowser) {
    return window.localStorage.getItem(key);
  }
  return key in memoryStorage ? memoryStorage[key] : null;
};

const writeStorage = (key: string, value: string) => {
  if (isBrowser) {
    window.localStorage.setItem(key, value);
    return;
  }
  memoryStorage[key] = value;
};

const buildDbName = (id: string) => `${DB_NAME_PREFIX}${id}`;

const slugify = (label: string) => {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .trim();
  return base || 'db';
};

const nowIso = () => new Date().toISOString();

export type TransactionType = 'deposit' | 'withdraw' | 'trade' | 'transfer';

export interface Wallet {
  id?: number;
  name: string;
  type: 'hot' | 'cold' | 'exchange' | 'staked';
}

export interface Trade {
  id?: number;
  date: Date;
  type: TransactionType;
  notes?: string;
}

export interface LedgerEntry {
  id?: number;
  tradeId: number;
  walletId: number;
  assetTicker: string;
  amount: number; // Positive for incoming, negative for outgoing
  usdPriceAtTime?: number; // Snapshot of price for historical PnL
}

export interface TargetAllocation {
  ticker: string;
  percentage: number;
}

export interface AppSettings {
  id?: number; // Singleton, likely just key 1
  customPrices?: Record<string, number>;
}

export interface SnapshotRecord {
  id?: number;
  date: string; // YYYY-MM-DD
  createdAt: string;
  payload: string; // JSON serialized backup payload
}

export interface ManagedDatabase {
  id: string;
  label: string;
  dexieName: string;
  createdAt: string;
  updatedAt: string;
}

const readDatabaseList = (): ManagedDatabase[] => {
  const raw = readStorage(DB_LIST_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse database list', error);
    return [];
  }
};

const writeDatabaseList = (list: ManagedDatabase[]) => {
  writeStorage(DB_LIST_KEY, JSON.stringify(list));
};

const getStoredCurrentDatabaseId = (): string | null => readStorage(CURRENT_DB_KEY);

const setStoredCurrentDatabaseId = (id: string) => {
  writeStorage(CURRENT_DB_KEY, id);
};

export const reloadApplicationPreservingRoute = () => {
  if (!isBrowser) return;
  try {
    const path = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(SPA_REDIRECT_STORAGE_KEY, path);
  } catch (error) {
    console.warn('Failed to persist redirect path', error);
  }
  const base = import.meta.env.BASE_URL || '/';
  const target = base.endsWith('/') ? base : `${base}/`;
  window.location.href = target;
};

const ensureManagedDatabases = () => {
  let list = readDatabaseList();
  if (list.length === 0) {
    const timestamp = nowIso();
    const defaultDb: ManagedDatabase = {
      id: DEFAULT_DB_ID,
      label: DEFAULT_DB_LABEL,
      dexieName: buildDbName(DEFAULT_DB_ID),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    list = [defaultDb];
    writeDatabaseList(list);
    setStoredCurrentDatabaseId(defaultDb.id);
    return { list, currentId: defaultDb.id };
  }

  let mutated = false;
  list = list.map((meta) => {
    if (!meta.dexieName) {
      mutated = true;
      return {
        ...meta,
        dexieName: buildDbName(meta.id),
      };
    }
    return meta;
  });

  if (mutated) {
    writeDatabaseList(list);
  }

  let currentId = getStoredCurrentDatabaseId();
  if (!currentId || !list.some((db) => db.id === currentId)) {
    currentId = list[0].id;
    setStoredCurrentDatabaseId(currentId);
  }

  return { list, currentId };
};

const generateDatabaseId = (label: string, existing: ManagedDatabase[]) => {
  const base = slugify(label);
  if (!existing.some((db) => db.id === base)) {
    return base;
  }

  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (existing.some((db) => db.id === candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
};

export class OpenSimperfiDB extends Dexie {
  wallets!: Table<Wallet>;
  trades!: Table<Trade>;
  ledger!: Table<LedgerEntry>;
  targets!: Table<TargetAllocation>;
  settings!: Table<AppSettings>;
  snapshots!: Table<SnapshotRecord>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      wallets: '++id, name, type',
      trades: '++id, date, type',
      ledger: '++id, tradeId, walletId, assetTicker',
      targets: '&ticker',
      settings: '++id'
    });

    this.version(2).stores({
      wallets: '++id, name, type',
      trades: '++id, date, type',
      ledger: '++id, tradeId, walletId, assetTicker',
      targets: '&ticker',
      settings: '++id',
      snapshots: '++id, date'
    });
  }
}

const bootstrap = ensureManagedDatabases();
export const activeDatabaseId = bootstrap.currentId;
const activeMeta = bootstrap.list.find((entry) => entry.id === activeDatabaseId) ?? bootstrap.list[0];
const activeDexieName = activeMeta?.dexieName || buildDbName(activeDatabaseId);
export const db = new OpenSimperfiDB(activeDexieName);

// Helper to initialize default data
export const initDB = async (instance: OpenSimperfiDB = db) => {
  if (!instance.isOpen()) {
    await instance.open();
  }
  const count = await instance.wallets.count();
  if (count === 0) {
    await instance.wallets.add({ name: 'Main Wallet', type: 'hot' });
  }
};

export interface DatabaseDump {
  wallets: Wallet[];
  trades: Trade[];
  ledger: LedgerEntry[];
  targets: TargetAllocation[];
  settings: AppSettings[];
  snapshots?: SnapshotRecord[];
  meta: {
    timestamp: string;
    version: number;
  };
}

const normalizeTrades = (records: Trade[]) =>
  records.map((trade) => ({
    ...trade,
    date: trade.date instanceof Date ? trade.date : new Date(trade.date),
  }));

export const exportDatabaseDump = async (
  instance: OpenSimperfiDB = db,
  options: { includeSnapshots?: boolean } = {}
): Promise<DatabaseDump> => {
  const includeSnapshots = options.includeSnapshots ?? false;
  const snapshotsPromise = includeSnapshots
    ? instance.snapshots.toArray()
    : Promise.resolve<SnapshotRecord[]>([]);

  const [wallets, trades, ledger, targets, settings, snapshots] = await Promise.all([
    instance.wallets.toArray(),
    instance.trades.toArray(),
    instance.ledger.toArray(),
    instance.targets.toArray(),
    instance.settings.toArray(),
    snapshotsPromise,
  ]);

  return {
    wallets,
    trades,
    ledger,
    targets,
    settings,
    snapshots: includeSnapshots ? snapshots : undefined,
    meta: {
      timestamp: nowIso(),
      version: 2,
    },
  };
};

export const importDatabaseDump = async (instance: OpenSimperfiDB, payload: DatabaseDump) => {
  const tradesWithDates = normalizeTrades(payload.trades || []);

  await instance.transaction(
    'rw',
    instance.wallets,
    instance.trades,
    instance.ledger,
    instance.targets,
    instance.settings,
    async () => {
      await Promise.all([
        instance.wallets.clear(),
        instance.trades.clear(),
        instance.ledger.clear(),
        instance.targets.clear(),
        instance.settings.clear(),
      ]);

      if (payload.wallets?.length) await instance.wallets.bulkAdd(payload.wallets);
      if (tradesWithDates.length) await instance.trades.bulkAdd(tradesWithDates);
      if (payload.ledger?.length) await instance.ledger.bulkAdd(payload.ledger);
      if (payload.targets?.length) await instance.targets.bulkAdd(payload.targets);
      if (payload.settings?.length) await instance.settings.bulkAdd(payload.settings);
    }
  );

  // Handle snapshots in a separate transaction
  if (payload.snapshots?.length) {
    await instance.snapshots.clear();
    await instance.snapshots.bulkAdd(payload.snapshots);
  }
};

export const getManagedDatabases = (): ManagedDatabase[] => {
  const list = readDatabaseList();
  if (!list.length) {
    return ensureManagedDatabases().list;
  }

  let mutated = false;
  const normalized = list.map((meta) => {
    if (!meta.dexieName) {
      mutated = true;
      return {
        ...meta,
        dexieName: buildDbName(meta.id),
      };
    }
    return meta;
  });

  if (mutated) {
    writeDatabaseList(normalized);
  }

  return normalized;
};

export const getCurrentDatabaseId = (): string => {
  const current = getStoredCurrentDatabaseId();
  if (current) return current;
  return ensureManagedDatabases().currentId;
};

export const getCurrentDatabaseMeta = (): ManagedDatabase | undefined => {
  const list = getManagedDatabases();
  const currentId = getCurrentDatabaseId();
  return list.find((db) => db.id === currentId);
};

const getMetaOrThrow = (id: string): ManagedDatabase => {
  const meta = getManagedDatabases().find((db) => db.id === id);
  if (!meta) {
    throw new Error('Database not found');
  }
  return meta;
};

const withDatabaseInstance = async <T>(id: string, handler: (instance: OpenSimperfiDB) => Promise<T>): Promise<T> => {
  const meta = getMetaOrThrow(id);
  const instance = new OpenSimperfiDB(meta.dexieName || buildDbName(id));
  await instance.open();
  try {
    return await handler(instance);
  } finally {
    instance.close();
  }
};

export const createManagedDatabase = async (
  label: string,
  options?: { copyFromId?: string }
): Promise<ManagedDatabase> => {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error('Database name is required');
  }

  const list = getManagedDatabases();
  const id = generateDatabaseId(trimmed, list);
  const timestamp = nowIso();
  const dexieName = buildDbName(id);
  const meta: ManagedDatabase = {
    id,
    label: trimmed,
    dexieName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  writeDatabaseList([...list, meta]);

  await withDatabaseInstance(id, async (targetDb) => {
    if (options?.copyFromId) {
      await withDatabaseInstance(options.copyFromId, async (sourceDb) => {
        const payload = await exportDatabaseDump(sourceDb);
        await importDatabaseDump(targetDb, payload);
      });
    }
    await initDB(targetDb);
  });

  return meta;
};

export const attachExistingDatabase = async (
  label: string,
  dexieNameInput: string
): Promise<ManagedDatabase> => {
  const trimmedLabel = label.trim();
  const dexieName = dexieNameInput.trim();

  if (!trimmedLabel) {
    throw new Error('Database name is required');
  }
  if (!dexieName) {
    throw new Error('Dexie name is required');
  }

  const list = getManagedDatabases();
  if (list.some((db) => db.dexieName === dexieName)) {
    throw new Error('This Dexie database is already managed');
  }

  const id = generateDatabaseId(trimmedLabel, list);
  const timestamp = nowIso();
  const meta: ManagedDatabase = {
    id,
    label: trimmedLabel,
    dexieName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // Verify the database can be opened
  const testInstance = new OpenSimperfiDB(dexieName);
  try {
    await testInstance.open();
  } finally {
    testInstance.close();
  }

  writeDatabaseList([...list, meta]);
  return meta;
};

export const deleteManagedDatabase = async (id: string) => {
  const list = getManagedDatabases();
  if (list.length <= 1) {
    throw new Error('At least one database must exist');
  }

  const meta = list.find((db) => db.id === id);
  if (!meta) {
    throw new Error('Database not found');
  }

  await Dexie.delete(meta.dexieName || buildDbName(id));

  const updated = list.filter((db) => db.id !== id);
  writeDatabaseList(updated);

  const currentId = getCurrentDatabaseId();
  if (currentId === id) {
    const nextId = updated[0].id;
    setStoredCurrentDatabaseId(nextId);
    reloadApplicationPreservingRoute();
  }
};

export const selectManagedDatabase = (id: string) => {
  getMetaOrThrow(id);
  setStoredCurrentDatabaseId(id);
  reloadApplicationPreservingRoute();
};

export const cloneManagedDatabase = async (sourceId: string, label: string) => {
  return createManagedDatabase(label, { copyFromId: sourceId });
};
