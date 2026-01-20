import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
    db,
    LedgerEntry,
    Trade,
    TargetAllocation,
    AppSettings,
} from "@/lib/db";
import { useLivePrices } from "@/hooks/use-live-prices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AllocationForm } from "@/components/AllocationForm";
import { BuyFormComponent } from "@/components/forms/BuyFormComponent";
import { SellFormComponent } from "@/components/forms/SellFormComponent";
import { DepositFormComponent } from "@/components/forms/DepositFormComponent";
import { WithdrawFormComponent } from "@/components/forms/WithdrawFormComponent";
import { TransferFormComponent } from "@/components/forms/TransferFormComponent";
import { GainFormComponent } from "@/components/forms/GainFormComponent";
import { LossFormComponent } from "@/components/forms/LossFormComponent";
import { formatCurrency, formatCrypto, cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogTrigger,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil } from "lucide-react";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Legend,
    Tooltip,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
} from "recharts";

// Memoized Portfolio Value Chart to prevent flickering
const PortfolioValueChart = React.memo(({ data }: { data: { date: string; value: number }[] }) => (
    <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
            <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
            />
            <XAxis
                dataKey="date"
                stroke="hsl(var(--foreground))"
                tick={{
                    fill: "hsl(var(--muted-foreground))",
                }}
                tickFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
            />
            <YAxis
                stroke="hsl(var(--foreground))"
                tick={{
                    fill: "hsl(var(--muted-foreground))",
                }}
                tickFormatter={(value) =>
                    formatCurrency(value)
                }
            />
            <Tooltip
                formatter={(value: number) => [
                    formatCurrency(value),
                    "Portfolio Value",
                ]}
                labelFormatter={(label) =>
                    new Date(
                        label,
                    ).toLocaleDateString()
                }
                contentStyle={{
                    backgroundColor:
                        "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    color: "hsl(var(--foreground))",
                }}
            />
            <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
            />
        </LineChart>
    </ResponsiveContainer>
));

// Extended type for View
interface AssetHolding {
    ticker: string;
    amount: number;
    avgBuyPrice: number;
    lastBuyPrice: number;
    totalCostBasis: number;
}

interface DashboardSnapshot {
    holdings: AssetHolding[];
    prices: Record<string, number>;
    totals: {
        totalValue: number;
        totalCostBasis: number;
        totalUnrealizedPnL: number;
        totalPnLPercent: number;
    };
}

// Helper to consolidate ledger entries AND calculate avg buy price
const calculateHoldings = (
    entries: LedgerEntry[] = [],
    trades: Trade[] = [],
    transferTradeIds?: Set<number>,
): AssetHolding[] => {
    // Create a map of tradeId -> trade type for quick lookup
    const tradeTypeMap = new Map<number, string>();
    trades.forEach((trade) => {
        if (trade.id !== undefined) {
            tradeTypeMap.set(trade.id, trade.type);
        }
    });

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
    filteredEntries.forEach((e) => {
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

        history.forEach((entry) => {
            const qty = entry.amount;
            const tradeType = entry.tradeId !== undefined ? tradeTypeMap.get(entry.tradeId) : undefined;

            if (qty > 0) {
                // POSITIVE ENTRY (BUY / RECEIVE / DEPOSIT / GAIN)
                // Check if this is a "gain" transaction
                if (tradeType === "gain") {
                    // Gains don't affect cost basis (cost = $0)
                    // Just add to quantity, don't add to cost
                    totalQty += qty;
                    // Still track last buy price for display (but not for avg calc)
                    // Don't update lastBuy for gains
                } else {
                    // Regular buy/deposit - affects cost basis
                    const price = entry.usdPriceAtTime || 0;
                    const cost = qty * price;

                    if (price > 0) lastBuy = price;

                    totalCost += cost;
                    totalQty += qty;
                }
            } else {
                // NEGATIVE ENTRY (SELL / SEND / WITHDRAW / LOSS)
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
                totalCostBasis: totalCost,
            });
        }
    });

    return results.sort((a, b) => a.ticker.localeCompare(b.ticker));
};

