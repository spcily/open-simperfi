import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { db, Account } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssetCombobox } from "@/components/ui/asset-combobox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { filterStablecoins, isStablecoin } from "@/lib/stablecoins";

const sellSchema = z.object({
    date: z.string(),
    notes: z.string().optional(),
    accountId: z.string().min(1, "Account is required"),
    sellingAsset: z.string().min(1, "Asset is required"),
    receivingCurrency: z.string().min(1, "Currency is required"),
    pairPrice: z.string().min(1, "Price is required"),
    sellAmount: z.string().min(1, "Amount is required"),
    receiveAmount: z.string().min(1, "Total is required"),
});

type SellFormValues = z.infer<typeof sellSchema>;

const getLocalDateTimeInputValue = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

const fetchPairPriceFromBinance = async (
    base: string,
    quote: string,
): Promise<number | null> => {
    try {
        const symbol = `${base}${quote}`.toUpperCase();
        const response = await fetch(
            `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
        );
        if (!response.ok) return null;
        const payload = await response.json();
        const value = parseFloat(payload?.price);
        if (!Number.isFinite(value)) return null;
        return value;
    } catch (error) {
        console.error("Failed to fetch pair price", error);
        return null;
    }
};

const formatDecimal = (value: number, maxDecimals = 8): string => {
    if (!Number.isFinite(value)) return "";
    const rounded = Number(value.toFixed(maxDecimals));
    return rounded.toString();
};

export function SellFormComponent({ onSuccess }: { onSuccess: () => void }) {
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [availableAssets, setAvailableAssets] = React.useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const form = useForm<SellFormValues>({
        resolver: zodResolver(sellSchema),
        defaultValues: {
            date: getLocalDateTimeInputValue(),
            accountId: "",
            sellingAsset: "",
            receivingCurrency: "",
            pairPrice: "",
            sellAmount: "",
            receiveAmount: "",
            notes: "",
        },
    });

    // Load data and auto-select defaults
    React.useEffect(() => {
        const loadData = async () => {
            const accountsList = await db.accounts.toArray();
            setAccounts(accountsList);

            // Auto-select first account
            if (accountsList.length > 0 && accountsList[0].id) {
                form.setValue("accountId", String(accountsList[0].id));
            }

            const entries = await db.ledger.toArray();
            const uniqueTickers = [
                ...new Set(entries.map((e) => e.assetTicker)),
            ].sort();
            setAvailableAssets(uniqueTickers);

            // Auto-select first stablecoin as receiving currency
            const stablecoins = filterStablecoins(uniqueTickers);
            if (stablecoins.length > 0) {
                form.setValue("receivingCurrency", stablecoins[0]);
            }
        };
        loadData();
    }, [form]);

    // Auto-fetch price when assets change
    const sellingAsset = form.watch("sellingAsset");
    const receivingCurrency = form.watch("receivingCurrency");

    React.useEffect(() => {
        const fetchPrice = async () => {
            const base = sellingAsset?.trim().toUpperCase();
            const quote = receivingCurrency?.trim().toUpperCase();
            if (!base || !quote) return;

            // Try fetching price
            const price = await fetchPairPriceFromBinance(base, quote);
            if (price !== null) {
                form.setValue("pairPrice", formatDecimal(price));
            }
        };
        const timer = setTimeout(fetchPrice, 600);
        return () => clearTimeout(timer);
    }, [sellingAsset, receivingCurrency, form]);

    // Auto-calculate receive amount when sell amount or price changes
    const sellAmount = form.watch("sellAmount");
    const pairPrice = form.watch("pairPrice");

    React.useEffect(() => {
        const sell = parseFloat(sellAmount);
        const price = parseFloat(pairPrice);
        if (
            Number.isFinite(sell) &&
            Number.isFinite(price) &&
            sell > 0 &&
            price > 0
        ) {
            const receive = sell * price;
            form.setValue("receiveAmount", formatDecimal(receive, 2));
        }
    }, [sellAmount, pairPrice, form]);

    const onSubmit = async (data: SellFormValues) => {
        setIsSubmitting(true);
        try {
            const tradeDate = new Date(data.date);
            const sellAmt = parseFloat(data.sellAmount);
            const receiveAmt = parseFloat(data.receiveAmount);
            const price = parseFloat(data.pairPrice);
            const actualPrice = 1 / price; // Inverse price for sell

            const sellTicker = data.sellingAsset.trim().toUpperCase();
            const receiveTicker = data.receivingCurrency.trim().toUpperCase();

            await db.transaction("rw", db.trades, db.ledger, async () => {
                const tradeId = await db.trades.add({
                    type: "sell",
                    date: tradeDate,
                    notes: data.notes || "",
                    pair: `${sellTicker}/${receiveTicker}`,
                    pairPrice: price,
                    actualPrice: actualPrice, // Store inverse price
                });

                // Negative entry for selling asset
                await db.ledger.add({
                    tradeId: tradeId as number,
                    accountId: parseInt(data.accountId),
                    assetTicker: sellTicker,
                    amount: -sellAmt,
                    usdPriceAtTime: price,
                });

                // Positive entry for receiving asset
                await db.ledger.add({
                    tradeId: tradeId as number,
                    accountId: parseInt(data.accountId),
                    assetTicker: receiveTicker,
                    amount: receiveAmt,
                    usdPriceAtTime: isStablecoin(receiveTicker) ? 1 : undefined,
                });
            });

            form.reset();
            onSuccess();
        } catch (error) {
            console.error("Failed to save sell order", error);
            alert("Failed to save transaction");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Show pair info if both assets selected
    const showPairInfo = sellingAsset && receivingCurrency;

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <Label htmlFor="date">Date & Time</Label>
                    <Input
                        id="date"
                        type="datetime-local"
                        {...form.register("date")}
                    />
                    {form.formState.errors.date && (
                        <p className="text-xs text-red-500 mt-1">
                            {form.formState.errors.date.message}
                        </p>
                    )}
                </div>

                <div>
                    <Label htmlFor="accountId">Account</Label>
                    <Select
                        onValueChange={(v) => form.setValue("accountId", v)}
                        value={form.watch("accountId")}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts.map((acc) => (
                                <SelectItem key={acc.id} value={String(acc.id)}>
                                    {acc.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {form.formState.errors.accountId && (
                        <p className="text-xs text-red-500 mt-1">
                            {form.formState.errors.accountId.message}
                        </p>
                    )}
                </div>
            </div>

            <div className="border rounded-lg p-3 bg-red-50 dark:bg-red-950/20">
                <h3 className="font-semibold text-sm mb-3 text-red-700 dark:text-red-400">
                    Sell Order
                    {showPairInfo && (
                        <span className="ml-2 font-normal text-xs">
                            ({sellingAsset}/{receivingCurrency})
                        </span>
                    )}
                </h3>

                <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="sellAmount">Selling</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    id="sellAmount"
                                    type="number"
                                    step="any"
                                    placeholder="Amount"
                                    {...form.register("sellAmount")}
                                />
                                <AssetCombobox
                                    value={form.watch("sellingAsset")}
                                    onValueChange={(v: string) =>
                                        form.setValue("sellingAsset", v)
                                    }
                                    placeholder="Asset"
                                    assets={availableAssets}
                                />
                            </div>
                            {(form.formState.errors.sellAmount ||
                                form.formState.errors.sellingAsset) && (
                                <p className="text-xs text-red-500 mt-1">
                                    {form.formState.errors.sellAmount?.message ||
                                        form.formState.errors.sellingAsset?.message}
                                </p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor="receiveAmount">Receiving</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    id="receiveAmount"
                                    type="number"
                                    step="any"
                                    placeholder="Total"
                                    {...form.register("receiveAmount")}
                                />
                                <AssetCombobox
                                    value={form.watch("receivingCurrency")}
                                    onValueChange={(v: string) =>
                                        form.setValue("receivingCurrency", v)
                                    }
                                    placeholder="Currency"
                                    assets={availableAssets}
                                />
                            </div>
                            {(form.formState.errors.receiveAmount ||
                                form.formState.errors.receivingCurrency) && (
                                <p className="text-xs text-red-500 mt-1">
                                    {form.formState.errors.receiveAmount?.message ||
                                        form.formState.errors.receivingCurrency
                                            ?.message}
                                </p>
                            )}
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="pairPrice">
                            Price
                            {showPairInfo && (
                                <span className="ml-1 text-xs font-normal">
                                    ({receivingCurrency} per {sellingAsset})
                                </span>
                            )}
                        </Label>
                        <Input
                            id="pairPrice"
                            type="number"
                            step="any"
                            placeholder="0.00"
                            {...form.register("pairPrice")}
                        />
                        {form.formState.errors.pairPrice && (
                            <p className="text-xs text-red-500 mt-1">
                                {form.formState.errors.pairPrice.message}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                    id="notes"
                    placeholder="Optional notes..."
                    {...form.register("notes")}
                />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Sell Order"}
            </Button>
        </form>
    );
}
