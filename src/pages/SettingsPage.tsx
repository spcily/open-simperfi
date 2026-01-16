import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { exportData, importData } from '@/lib/backup-service';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { db, getManagedDatabases, getCurrentDatabaseId, createManagedDatabase, deleteManagedDatabase, selectManagedDatabase, ManagedDatabase, SnapshotRecord } from '@/lib/db';
import { restoreSnapshot } from '@/lib/snapshot-service';
import { formatCurrency } from '@/lib/utils';

export default function SettingsPage() {
  const [fileToImport, setFileToImport] = useState<File | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [customTicker, setCustomTicker] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [managedDbs, setManagedDbs] = useState<ManagedDatabase[]>([]);
  const [currentDbId, setCurrentDbId] = useState('');
  const [newDbName, setNewDbName] = useState('');
  const [copySourceId, setCopySourceId] = useState('');
  const [isDbBusy, setIsDbBusy] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isCreatePopoverOpen, setIsCreatePopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settings = useLiveQuery(() => db.settings.get(1));
  const customPrices = settings?.customPrices || {};
  const customPriceEntries = Object.entries(customPrices).sort((a, b) => a[0].localeCompare(b[0]));
  const snapshots = useLiveQuery<SnapshotRecord[]>(() => db.snapshots.orderBy('date').reverse().toArray()) || [];

  const refreshDatabases = () => {
    setManagedDbs(getManagedDatabases());
    setCurrentDbId(getCurrentDatabaseId());
  };

  useEffect(() => {
    refreshDatabases();
  }, []);

  const handleExport = async () => {
    try {
      await exportData();
    } catch (error) {
      alert("Failed to export data");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileToImport(e.target.files[0]);
      setIsDialogOpen(true);
      // Reset input value to allow selecting the same file again if needed (though we reload on success)
      e.target.value = '';
    }
  };

  const handleImportConfirm = async () => {
    if (!fileToImport) return;

    setIsLoading(true);
    try {
      await importData(fileToImport);
      setIsDialogOpen(false);
      alert('Data restored successfully! The page will now reload.');
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert('Failed to restore data. Please check the file format.');
      setIsLoading(false);
    }
  };

  const handleImportCancel = () => {
    setIsDialogOpen(false);
    setFileToImport(null);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  const handleCreateDatabase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newDbName.trim()) {
      setDbError('Name is required');
      return;
    }
    setIsDbBusy(true);
    setDbError(null);
    try {
      await createManagedDatabase(newDbName, copySourceId ? { copyFromId: copySourceId } : undefined);
      setNewDbName('');
      setCopySourceId('');
      setIsCreatePopoverOpen(false);
      refreshDatabases();
    } catch (error) {
      console.error(error);
      setDbError(error instanceof Error ? error.message : 'Failed to create database');
    } finally {
      setIsDbBusy(false);
    }
  };

  const handleDeleteDatabase = async (database: ManagedDatabase) => {
    if (database.id === currentDbId) {
      alert('Switch to another database before deleting it.');
      return;
    }
    if (!confirm(`Delete database "${database.label}"? This removes all data stored in it.`)) {
      return;
    }
    try {
      await deleteManagedDatabase(database.id);
      refreshDatabases();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to delete database');
    }
  };

  const handleSelectDatabase = (id: string) => {
    if (id === currentDbId) return;
    try {
      selectManagedDatabase(id);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to switch database');
    }
  };

  const handleRestoreSnapshot = async (snapshotId: number) => {
    if (!confirm('Restore this snapshot? Current data will be replaced.')) {
      return;
    }
    try {
      await restoreSnapshot(snapshotId);
      alert('Snapshot restored. The app will reload.');
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to restore snapshot');
    }
  };

  const handleDownloadSnapshot = (snapshot: SnapshotRecord) => {
    const blob = new Blob([snapshot.payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opensimperfi-snapshot-${snapshot.date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const persistSettings = async (nextCustomPrices: Record<string, number>) => {
    await db.settings.put({
      ...(settings || {}),
      id: settings?.id || 1,
      customPrices: nextCustomPrices,
    });
  };

  const handleCustomPriceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticker = customTicker.trim().toUpperCase();
    const price = parseFloat(customPrice);

    if (!ticker) {
      alert('Ticker is required');
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      alert('Enter a valid price greater than zero');
      return;
    }

    const next = { ...customPrices, [ticker]: price };
    await persistSettings(next);
    setCustomTicker('');
    setCustomPrice('');
  };

  const handleCustomPriceClear = async (ticker: string) => {
    const next = { ...customPrices };
    delete next[ticker];
    await persistSettings(next);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
     
      <Card>
        <CardHeader>
          <CardTitle>Manual Prices</CardTitle>
          <CardDescription>
            Set fixed USD prices for tickers Binance does not cover. Remove an override to resume live pricing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCustomPriceSubmit} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="customTicker">Ticker</Label>
              <Input
                id="customTicker"
                value={customTicker}
                onChange={(event) => setCustomTicker(event.target.value)}
                placeholder="e.g. JOE"
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customPrice">Price (USD)</Label>
              <Input
                id="customPrice"
                type="number"
                step="any"
                value={customPrice}
                onChange={(event) => setCustomPrice(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Save Override
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {customPriceEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No manual prices defined yet.</p>
            ) : (
              customPriceEntries.map(([ticker, price]) => (
                <div
                  key={ticker}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{ticker}</p>
                    <p className="text-sm text-muted-foreground">{formatCurrency(price)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCustomPriceClear(ticker)}
                  >
                    Clear Override
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card> 

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Your portfolio data is stored locally in your browser (IndexedDB). 
            Perform regular backups to prevent data loss or to move your data to another device.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <Button onClick={handleExport}>
            Download Backup
          </Button>
          
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Restore Backup
          </Button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".json" 
            onChange={handleFileSelect} 
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Database Management</CardTitle>
          <CardDescription>
            Work across multiple local databases for experimentation or segregation. Create a blank database or copy data from an existing one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Spin up a fresh workspace or clone an existing one for experiments.
              </p>
            </div>
            <Popover open={isCreatePopoverOpen} onOpenChange={setIsCreatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button type="button">New Database</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold">Create Database</h4>
                  <p className="text-xs text-muted-foreground">Name it and optionally copy data from another DB.</p>
                </div>
                <form onSubmit={handleCreateDatabase} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newDbName">Database Name</Label>
                    <Input
                      id="newDbName"
                      value={newDbName}
                      onChange={(event) => setNewDbName(event.target.value)}
                      placeholder="e.g. Testnet"
                      disabled={isDbBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="copySource">Copy Data From (optional)</Label>
                    <select
                      id="copySource"
                      value={copySourceId}
                      onChange={(event) => setCopySourceId(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      disabled={isDbBusy}
                    >
                      <option value="">Start Empty</option>
                      {managedDbs.map((database) => (
                        <option key={database.id} value={database.id}>
                          {database.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {dbError && <p className="text-sm text-red-500">{dbError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsCreatePopoverOpen(false);
                        setDbError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isDbBusy}>
                      {copySourceId ? 'Copy Database' : 'Create Database'}
                    </Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-3">
            {managedDbs.map((database) => {
              const isCurrent = database.id === currentDbId;
              return (
                <div
                  key={database.id}
                  className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{database.label}</p>
                      {isCurrent && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Key: {database.id}</p>
                    <p className="text-xs text-muted-foreground">Dexie: {database.dexieName}</p>
                    <p className="text-xs text-muted-foreground">Created {formatDateTime(database.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectDatabase(database.id)}
                      disabled={isCurrent}
                    >
                      Use Database
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteDatabase(database)}
                      disabled={isCurrent || managedDbs.length <= 1}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Daily Snapshots</CardTitle>
          <CardDescription>
            The app keeps up to five daily snapshots per database (captured the first time you open it each day). Restore a snapshot to roll back data safely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots captured yet.</p>
          ) : (
            snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{snapshot.date}</p>
                  <p className="text-xs text-muted-foreground">Captured {formatDateTime(snapshot.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadSnapshot(snapshot)}
                  >
                    Download
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => snapshot.id && handleRestoreSnapshot(snapshot.id)}
                  >
                    Restore
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite Database?</DialogTitle>
            <DialogDescription>
              This action will <strong>permanently delete all current data</strong> (wallets, trades, settings) and replace it with the data from the selected backup file.
              <br /><br />
              <strong>Selected file:</strong> {fileToImport?.name}
              <br /><br />
              This action cannot be undone. Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={handleImportCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleImportConfirm} disabled={isLoading}>
              {isLoading ? "Restoring..." : "Yes, Overwrite & Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
