import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LedgerEntry } from '@/lib/db';
import { useLivePrices } from '@/hooks/use-live-prices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TradeForm } from '@/components/TradeForm';
import { AllocationForm } from '@/components/AllocationForm';
import { formatCurrency, formatCrypto, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Pencil } from 'lucide-react';

// Extended type for View
interface AssetHolding {
    ticker: string;
    amount: number;
    avgBuyPrice: number;
    lastBuyPrice: number;
    totalCostBasis: number;
}

// Helper to consolidate ledger entries AND calculate avg buy price
const calculateHoldings = (entries: LedgerEntry[] = [], transferTradeIds?: Set<number>): AssetHolding[] => {
    const filteredEntries = transferTradeIds
        ? entries.filter((entry) => {
            if (entry.tradeId === undefined || entry.tradeId === null) {
                return true;
            }
            return !transferTradeIds.has(entry.tradeId);
        })
        : entries;

    // Group by ticker first
    const grouped: Record<string, LedgerEntry[]> = {};
    filteredEntries.forEach(e => {
        if (!grouped[e.assetTicker]) grouped[e.assetTicker] = [];
        grouped[e.assetTicker].push(e);
    });

    const results: AssetHolding[] = [];

    // Calculate Weighted Avg Cost for each ticker
    Object.entries(grouped).forEach(([ticker, history]) => {
        // Sort by ID (proxy for time) just in case
        history.sort((a, b) => (a.id || 0) - (b.id || 0));

        let totalQty = 0;
        let totalCost = 0;
        let lastBuy = 0;

        history.forEach(entry => {
            const qty = entry.amount;
            
            if (qty > 0) {
                // BUY / RECEIVE
                // If priceAtTime is missing, we assume 0 cost.
                const price = entry.usdPriceAtTime || 0;
                const cost = qty * price;
                
                if (price > 0) lastBuy = price;

                totalCost += cost;
                totalQty += qty;
            } else {
                // SELL / SEND
                // Reduce cost basis proportionally (Weighted Average)
                const absQty = Math.abs(qty);
                const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
                
                const costRemoved = absQty * avgPrice;
                totalCost -= costRemoved;
                totalQty -= absQty;
            }
        });
        
        // Handle floating point errors near zero
        if (Math.abs(totalQty) < 0.00000001) {
            totalQty = 0;
            totalCost = 0;
        }

        const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

        if (totalQty > 0) {
            results.push({
                ticker,
                amount: totalQty,
                avgBuyPrice: avgPrice,
                lastBuyPrice: lastBuy,
                totalCostBasis: totalCost
            });
        }
    });

    return results.sort((a, b) => a.ticker.localeCompare(b.ticker));
};