// Calculate realized PnL from sell trades
const calculateRealizedPnL = (
    ledger: LedgerEntry[] = [],
    trades: Trade[] = [],
): number => {
    if (!ledger.length || !trades.length) return 0;

    let totalRealizedPnL = 0;

    // Find all sell trades
    const sellTrades = trades.filter((t) => t.type === "sell");

    sellTrades.forEach((trade) => {
        // Get ledger entries for this sell trade
        const tradeEntries = ledger.filter((e) => e.tradeId === trade.id);

        // Find the negative (sold asset) and positive (received currency) entries
        const soldEntry = tradeEntries.find((e) => e.amount < 0);
        const receivedEntry = tradeEntries.find((e) => e.amount > 0);

        if (soldEntry && receivedEntry && soldEntry.usdPriceAtTime) {
            const soldAmount = Math.abs(soldEntry.amount);
            const costBasis = soldAmount * soldEntry.usdPriceAtTime;
            const proceeds = receivedEntry.amount * (receivedEntry.usdPriceAtTime || 1);
            const pnl = proceeds - costBasis;
            totalRealizedPnL += pnl;
        }
    });

    return totalRealizedPnL;
};

// Cache for historical prices to avoid repeated API calls
const historicalPriceCache = new Map<string, { data: Record<string, number>; timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Fetch historical daily closing prices from Binance
const fetchHistoricalPrices = async (
    symbols: string[],
    days: number = 30,
): Promise<Record<string, Record<string, number>>> => {
    const results: Record<string, Record<string, number>> = {};

    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // Format dates for Binance API (milliseconds timestamp)
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    // Create cache key based on symbols and date range
    const cacheKey = `${symbols.sort().join(',')}_${startTime}_${endTime}`;

    // Check cache first
    const cached = historicalPriceCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return { [symbols[0]]: cached.data }; // Simplified for single symbol case
    }

    // Fetch historical data for each symbol
    const promises = symbols.map(async (symbol) => {
        try {
            // Use Binance klines endpoint for daily data
            const response = await fetch(
                `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=31`
            );

            if (!response.ok) {
                console.warn(`Binance API error for ${symbol}: ${response.status}`);
                return;
            }

            const klines = await response.json();
            const priceData: Record<string, number> = {};

            klines.forEach((kline: any[]) => {
                // Kline format: [openTime, open, high, low, close, volume, closeTime, ...]
                const timestamp = kline[0];
                const closePrice = parseFloat(kline[4]);

                if (!isNaN(closePrice) && closePrice > 0) {
                    // Convert UTC timestamp to local date for proper timezone alignment
                    const utcDate = new Date(timestamp);
                    const localDate = new Date(utcDate.getTime() - (utcDate.getTimezoneOffset() * 60000));
                    const dateStr = localDate.toISOString().split('T')[0];
                    priceData[dateStr] = closePrice;
                }
            });

            results[symbol] = priceData;

            // Cache successful results
            historicalPriceCache.set(`${symbol}_${startTime}_${endTime}`, {
                data: priceData,
                timestamp: Date.now()
            });

        } catch (error) {
            console.warn(`Failed to fetch historical prices for ${symbol}:`, error);
        }
    });

    await Promise.all(promises);
    return results;
};

// Calculate portfolio value using daily closing prices for smoother charts
const calculatePortfolioHistory = async (
    ledger: LedgerEntry[] = [],
    trades: Trade[] = [],
    transferTradeIds: Set<number>,
    livePrices: Record<string, number> = {},
): Promise<{ date: string; value: number }[]> => {
    if (!ledger.length) return [];

    // Get all unique assets in the portfolio
    const uniqueAssets = [...new Set(ledger.map(e => e.assetTicker))];

    // Fetch historical prices for all assets
    const historicalPrices = await fetchHistoricalPrices(uniqueAssets, 30);

    // Get date 30 days ago
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Generate all dates for the last 30 days
    const allDates: Date[] = [];
    for (let i = 0; i <= 30; i++) {
        const date = new Date(thirtyDaysAgo);
        date.setDate(date.getDate() + i);
        allDates.push(date);
    }

    // Calculate portfolio value for each day
    const history: { date: string; value: number }[] = [];

    allDates.forEach((currentDate) => {
        // Get all ledger entries up to and including this date
        const entriesUpToDate = ledger.filter((entry) => {
            const entryTrade = trades.find((t) => t.id === entry.tradeId);
            if (!entryTrade) return false;
            const tradeDate = new Date(entryTrade.date);
            tradeDate.setHours(0, 0, 0, 0);
            return tradeDate <= currentDate;
        });

        // Calculate holdings at this point in time
        const holdingsAtDate = calculateHoldings(
            entriesUpToDate,
            trades,
            transferTradeIds,
        );

        // Calculate total value using historical or live prices
        let totalValue = 0;
        const dateStr = currentDate.toISOString().split('T')[0];
        const isToday = dateStr === today.toISOString().split('T')[0];

        holdingsAtDate.forEach((holding) => {
            let price = 0;

            if (isToday) {
                // Use live price for today
                price = livePrices[holding.ticker] || 0;
            } else {
                // Use historical closing price for past dates
                const assetPrices = historicalPrices[holding.ticker];
                if (assetPrices && assetPrices[dateStr]) {
                    price = assetPrices[dateStr];
                } else {
                    // Forward-fill approach: find the most recent price before this date
                    let fallbackPrice = 0;

                    if (assetPrices) {
                        // Get all available dates for this asset, sorted chronologically
                        const availableDates = Object.keys(assetPrices)
                            .filter(date => assetPrices[date] > 0)
                            .sort(); // Oldest first

                        // Find the most recent date that is on or before our target date
                        for (let i = availableDates.length - 1; i >= 0; i--) {
                            const availableDate = availableDates[i];
                            if (availableDate <= dateStr) {
                                fallbackPrice = assetPrices[availableDate];
                                break;
                            }
                        }
                    }

                    // If no historical price found, use the last known price from ledger entries
                    if (fallbackPrice === 0) {
                        const relevantEntries = entriesUpToDate.filter(
                            (e) =>
                                e.assetTicker === holding.ticker &&
                                e.amount > 0 &&
                                e.usdPriceAtTime,
                        );
                        fallbackPrice = relevantEntries.length > 0
                            ? relevantEntries[relevantEntries.length - 1].usdPriceAtTime || 0
                            : 0;
                    }

                    price = fallbackPrice;
                }
            }

            totalValue += holding.amount * price;
        });

        history.push({
            date: dateStr,
            value: totalValue,
        });
    });

    return history;
};

