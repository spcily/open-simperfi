import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Holding, TargetAllocation, AppSettings, Account } from '@/lib/db';
import { useLivePrices } from '@/hooks/use-live-prices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HoldingForm } from '@/components/HoldingForm';
import { AllocationForm } from '@/components/AllocationForm';
import { formatCurrency, formatCrypto, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Plus, Calculator } from 'lucide-react';

interface DashboardSnapshot {
    holdings: Holding[];
    prices: Record<string, number>;
    totals: {
        totalValue: number;
        totalCostBasis: number;
        totalUnrealizedPnL: number;
        totalPnLPercent: number;
        totalRealizedPnL: number;
    };
}

interface EditCalculatorState {
    holding: Holding;
    accountId: number | null; // null means editing portfolio averages
    type: 'buy' | 'sell'; // which average to edit
}

export default function Dashboard() {
    const [isHoldingDialogOpen, setIsHoldingDialogOpen] = React.useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = React.useState(false);
    const [isPriceDialogOpen, setIsPriceDialogOpen] = React.useState(false);
    const [isDepositDialogOpen, setIsDepositDialogOpen] = React.useState(false);
    const [depositAmount, setDepositAmount] = React.useState('');
    const [priceOverrideTicker, setPriceOverrideTicker] = React.useState<string | null>(null);
    const [priceOverrideValue, setPriceOverrideValue] = React.useState('');
    const [priceDialogError, setPriceDialogError] = React.useState<string | null>(null);
    const [editingHolding, setEditingHolding] = React.useState<Holding | undefined>(undefined);
    const [editCalculator, setEditCalculator] = React.useState<EditCalculatorState | null>(null);

    // Live query to the DB
    const holdings = useLiveQuery(() => db.holdings.toArray(), [], undefined as Holding[] | undefined);
    const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined as Account[] | undefined);
    const targets = useLiveQuery(() => db.targets.toArray(), [], undefined as TargetAllocation[] | undefined);
    const settings = useLiveQuery(async () => {
        const record = await db.settings.get(1);
        return record ?? { id: 1, customPrices: {}, depositedAmount: 0 };
    }, [], undefined as AppSettings | undefined);

    const [snapshot, setSnapshot] = React.useState<DashboardSnapshot | null>(null);
    const [, startTransition] = React.useTransition();
    const lastStablePricesRef = React.useRef<Record<string, number>>({});

    // Derived Array of assets we need prices for
    const assetList = React.useMemo(() => 
        (holdings || []).filter(h => h.currentAmount > 0).map(h => h.ticker), 
        [holdings]
    );
    
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

    const holdingsReady = Array.isArray(holdings);
    const targetsReady = Array.isArray(targets);
    const settingsReady = Boolean(settings);
    const readyForCalculation = holdingsReady && targetsReady && settingsReady;

    React.useEffect(() => {
        if (!readyForCalculation || !holdings) {
            return;
        }

        const activeHoldings = holdings.filter(h => h.currentAmount > 0);

        let cancelled = false;
        startTransition(() => {
            if (cancelled) return;

            const resolvedPrices: Record<string, number> = {};
            
            // Resolve prices for all holdings (not just active ones) to show in table
            holdings.forEach((holding) => {
                const livePrice = prices[holding.ticker];
                const customPrice = customPrices[holding.ticker];
                
                if (customPrice !== undefined) {
                    // Manual price override takes precedence
                    resolvedPrices[holding.ticker] = customPrice;
                } else if (Number.isFinite(livePrice)) {
                    // Use live price from Binance
                    resolvedPrices[holding.ticker] = livePrice as number;
                } else if (lastStablePricesRef.current[holding.ticker] !== undefined) {
                    // Use last known price
                    resolvedPrices[holding.ticker] = lastStablePricesRef.current[holding.ticker];
                } else {
                    // Default to 0 if no price available
                    resolvedPrices[holding.ticker] = 0;
                }
            });

            const totalCostBasis = activeHoldings.reduce((sum, h) => 
                sum + (h.buyAvgPrice * h.currentAmount), 0
            );
            const totalValue = activeHoldings.reduce((sum, h) => 
                sum + (h.currentAmount * (resolvedPrices[h.ticker] || 0)), 0
            );
            const totalUnrealizedPnL = totalValue - totalCostBasis;
            const totalPnLPercent = totalCostBasis > 0 ? (totalUnrealizedPnL / totalCostBasis) * 100 : 0;
            
            // Calculate realized PnL from sells
            const totalRealizedPnL = activeHoldings.reduce((sum, h) => {
                if (!h.sellTotalAmount || !h.sellAvgPrice) return sum;
                const sellRevenue = h.sellTotalAmount * h.sellAvgPrice;
                const sellCost = h.sellTotalAmount * h.buyAvgPrice;
                return sum + (sellRevenue - sellCost);
            }, 0);

            if (cancelled) return;

            // Update last stable prices with resolved prices
            Object.keys(resolvedPrices).forEach(ticker => {
                if (resolvedPrices[ticker] > 0) {
                    lastStablePricesRef.current[ticker] = resolvedPrices[ticker];
                }
            });
            
            setSnapshot({
                holdings: holdings, // Show all holdings, not just active ones
                prices: resolvedPrices,
                totals: {
                    totalValue,
                    totalCostBasis,
                    totalUnrealizedPnL,
                    totalPnLPercent,
                    totalRealizedPnL,
                },
            });
        });

        return () => {
            cancelled = true;
        };
    }, [readyForCalculation, holdings, prices, customPrices]);

    const hasSnapshot = Boolean(snapshot);
    const totals = snapshot?.totals || {
        totalValue: 0,
        totalCostBasis: 0,
        totalUnrealizedPnL: 0,
        totalPnLPercent: 0,
        totalRealizedPnL: 0,
    };
    const displayedHoldings = snapshot?.holdings || [];
    const priceFor = (ticker: string) => snapshot?.prices[ticker] || 0;

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

                    <Dialog open={isHoldingDialogOpen} onOpenChange={(open) => {
                        setIsHoldingDialogOpen(open);
                        if (!open) setEditingHolding(undefined);
                    }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> Add Holding
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingHolding ? 'Edit Holding' : 'Add New Holding'}
                                </DialogTitle>
                            </DialogHeader>
                            <HoldingForm
                                holding={editingHolding}
                                onSuccess={() => {
                                    setIsHoldingDialogOpen(false);
                                    setEditingHolding(undefined);
                                }}
                            />
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
                        {hasSnapshot ? (
                            <>
                                <div className="text-2xl font-bold">{formatCurrency(totals.totalValue)}</div>
                                <div className="flex items-center gap-1 mt-1">
                                    <p className="text-xs text-muted-foreground">
                                       Deposited: {formatCurrency(settings?.depositedAmount || 0)}
                                    </p>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            setDepositAmount((settings?.depositedAmount || 0).toString());
                                            setIsDepositDialogOpen(true);
                                        }}
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Skeleton className="h-8 w-32 mb-2" />
                                <Skeleton className="h-4 w-24" />
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium">Unrealized PnL</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hasSnapshot ? (
                            <>
                                <div className={cn(
                                    "text-2xl font-bold",
                                    totals.totalUnrealizedPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                                )}>
                                    {totals.totalUnrealizedPnL > 0 ? '+' : ''}{formatCurrency(totals.totalUnrealizedPnL)}
                                </div>
                                <p className={cn(
                                    "text-xs mt-1",
                                    totals.totalPnLPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                                )}>
                                     {totals.totalPnLPercent > 0 ? '+' : ''}{totals.totalPnLPercent.toFixed(2)}%
                                </p>
                            </>
                        ) : (
                            <>
                                <Skeleton className="h-8 w-32 mb-2" />
                                <Skeleton className="h-4 w-20" />
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium">All-Time PnL</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hasSnapshot ? (
                            <>
                                {(() => {
                                    const deposited = settings?.depositedAmount || 0;
                                    const allTimePnL = totals.totalValue - deposited;
                                    const allTimePnLPercent = deposited > 0 ? (allTimePnL / deposited) * 100 : 0;
                                    return (
                                        <>
                                            <div className={cn(
                                                "text-2xl font-bold",
                                                allTimePnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                                            )}>
                                                {allTimePnL > 0 ? '+' : ''}{formatCurrency(allTimePnL)}
                                            </div>
                                            <p className={cn(
                                                "text-xs mt-1",
                                                allTimePnLPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                                            )}>
                                                {allTimePnLPercent > 0 ? '+' : ''}{allTimePnLPercent.toFixed(2)}%
                                            </p>
                                        </>
                                    );
                                })()}
                            </>
                        ) : (
                            <>
                                <Skeleton className="h-8 w-32 mb-2" />
                                <Skeleton className="h-4 w-20" />
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium">Total PnL</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hasSnapshot ? (
                            <>
                                <div className={cn(
                                    "text-2xl font-bold",
                                    (totals.totalRealizedPnL + totals.totalUnrealizedPnL) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                                )}>
                                    {(totals.totalRealizedPnL + totals.totalUnrealizedPnL) > 0 ? '+' : ''}{formatCurrency(totals.totalRealizedPnL + totals.totalUnrealizedPnL)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                   Realized + Unrealized
                                </p>
                            </>
                        ) : (
                            <>
                                <Skeleton className="h-8 w-32 mb-2" />
                                <Skeleton className="h-4 w-20" />
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Holdings</CardTitle>
                </CardHeader>
                <CardContent>
                    {!hasSnapshot ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asset</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead className="text-right">Buy Avg</TableHead>
                                        <TableHead className="text-right">Sell Avg</TableHead>
                                        {[1, 2, 3].map((i) => (
                                            <TableHead key={i} className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableHead>
                                        ))}
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[1, 2, 3].map((i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asset</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                Buy Avg
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 p-0 text-muted-foreground"
                                                    onClick={() => setEditCalculator({ holding: displayedHoldings[0], accountId: null, type: 'buy' })}
                                                    disabled={displayedHoldings.length === 0}
                                                >
                                                    <Calculator className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                Sell Avg
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 p-0 text-muted-foreground"
                                                    onClick={() => setEditCalculator({ holding: displayedHoldings[0], accountId: null, type: 'sell' })}
                                                    disabled={displayedHoldings.length === 0}
                                                >
                                                    <Calculator className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </TableHead>
                                        {accounts?.map((account) => (
                                            <TableHead key={account.id} className="text-right">
                                                {account.name}
                                            </TableHead>
                                        ))}
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayedHoldings.map((h) => {
                                        const price = priceFor(h.ticker);
                                        const isManualPrice = customPrices[h.ticker] !== undefined;
                                        const value = h.currentAmount * price;

                                        return (
                                            <TableRow key={h.id}>
                                                <TableCell className="font-medium">{h.ticker}</TableCell>
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
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className="text-muted-foreground">{formatCurrency(h.buyAvgPrice)}</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                                            onClick={() => setEditCalculator({ holding: h, accountId: null, type: 'buy' })}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className="text-muted-foreground">{h.sellAvgPrice ? formatCurrency(h.sellAvgPrice) : '-'}</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                                            onClick={() => setEditCalculator({ holding: h, accountId: null, type: 'sell' })}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                {accounts?.map((account) => {
                                                    const accountHolding = h.accountDistribution.find(d => d.accountId === account.id);
                                                    const amount = accountHolding?.amount || 0;
                                                    return (
                                                        <TableCell key={account.id} className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <span>{formatCrypto(amount)}</span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                                                    onClick={() => setEditCalculator({ holding: h, accountId: account.id!, type: 'buy' })}
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    );
                                                })}
                                                <TableCell className="text-right font-medium">{formatCrypto(h.currentAmount)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(value)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
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

            {editCalculator && (
                <EditCalculatorDialog
                    holding={editCalculator.holding}
                    accountId={editCalculator.accountId}
                    type={editCalculator.type}
                    accounts={accounts || []}
                    open={true}
                    onOpenChange={(open) => !open && setEditCalculator(null)}
                    onSuccess={() => setEditCalculator(null)}
                />
            )}

            <Dialog open={isDepositDialogOpen} onOpenChange={setIsDepositDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Set Deposited Amount</DialogTitle>
                        <DialogDescription>
                            Total amount you've invested/deposited into your portfolio
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="deposit-amount">Deposited Amount (USD)</Label>
                            <Input
                                id="deposit-amount"
                                type="number"
                                step="any"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                placeholder="0.00"
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Current: {formatCurrency(settings?.depositedAmount || 0)}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDepositDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={async () => {
                            const amt = parseFloat(depositAmount);
                            if (Number.isFinite(amt) && amt >= 0) {
                                await db.settings.put({
                                    ...(settings || {}),
                                    id: settings?.id || 1,
                                    depositedAmount: amt,
                                });
                                setIsDepositDialogOpen(false);
                            }
                        }}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Calculator Dialog Component
interface EditCalculatorDialogProps {
    holding: Holding;
    accountId: number | null; // null = edit portfolio averages
    type: 'buy' | 'sell';
    accounts: Account[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

function EditCalculatorDialog({ holding, accountId, type, accounts, open, onOpenChange, onSuccess }: EditCalculatorDialogProps) {
    const [newAmount, setNewAmount] = React.useState('');
    const [buyAmount, setBuyAmount] = React.useState('');
    const [buyPrice, setBuyPrice] = React.useState('');
    const [sellAmount, setSellAmount] = React.useState('');
    const [sellPrice, setSellPrice] = React.useState('');
    const [error, setError] = React.useState('');

    const isEditingAccount = accountId !== null;
    const accountHolding = isEditingAccount ? holding.accountDistribution.find(d => d.accountId === accountId) : null;
    const currentAmount = isEditingAccount ? (accountHolding?.amount || 0) : holding.currentAmount;
    const accountName = isEditingAccount ? accounts.find(a => a.id === accountId)?.name : 'Portfolio';

    // Initialize newAmount with current amount when dialog opens
    React.useEffect(() => {
        if (open && isEditingAccount) {
            setNewAmount(currentAmount.toString());
        }
    }, [open, isEditingAccount, currentAmount]);

    const handleUpdateAmount = async () => {
        setError('');
        const amt = parseFloat(newAmount);

        if (!Number.isFinite(amt) || amt < 0) {
            setError('Invalid amount');
            return;
        }

        // Update account distribution
        const updatedDistribution = holding.accountDistribution.map(d => 
            d.accountId === accountId ? { ...d, amount: amt } : d
        );
        const newTotalAmount = updatedDistribution.reduce((sum, d) => sum + d.amount, 0);

        await db.holdings.update(holding.id!, {
            currentAmount: newTotalAmount,
            accountDistribution: updatedDistribution,
        });

        setNewAmount('');
        onSuccess();
    };

    const calculatedBuyAvg = React.useMemo(() => {
        const amt = parseFloat(buyAmount);
        const price = parseFloat(buyPrice);
        if (Number.isFinite(amt) && Number.isFinite(price) && amt > 0 && price > 0) {
            const totalCost = holding.buyAvgPrice * holding.buyTotalAmount + price * amt;
            const totalAmount = holding.buyTotalAmount + amt;
            return totalCost / totalAmount;
        }
        return null;
    }, [buyAmount, buyPrice, holding.buyAvgPrice, holding.buyTotalAmount]);

    const calculatedSellAvg = React.useMemo(() => {
        const amt = parseFloat(sellAmount);
        const price = parseFloat(sellPrice);
        if (Number.isFinite(amt) && Number.isFinite(price) && amt > 0 && price > 0) {
            const prevSellTotal = holding.sellTotalAmount || 0;
            const prevSellSum = (holding.sellAvgPrice || 0) * prevSellTotal;
            const newSellSum = prevSellSum + price * amt;
            const newSellTotal = prevSellTotal + amt;
            return newSellSum / newSellTotal;
        }
        return null;
    }, [sellAmount, sellPrice, holding.sellAvgPrice, holding.sellTotalAmount]);

    const handleApplyBuy = async () => {
        setError('');
        const amt = parseFloat(buyAmount);
        const price = parseFloat(buyPrice);

        if (!Number.isFinite(amt) || amt <= 0) {
            setError('Invalid buy amount');
            return;
        }
        if (!Number.isFinite(price) || price <= 0) {
            setError('Invalid buy price');
            return;
        }

        const totalCost = holding.buyAvgPrice * holding.buyTotalAmount + price * amt;
        const totalAmount = holding.buyTotalAmount + amt;
        const newBuyAvg = totalCost / totalAmount;

        await db.holdings.update(holding.id!, {
            buyAvgPrice: newBuyAvg,
            buyTotalAmount: totalAmount,
        });

        setBuyAmount('');
        setBuyPrice('');
        onSuccess();
    };

    const handleApplySell = async () => {
        setError('');
        const amt = parseFloat(sellAmount);
        const price = parseFloat(sellPrice);

        if (!Number.isFinite(amt) || amt <= 0) {
            setError('Invalid sell amount');
            return;
        }
        if (!Number.isFinite(price) || price <= 0) {
            setError('Invalid sell price');
            return;
        }

        const prevSellTotal = holding.sellTotalAmount || 0;
        const prevSellSum = (holding.sellAvgPrice || 0) * prevSellTotal;
        const newSellSum = prevSellSum + price * amt;
        const newSellTotal = prevSellTotal + amt;
        const newSellAvg = newSellSum / newSellTotal;

        await db.holdings.update(holding.id!, {
            sellAvgPrice: newSellAvg,
            sellTotalAmount: newSellTotal,
        });

        setSellAmount('');
        setSellPrice('');
        onSuccess();
    };

    // Render account edit dialog (simple amount input)
    if (isEditingAccount) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>
                            Edit {holding.ticker} in {accountName}
                        </DialogTitle>
                        <DialogDescription>
                            Set the holding amount for this account
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                                id="amount"
                                type="number"
                                step="any"
                                value={newAmount}
                                onChange={(e) => setNewAmount(e.target.value)}
                                placeholder="0.00"
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Current: {formatCrypto(currentAmount)} {holding.ticker}
                            </p>
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateAmount}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Render portfolio average calculator dialog
    if (type === 'buy') {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>
                            Edit {holding.ticker} Buy Average
                        </DialogTitle>
                        <DialogDescription>
                            Calculate new buy average using buy amount and price
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <p className="text-muted-foreground">Current Holdings:</p>
                                <p className="font-medium">{formatCrypto(currentAmount)} {holding.ticker}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Current Buy Avg:</p>
                                <p className="font-medium">{formatCurrency(holding.buyAvgPrice)}</p>
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                                <Calculator className="h-4 w-4" />
                                Buy Calculator
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label>Buy Amount</Label>
                                    <Input
                                        type="number"
                                        step="any"
                                        value={buyAmount}
                                        onChange={(e) => setBuyAmount(e.target.value)}
                                        placeholder="0.00"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <Label>Buy Price (USD)</Label>
                                    <Input
                                        type="number"
                                        step="any"
                                        value={buyPrice}
                                        onChange={(e) => setBuyPrice(e.target.value)}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            {calculatedBuyAvg && (
                                <div className="mt-2 p-2 bg-muted rounded text-sm">
                                    <span className="text-muted-foreground">New Buy Avg: </span>
                                    <span className="font-semibold">{formatCurrency(calculatedBuyAvg)}</span>
                                </div>
                            )}
                        </div>

                        {error && <p className="text-sm text-red-500">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleApplyBuy}
                            disabled={!calculatedBuyAvg}
                        >
                            Apply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Sell average calculator
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>
                        Edit {holding.ticker} Sell Average
                    </DialogTitle>
                    <DialogDescription>
                        Calculate new sell average using sell amount and price
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <p className="text-muted-foreground">Current Holdings:</p>
                            <p className="font-medium">{formatCrypto(currentAmount)} {holding.ticker}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Current Sell Avg:</p>
                            <p className="font-medium">{holding.sellAvgPrice ? formatCurrency(holding.sellAvgPrice) : 'None'}</p>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                            <Calculator className="h-4 w-4" />
                            Sell Calculator
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Sell Amount</Label>
                                <Input
                                    type="number"
                                    step="any"
                                    value={sellAmount}
                                    onChange={(e) => setSellAmount(e.target.value)}
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <Label>Sell Price (USD)</Label>
                                <Input
                                    type="number"
                                    step="any"
                                    value={sellPrice}
                                    onChange={(e) => setSellPrice(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        {calculatedSellAvg && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <span className="text-muted-foreground">New Sell Avg: </span>
                                <span className="font-semibold">{formatCurrency(calculatedSellAvg)}</span>
                            </div>
                        )}
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApplySell}
                        variant="secondary"
                        disabled={!calculatedSellAvg}
                    >
                        Apply
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