export default function Dashboard() {
    const [isTradeModalOpen, setIsTradeModalOpen] = React.useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = React.useState(false);
    const [isPriceDialogOpen, setIsPriceDialogOpen] = React.useState(false);
    const [priceOverrideTicker, setPriceOverrideTicker] = React.useState<string | null>(null);
    const [priceOverrideValue, setPriceOverrideValue] = React.useState('');
    const [priceDialogError, setPriceDialogError] = React.useState<string | null>(null);

    // Live query to the DB
    const ledger = useLiveQuery(() => db.ledger.toArray());
    const trades = useLiveQuery(() => db.trades.toArray());
    const targets = useLiveQuery(() => db.targets.toArray());
    const settings = useLiveQuery(() => db.settings.get(1));

    const transferTradeIds = React.useMemo<Set<number> | undefined>(() => {
        if (!trades) return undefined;
        const ids = new Set<number>();
        trades.forEach((trade) => {
            if (trade.type === 'transfer' && typeof trade.id === 'number') {
                ids.add(trade.id);
            }
        });
        return ids;
    }, [trades]);

    const holdings = React.useMemo(() => calculateHoldings(ledger, transferTradeIds), [ledger, transferTradeIds]);
    
    // Derived Array of assets we need prices for
    const assetList = React.useMemo(() => holdings.map(h => h.ticker), [holdings]);
    
    // Use the Hook!
    const customPrices = React.useMemo(() => settings?.customPrices || {}, [settings]);
    const prices = useLivePrices(assetList, customPrices);

    const persistCustomPrices = async (next: Record<string, number>) => {
        await db.settings.put({
            ...(settings || {}),
            id: settings?.id || 1,
            customPrices: next,
        });
    };

    const closePriceDialog = () => {
        setIsPriceDialogOpen(false);
        setPriceOverrideTicker(null);
        setPriceOverrideValue('');
        setPriceDialogError(null);
    };

    const openPriceDialog = (ticker: string) => {
        setPriceOverrideTicker(ticker);
        const existing = customPrices[ticker];
        const live = prices[ticker];
        setPriceOverrideValue(existing !== undefined ? existing.toString() : live ? live.toString() : '');
        setPriceDialogError(null);
        setIsPriceDialogOpen(true);
    };

    const handlePriceDialogSave = async () => {
        if (!priceOverrideTicker) return;
        const parsed = parseFloat(priceOverrideValue);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            setPriceDialogError('Enter a valid price greater than zero');
            return;
        }
        const next = { ...customPrices, [priceOverrideTicker]: parsed };
        await persistCustomPrices(next);
        closePriceDialog();
    };

    const handlePriceDialogClear = async () => {
        if (!priceOverrideTicker) return;
        if (customPrices[priceOverrideTicker] === undefined) {
            closePriceDialog();
            return;
        }
        const next = { ...customPrices };
        delete next[priceOverrideTicker];
        await persistCustomPrices(next);
        closePriceDialog();
    };

    // Derived Financials
    const totalValue = holdings.reduce((sum, h) => {
        const price = prices[h.ticker] || 0;
        return sum + (h.amount * price);
    }, 0);

    const totalCostBasis = holdings.reduce((sum, h) => sum + h.totalCostBasis, 0);
    const totalUnrealizedPnL = totalValue - totalCostBasis;
    const totalPnLPercent = totalCostBasis > 0 ? (totalUnrealizedPnL / totalCostBasis) * 100 : 0;

    const targetMap = React.useMemo(() => {
        const map = new Map<string, number>();
        targets?.forEach(t => map.set(t.ticker, t.percentage));
        return map;
    }, [targets]);

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">OpenSimperfi Portfolio</h1>
                <div className="flex gap-2">
                    <Dialog open={isAllocationModalOpen} onOpenChange={setIsAllocationModalOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline">Manage Strategy</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Portfolio Targets</DialogTitle>
                            </DialogHeader>
                            <AllocationForm onSuccess={() => setIsAllocationModalOpen(false)} />
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isTradeModalOpen} onOpenChange={setIsTradeModalOpen}>
                        <DialogTrigger asChild>
                            <Button>+ New Transaction</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[525px]">
                            <DialogHeader>
                                <DialogTitle>Add Transaction</DialogTitle>
                            </DialogHeader>
                            <TradeForm onSuccess={() => setIsTradeModalOpen(false)} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Portfolio Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                           Cost Basis: {formatCurrency(totalCostBasis)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium">Unrealized PnL</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn("text-2xl font-bold", totalUnrealizedPnL >= 0 ? "text-green-600" : "text-red-500")}>
                            {totalUnrealizedPnL > 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnL)}
                        </div>
                        <p className={cn("text-xs mt-1", totalPnLPercent >= 0 ? "text-green-600" : "text-red-500")}>
                             {totalPnLPercent > 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Holdings</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Asset</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead className="text-right">Price</TableHead>
                                <TableHead className="text-right">vs Last Buy</TableHead>
                                <TableHead className="text-right">Avg Buy</TableHead>
                                <TableHead className="text-right">Value</TableHead>
                                <TableHead className="text-right">Unrealized PnL</TableHead>
                                <TableHead className="text-right">Allocation (Actual / Target)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {holdings.map((h) => {
                                const price = prices[h.ticker] || 0;
                                const isManualPrice = customPrices[h.ticker] !== undefined;
                                const value = h.amount * price;
                                const actualPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                                const targetPct = targetMap.get(h.ticker) || 0;
                                const diff = actualPct - targetPct;

                                const pnl = value - h.totalCostBasis;
                                const pnlPercent = h.totalCostBasis > 0 ? (pnl / h.totalCostBasis) * 100 : 0;
                                const lastBuyDiff = h.lastBuyPrice > 0 ? ((price - h.lastBuyPrice) / h.lastBuyPrice) * 100 : 0;

                                return (
                                    <TableRow key={h.ticker}>
                                        <TableCell className="font-medium">{h.ticker}</TableCell>
                                        <TableCell className="text-right">{formatCrypto(h.amount)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-1">
                                                    <span>{formatCurrency(price)}</span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                                        onClick={() => openPriceDialog(h.ticker)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        <span className="sr-only">{isManualPrice ? 'Edit manual price' : 'Set manual price'}</span>
                                                    </Button>
                                                </div>
                                                {isManualPrice && (
                                                    <span className="text-[10px] uppercase tracking-wide text-amber-600">Manual</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className={cn("flex flex-col items-end", lastBuyDiff >= 0 ? "text-green-600" : "text-red-500")}>
                                                <span className="text-xs font-semibold">{lastBuyDiff > 0 ? '+' : ''}{lastBuyDiff.toFixed(2)}%</span>
                                                <span className="text-[10px] text-muted-foreground">({formatCurrency(h.lastBuyPrice)})</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">{formatCurrency(h.avgBuyPrice)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(value)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className={cn("flex flex-col items-end", pnl >= 0 ? "text-green-600" : "text-red-500")}>
                                                 <span>{pnl > 0 ? '+' : ''}{formatCurrency(pnl)}</span>
                                                 <span className="text-xs">{pnlPercent.toFixed(2)}%</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end">
                                                <span>{actualPct.toFixed(1)}% <span className="text-muted-foreground text-xs">/ {targetPct}%</span></span>
                                                {targetPct > 0 && (
                                                    <span className={cn("text-xs", diff > 0 ? "text-green-500" : "text-red-500")}>
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isPriceDialogOpen} onOpenChange={(open) => {
                if (!open) {
                    closePriceDialog();
                }
            }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>
                            {priceOverrideTicker ? `Manual Price: ${priceOverrideTicker}` : 'Manual Price'}
                        </DialogTitle>
                        <DialogDescription>
                            Set a fixed USD price for this asset. Clearing the override will resume live data from Binance.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="manual-price-input">Price (USD)</Label>
                        <Input
                            id="manual-price-input"
                            type="number"
                            step="any"
                            value={priceOverrideValue}
                            onChange={(event) => setPriceOverrideValue(event.target.value)}
                            placeholder="0.00"
                            autoFocus
                        />
                        {priceDialogError && (
                            <p className="text-sm text-red-500">{priceDialogError}</p>
                        )}
                    </div>
                    <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
                        {priceOverrideTicker && customPrices[priceOverrideTicker] !== undefined && (
                            <Button type="button" variant="secondary" onClick={handlePriceDialogClear}>
                                Clear Manual Price
                            </Button>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={closePriceDialog}>
                                Cancel
                            </Button>
                            <Button type="button" className="w-full sm:w-auto" onClick={handlePriceDialogSave}>
                                Save Price
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