// Chart colors for asset allocation
const CHART_COLORS = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#84cc16", // lime
    "#f97316", // orange
    "#6366f1", // indigo
];

export default function Dashboard() {
    const [isBuyModalOpen, setIsBuyModalOpen] = React.useState(false);
    const [isSellModalOpen, setIsSellModalOpen] = React.useState(false);
    const [isDepositModalOpen, setIsDepositModalOpen] = React.useState(false);
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = React.useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = React.useState(false);
    const [isGainModalOpen, setIsGainModalOpen] = React.useState(false);
    const [isLossModalOpen, setIsLossModalOpen] = React.useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] =
        React.useState(false);
    const [isPriceDialogOpen, setIsPriceDialogOpen] = React.useState(false);
    const [priceOverrideTicker, setPriceOverrideTicker] = React.useState<
        string | null
    >(null);
    const [priceOverrideValue, setPriceOverrideValue] = React.useState("");
    const [priceDialogError, setPriceDialogError] = React.useState<
        string | null
    >(null);

    // Live query to the DB
    const ledger = useLiveQuery(
        () => db.ledger.toArray(),
        [],
        undefined as LedgerEntry[] | undefined,
    );
    const trades = useLiveQuery(
        () => db.trades.toArray(),
        [],
        undefined as Trade[] | undefined,
    );
    const targets = useLiveQuery(
        () => db.targets.toArray(),
        [],
        undefined as TargetAllocation[] | undefined,
    );
    const settings = useLiveQuery(
        async () => {
            const record = await db.settings.get(1);
            return record ?? { id: 1, customPrices: {} };
        },
        [],
        undefined as AppSettings | undefined,
    );

    const [snapshot, setSnapshot] = React.useState<DashboardSnapshot | null>(
        null,
    );
    const [, startTransition] = React.useTransition();
    const lastStablePricesRef = React.useRef<Record<string, number>>({});

    const transferTradeIds = React.useMemo<Set<number> | undefined>(() => {
        if (!trades) return undefined;
        const ids = new Set<number>();
        trades.forEach((trade) => {
            if (trade.type === "transfer" && typeof trade.id === "number") {
                ids.add(trade.id);
            }
        });
        return ids;
    }, [trades]);

    const holdings = React.useMemo(
        () => calculateHoldings(ledger || [], trades || [], transferTradeIds),
        [ledger, trades, transferTradeIds],
    );

    // Derived Array of assets we need prices for
    const assetList = React.useMemo(
        () => holdings.map((h) => h.ticker),
        [holdings],
    );

    // Use the Hook!
    const customPrices = React.useMemo(
        () => settings?.customPrices || {},
        [settings],
    );
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
        setPriceOverrideValue("");
        setPriceDialogError(null);
    };

    const openPriceDialog = (ticker: string) => {
        setPriceOverrideTicker(ticker);
        const existing = customPrices[ticker];
        const live = prices[ticker];
        setPriceOverrideValue(
            existing !== undefined
                ? existing.toString()
                : live
                  ? live.toString()
                  : "",
        );
        setPriceDialogError(null);
        setIsPriceDialogOpen(true);
    };

    const handlePriceDialogSave = async () => {
        if (!priceOverrideTicker) return;
        const parsed = parseFloat(priceOverrideValue);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            setPriceDialogError("Enter a valid price greater than zero");
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

    const ledgerReady = Array.isArray(ledger);
    const tradesReady = Array.isArray(trades);
    const targetsReady = Array.isArray(targets);
    const settingsReady = Boolean(settings);
    const readyForCalculation =
        ledgerReady && tradesReady && targetsReady && settingsReady;

    React.useEffect(() => {
        if (!readyForCalculation) {
            return;
        }

        const allPricesResolved = holdings.every((holding) => {
            const livePrice = prices[holding.ticker];
            if (Number.isFinite(livePrice)) return true;
            return lastStablePricesRef.current[holding.ticker] !== undefined;
        });

        if (!allPricesResolved) {
            return;
        }

        let cancelled = false;
        startTransition(() => {
            if (cancelled) return;

            const resolvedPrices: Record<string, number> = {};
            holdings.forEach((holding) => {
                const livePrice = prices[holding.ticker];
                if (Number.isFinite(livePrice)) {
                    resolvedPrices[holding.ticker] = livePrice as number;
                } else if (
                    lastStablePricesRef.current[holding.ticker] !== undefined
                ) {
                    resolvedPrices[holding.ticker] =
                        lastStablePricesRef.current[holding.ticker];
                } else {
                    resolvedPrices[holding.ticker] = 0;
                }
            });

            const totalCostBasis = holdings.reduce(
                (sum, h) => sum + h.totalCostBasis,
                0,
            );
            const totalValue = holdings.reduce(
                (sum, h) => sum + h.amount * (resolvedPrices[h.ticker] || 0),
                0,
            );
            const totalUnrealizedPnL = totalValue - totalCostBasis;
            const totalPnLPercent =
                totalCostBasis > 0
                    ? (totalUnrealizedPnL / totalCostBasis) * 100
                    : 0;

            if (cancelled) return;

            lastStablePricesRef.current = resolvedPrices;
            setSnapshot({
                holdings,
                prices: resolvedPrices,
                totals: {
                    totalValue,
                    totalCostBasis,
                    totalUnrealizedPnL,
                    totalPnLPercent,
                },
            });
        });

        return () => {
            cancelled = true;
        };
    }, [readyForCalculation, holdings, prices]);

    const targetMap = React.useMemo(() => {
        const map = new Map<string, number>();
        (targets || []).forEach((t) => map.set(t.ticker, t.percentage));
        return map;
    }, [targets]);

    const hasSnapshot = Boolean(snapshot);
    const totals = snapshot?.totals || {
        totalValue: 0,
        totalCostBasis: 0,
        totalUnrealizedPnL: 0,
        totalPnLPercent: 0,
    };
    const displayedHoldings = snapshot?.holdings || [];
    const priceFor = (ticker: string) => snapshot?.prices[ticker] || 0;

    // Calculate chart data
    const allocationChartData = React.useMemo(() => {
        if (!hasSnapshot || totals.totalValue === 0) return [];

        return displayedHoldings
            .map((holding, index) => {
                const price = priceFor(holding.ticker);
                const value = holding.amount * price;
                const percentage = (value / totals.totalValue) * 100;

                return {
                    name: holding.ticker,
                    value: value,
                    percentage: percentage,
                    color: CHART_COLORS[index % CHART_COLORS.length],
                };
            })
            .filter((item) => item.value > 0);
    }, [hasSnapshot, displayedHoldings, totals.totalValue]);

    const [portfolioHistoryData, setPortfolioHistoryData] = React.useState<{ date: string; value: number }[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = React.useState(false);

    // Calculate portfolio history - recalculate when ledger/trades change or when live prices become available
    React.useEffect(() => {
        if (!ledger || !trades || !transferTradeIds) {
            setPortfolioHistoryData([]);
            return;
        }

        // Only show loading on initial load, not on price updates
        const shouldShowLoading = !portfolioHistoryData.length;
        if (shouldShowLoading) {
            setIsHistoryLoading(true);
        }

        const calculateHistory = async () => {
            try {
        // Use available live prices (empty object if not yet loaded)
        const history = await calculatePortfolioHistory(ledger, trades, transferTradeIds, prices || {});
        setPortfolioHistoryData(history);
            } catch (error) {
                console.error('Failed to calculate portfolio history:', error);
                setPortfolioHistoryData([]);
            } finally {
                if (shouldShowLoading) {
                    setIsHistoryLoading(false);
                }
            }
        };

        calculateHistory();
    }, [ledger, trades, transferTradeIds, prices]);

    // Calculate realized PnL
    const realizedPnL = React.useMemo(() => {
        if (!ledger || !trades) return 0;
        return calculateRealizedPnL(ledger, trades);
    }, [ledger, trades]);

    // Calculate 30-day change
    const thirtyDayChange = React.useMemo(() => {
        if (portfolioHistoryData.length < 2) return { amount: 0, percent: 0 };
        const firstValue = portfolioHistoryData[0].value;
        const lastValue = portfolioHistoryData[portfolioHistoryData.length - 1].value;
        const changeAmount = lastValue - firstValue;
        const changePercent = firstValue > 0 ? (changeAmount / firstValue) * 100 : 0;
        return { amount: changeAmount, percent: changePercent };
    }, [portfolioHistoryData]);

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                    OpenSimperfi Portfolio
                </h1>
                <div className="flex gap-2 flex-wrap">
                    <Dialog
                        open={isAllocationModalOpen}
                        onOpenChange={setIsAllocationModalOpen}
                    >
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                className="flex-1 sm:flex-none"
                            >
                                Manage Strategy
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px] max-w-[95vw]">
                            <DialogHeader>
                                <DialogTitle>Portfolio Targets</DialogTitle>
                            </DialogHeader>
                            <AllocationForm
                                onSuccess={() =>
                                    setIsAllocationModalOpen(false)
                                }
                            />
                        </DialogContent>
                    </Dialog>

                    <div className="flex gap-2 flex-wrap">
                        <Dialog
                            open={isBuyModalOpen}
                            onOpenChange={setIsBuyModalOpen}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">+ Buy</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle>Add Buy Order</DialogTitle>
                                </DialogHeader>
                                <BuyFormComponent
                                    onSuccess={() => setIsBuyModalOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>

                        <Dialog
                            open={isSellModalOpen}
                            onOpenChange={setIsSellModalOpen}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">+ Sell</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle>Add Sell Order</DialogTitle>
                                </DialogHeader>
                                <SellFormComponent
                                    onSuccess={() => setIsSellModalOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>

                        <Dialog
                            open={isDepositModalOpen}
                            onOpenChange={setIsDepositModalOpen}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">+ Deposit</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle>Add Deposit</DialogTitle>
                                </DialogHeader>
                                <DepositFormComponent
                                    onSuccess={() => setIsDepositModalOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>

                        <Dialog
                            open={isWithdrawModalOpen}
                            onOpenChange={setIsWithdrawModalOpen}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">+ Withdraw</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle>Add Withdrawal</DialogTitle>
                                </DialogHeader>
                                <WithdrawFormComponent
                                    onSuccess={() => setIsWithdrawModalOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>

                        <Dialog
                            open={isTransferModalOpen}
                            onOpenChange={setIsTransferModalOpen}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">+ Transfer</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle>Add Transfer</DialogTitle>
                                </DialogHeader>
                                <TransferFormComponent
                                    onSuccess={() => setIsTransferModalOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>

                        <Dialog
                            open={isGainModalOpen}
                            onOpenChange={setIsGainModalOpen}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">+ Gain</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle>Record Gain</DialogTitle>
                                </DialogHeader>
                                <GainFormComponent
                                    onSuccess={() => setIsGainModalOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>

                        <Dialog
                            open={isLossModalOpen}
                            onOpenChange={setIsLossModalOpen}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">+ Loss</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle>Record Loss</DialogTitle>
                                </DialogHeader>
                                <LossFormComponent
                                    onSuccess={() => setIsLossModalOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Portfolio Value
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hasSnapshot ? (
                            <>
                                <div className="text-2xl font-bold">
                                    {formatCurrency(totals.totalValue)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Cost Basis:{" "}
                                    {formatCurrency(totals.totalCostBasis)}
                                </p>
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
                        <CardTitle className="text-sm font-medium">
                            Unrealized PnL
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hasSnapshot ? (
                            <>
                                <div
                                    className={cn(
                                        "text-2xl font-bold",
                                        totals.totalUnrealizedPnL >= 0
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-500 dark:text-red-400",
                                    )}
                                >
                                    {totals.totalUnrealizedPnL > 0 ? "+" : ""}
                                    {formatCurrency(totals.totalUnrealizedPnL)}
                                </div>
                                <p
                                    className={cn(
                                        "text-xs mt-1",
                                        totals.totalPnLPercent >= 0
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-500 dark:text-red-400",
                                    )}
                                >
                                    {totals.totalPnLPercent > 0 ? "+" : ""}
                                    {totals.totalPnLPercent.toFixed(2)}%
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
                        <CardTitle className="text-sm font-medium">
                            Realized PnL
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hasSnapshot ? (
                            <>
                                <div
                                    className={cn(
                                        "text-2xl font-bold",
                                        realizedPnL >= 0
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-500 dark:text-red-400",
                                    )}
                                >
                                    {realizedPnL > 0 ? "+" : ""}
                                    {formatCurrency(realizedPnL)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    From sell orders
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
                        <CardTitle className="text-sm font-medium">
                            30-Day Change
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hasSnapshot ? (
                            <>
                                <div
                                    className={cn(
                                        "text-2xl font-bold",
                                        thirtyDayChange.amount >= 0
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-500 dark:text-red-400",
                                    )}
                                >
                                    {thirtyDayChange.amount > 0 ? "+" : ""}
                                    {formatCurrency(thirtyDayChange.amount)}
                                </div>
                                <p
                                    className={cn(
                                        "text-xs mt-1",
                                        thirtyDayChange.percent >= 0
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-500 dark:text-red-400",
                                    )}
                                >
                                    {thirtyDayChange.percent > 0 ? "+" : ""}
                                    {thirtyDayChange.percent.toFixed(2)}%
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

            {/* Charts Row */}
            {hasSnapshot && (
                <div className="grid gap-4 md:grid-cols-2">
                    {/* Asset Allocation Pie Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Asset Allocation</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {allocationChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={allocationChartData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({
                                                cx,
                                                cy,
                                                midAngle,
                                                innerRadius,
                                                outerRadius,
                                                percent,
                                                name,
                                            }: any) => {
                                                const RADIAN = Math.PI / 180;
                                                const radius =
                                                    innerRadius +
                                                    (outerRadius -
                                                        innerRadius) *
                                                        0.5;
                                                const x =
                                                    cx +
                                                    radius *
                                                        Math.cos(
                                                            -midAngle * RADIAN,
                                                        );
                                                const y =
                                                    cy +
                                                    radius *
                                                        Math.sin(
                                                            -midAngle * RADIAN,
                                                        );

                                                return (
                                                    <text
                                                        x={x}
                                                        y={y}
                                                        fill="white"
                                                        stroke="#000"
                                                        strokeWidth="1"
                                                        paintOrder="stroke"
                                                        textAnchor={
                                                            x > cx
                                                                ? "start"
                                                                : "end"
                                                        }
                                                        dominantBaseline="central"
                                                        style={{
                                                            fontSize: "12px",
                                                            fontWeight: "bold",
                                                        }}
                                                    >
                                                        {`${name} ${(percent * 100).toFixed(1)}%`}
                                                    </text>
                                                );
                                            }}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                            isAnimationActive={false}
                                        >
                                            {allocationChartData.map(
                                                (entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.color}
                                                    />
                                                ),
                                            )}
                                        </Pie>
                                        <Tooltip
                                            formatter={(
                                                value: number,
                                                name: string,
                                                props: any,
                                            ) => [
                                                `${formatCurrency(value)} (${props.payload.percentage.toFixed(1)}%)`,
                                                name,
                                            ]}
                                            contentStyle={{
                                                backgroundColor:
                                                    "hsl(var(--background))",
                                                border: "1px solid hsl(var(--border))",
                                                borderRadius: "6px",
                                                color: "hsl(var(--foreground))",
                                            }}
                                        />
                                        <Legend
                                            formatter={(value: string) => {
                                                const data =
                                                    allocationChartData.find(
                                                        (d) => d.name === value,
                                                    );
                                                return `${value} (${data?.percentage.toFixed(1)}%)`;
                                            }}
                                            wrapperStyle={{ fontSize: "14px" }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                                    No assets to display
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Portfolio Value History Line Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                Portfolio Value (Last 30 Days)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isHistoryLoading ? (
                                <div className="h-[300px] flex items-center justify-center">
                                    <div className="text-center">
                                        <Skeleton className="h-4 w-32 mx-auto mb-2" />
                                        <Skeleton className="h-4 w-24 mx-auto" />
                                    </div>
                                </div>
                            ) : portfolioHistoryData.length > 0 ? (
                                <PortfolioValueChart data={portfolioHistoryData} />
                            ) : (
                                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                                    No transaction history in the last 30 days
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Holdings</CardTitle>
                </CardHeader>
                <CardContent>
                    {!hasSnapshot ? (
                        <>
                            {/* Desktop Table */}
                            <Table className="hidden md:table">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asset</TableHead>
                                        <TableHead className="text-right">
                                            Balance
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Price
                                        </TableHead>
                                        <TableHead className="text-right">
                                            vs Last Buy
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Avg Buy
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Value
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Unrealized PnL
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Allocation (Actual / Target)
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[1, 2, 3].map((i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <Skeleton className="h-4 w-16" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="h-4 w-20 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="h-4 w-16 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="h-4 w-16 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="h-4 w-16 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="h-4 w-20 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="h-4 w-20 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Skeleton className="h-4 w-24 ml-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {/* Mobile Cards */}
                            <div className="md:hidden space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="border rounded-lg p-4 space-y-2"
                                    >
                                        <Skeleton className="h-5 w-20" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-3/4" />
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <Table className="hidden md:table">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asset</TableHead>
                                        <TableHead className="text-right">
                                            Balance
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Price
                                        </TableHead>
                                        <TableHead className="text-right">
                                            vs Last Buy
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Avg Buy
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Value
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Unrealized PnL
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Allocation (Actual / Target)
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayedHoldings.map((h) => {
                                        const price = priceFor(h.ticker);
                                        const isManualPrice =
                                            customPrices[h.ticker] !==
                                            undefined;
                                        const value = h.amount * price;
                                        const actualPct =
                                            totals.totalValue > 0
                                                ? (value / totals.totalValue) *
                                                  100
                                                : 0;
                                        const targetPct =
                                            targetMap.get(h.ticker) || 0;
                                        const diff = actualPct - targetPct;

                                        const pnl = value - h.totalCostBasis;
                                        const pnlPercent =
                                            h.totalCostBasis > 0
                                                ? (pnl / h.totalCostBasis) * 100
                                                : 0;
                                        const lastBuyDiff =
                                            h.lastBuyPrice > 0
                                                ? ((price - h.lastBuyPrice) /
                                                      h.lastBuyPrice) *
                                                  100
                                                : 0;

                                        return (
                                            <TableRow key={h.ticker}>
                                                <TableCell className="font-medium">
                                                    {h.ticker}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCrypto(h.amount)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="flex items-center gap-1">
                                                            <span>
                                                                {formatCurrency(
                                                                    price,
                                                                )}
                                                            </span>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                                                onClick={() =>
                                                                    openPriceDialog(
                                                                        h.ticker,
                                                                    )
                                                                }
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                                <span className="sr-only">
                                                                    {isManualPrice
                                                                        ? "Edit manual price"
                                                                        : "Set manual price"}
                                                                </span>
                                                            </Button>
                                                        </div>
                                                        {isManualPrice && (
                                                            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                                                Manual
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div
                                                        className={cn(
                                                            "flex flex-col items-end",
                                                            lastBuyDiff >= 0
                                                                ? "text-green-600 dark:text-green-400"
                                                                : "text-red-500 dark:text-red-400",
                                                        )}
                                                    >
                                                        <span className="text-xs font-semibold">
                                                            {lastBuyDiff > 0
                                                                ? "+"
                                                                : ""}
                                                            {lastBuyDiff.toFixed(
                                                                2,
                                                            )}
                                                            %
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            (
                                                            {formatCurrency(
                                                                h.lastBuyPrice,
                                                            )}
                                                            )
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {formatCurrency(
                                                        h.avgBuyPrice,
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCurrency(value)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div
                                                        className={cn(
                                                            "flex flex-col items-end",
                                                            pnl >= 0
                                                                ? "text-green-600 dark:text-green-400"
                                                                : "text-red-500 dark:text-red-400",
                                                        )}
                                                    >
                                                        <span>
                                                            {pnl > 0 ? "+" : ""}
                                                            {formatCurrency(
                                                                pnl,
                                                            )}
                                                        </span>
                                                        <span className="text-xs">
                                                            {pnlPercent.toFixed(
                                                                2,
                                                            )}
                                                            %
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span>
                                                            {actualPct.toFixed(
                                                                1,
                                                            )}
                                                            %{" "}
                                                            <span className="text-muted-foreground text-xs">
                                                                / {targetPct}%
                                                            </span>
                                                        </span>
                                                        {targetPct > 0 && diff !== 0 && (
                                                            <span
                                                                className={cn(
                                                                    "text-xs",
                                                                    diff > 0
                                                                        ? "text-amber-600 dark:text-amber-400"
                                                                        : "text-blue-500 dark:text-blue-400",
                                                                )}
                                                            >
                                                                {diff > 0 ? ">" : "<"}{" "}
                                                                {Math.abs(diff).toFixed(1)}%
                                                                {" ("}                                                                {formatCrypto(
                                                                    (Math.abs(diff) / 100) * totals.totalValue / price
                                                                )}
                                                                {" "}{h.ticker})
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            {/* Mobile Cards */}
                            <div className="md:hidden space-y-3">
                                {displayedHoldings.map((h) => {
                                    const price = priceFor(h.ticker);
                                    const isManualPrice =
                                        customPrices[h.ticker] !== undefined;
                                    const value = h.amount * price;
                                    const actualPct =
                                        totals.totalValue > 0
                                            ? (value / totals.totalValue) * 100
                                            : 0;
                                    const targetPct =
                                        targetMap.get(h.ticker) || 0;
                                    const diff = actualPct - targetPct;

                                    const pnl = value - h.totalCostBasis;
                                    const pnlPercent =
                                        h.totalCostBasis > 0
                                            ? (pnl / h.totalCostBasis) * 100
                                            : 0;

                                    return (
                                        <div
                                            key={h.ticker}
                                            className="border rounded-lg p-4 space-y-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold">
                                                    {h.ticker}
                                                </h3>
                                                <div className="text-right">
                                                    <div className="text-sm font-medium">
                                                        {formatCurrency(value)}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {actualPct.toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <div className="text-muted-foreground text-xs mb-1">
                                                        Balance
                                                    </div>
                                                    <div className="font-medium">
                                                        {formatCrypto(h.amount)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-muted-foreground text-xs mb-1">
                                                        Price
                                                    </div>
                                                    <div className="flex items-center gap-1 justify-end">
                                                        <span className="font-medium">
                                                            {formatCurrency(
                                                                price,
                                                            )}
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5 p-0 text-muted-foreground"
                                                            onClick={() =>
                                                                openPriceDialog(
                                                                    h.ticker,
                                                                )
                                                            }
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    {isManualPrice && (
                                                        <div className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 text-right">
                                                            Manual
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-muted-foreground text-xs mb-1">
                                                        Unrealized PnL
                                                    </div>
                                                    <div
                                                        className={cn(
                                                            "font-medium",
                                                            pnl >= 0
                                                                ? "text-green-600 dark:text-green-400"
                                                                : "text-red-500 dark:text-red-400",
                                                        )}
                                                    >
                                                        {pnl > 0 ? "+" : ""}
                                                        {formatCurrency(pnl)}
                                                        <span className="text-xs ml-1">
                                                            (
                                                            {pnlPercent.toFixed(
                                                                2,
                                                            )}
                                                            %)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-muted-foreground text-xs mb-1">
                                                        Target Allocation
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-medium">
                                                            {targetPct}%
                                                        </span>
                                                        {targetPct > 0 && diff !== 0 && (
                                                            <span
                                                                className={cn(
                                                                    "text-xs ml-1",
                                                                    diff > 0
                                                                        ? "text-amber-600 dark:text-amber-400"
                                                                        : "text-blue-500 dark:text-blue-400",
                                                                )}
                                                            >
                                                                ({diff > 0 ? ">" : "<"}{" "}
                                                                {Math.abs(diff).toFixed(1)}%
                                                                {" "}                                                                {formatCrypto(
                                                                    (Math.abs(diff) / 100) * totals.totalValue / price
                                                                )}
                                                                {" "}{h.ticker})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={isPriceDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closePriceDialog();
                    }
                }}
            >
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>
                            {priceOverrideTicker
                                ? `Manual Price: ${priceOverrideTicker}`
                                : "Manual Price"}
                        </DialogTitle>
                        <DialogDescription>
                            Set a fixed USD price for this asset. Clearing the
                            override will resume live data from Binance.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="manual-price-input">Price (USD)</Label>
                        <Input
                            id="manual-price-input"
                            type="number"
                            step="any"
                            value={priceOverrideValue}
                            onChange={(event) =>
                                setPriceOverrideValue(event.target.value)
                            }
                            placeholder="0.00"
                            autoFocus
                        />
                        {priceDialogError && (
                            <p className="text-sm text-red-500">
                                {priceDialogError}
                            </p>
                        )}
                    </div>
                    <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
                        {priceOverrideTicker &&
                            customPrices[priceOverrideTicker] !== undefined && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handlePriceDialogClear}
                                >
                                    Clear Manual Price
                                </Button>
                            )}
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={closePriceDialog}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="w-full sm:w-auto"
                                onClick={handlePriceDialogSave}
                            >
                                Save Price
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
