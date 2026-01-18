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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const tradeSchema = z.object({
  date: z.string(),
  notes: z.string().optional(),
  accountId: z.string().min(1, "Account is required"),
  assetOutTicker: z.string().min(1, "Asset sold is required"),
  assetOutAmount: z.string().min(1, "Amount is required"),
  assetOutUsdPrice: z.string().min(1, "Price is required"),
  assetInTicker: z.string().min(1, "Asset bought is required"),
  assetInAmount: z.string().min(1, "Amount is required"),
  assetInUsdPrice: z.string().min(1, "Price is required"),
});

type TradeFormValues = z.infer<typeof tradeSchema>;

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

const fetchUsdPriceForSymbol = async (ticker: string): Promise<number> => {
  const pair = `${ticker}USDT`;
  const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
  if (!response.ok) throw new Error('Failed to fetch live price');
  const payload = await response.json();
  const value = parseFloat(payload?.price);
  if (!Number.isFinite(value)) throw new Error('Received invalid price');
  return value;
};

const formatDecimal = (value: number, maxDecimals = 6): string => {
  if (!Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(maxDecimals));
  return rounded.toString();
};

export function TradeFormComponent({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [availableAssets, setAvailableAssets] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    db.accounts.toArray().then(setAccounts);
    db.ledger.toArray().then((entries) => {
      const uniqueTickers = [...new Set(entries.map(e => e.assetTicker))].sort();
      setAvailableAssets(uniqueTickers);
    });
  }, []);

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      date: getLocalDateTimeInputValue(),
      accountId: "",
      assetOutTicker: "",
      assetOutAmount: "",
      assetOutUsdPrice: "",
      assetInTicker: "",
      assetInAmount: "",
      assetInUsdPrice: "",
      notes: "",
    },
  });

  // Auto-fetch prices
  const assetOutTicker = form.watch("assetOutTicker");
  const assetInTicker = form.watch("assetInTicker");

  React.useEffect(() => {
    const fetchPrice = async () => {
      const ticker = assetOutTicker?.trim().toUpperCase();
      if (!ticker) return;
      try {
        const price = ticker === 'USDT' ? 1 : await fetchUsdPriceForSymbol(ticker);
        form.setValue('assetOutUsdPrice', formatDecimal(price));
      } catch (error) {
        console.error('Failed to fetch price', error);
      }
    };
    const timer = setTimeout(fetchPrice, 600);
    return () => clearTimeout(timer);
  }, [assetOutTicker, form]);

  React.useEffect(() => {
    const fetchPrice = async () => {
      const ticker = assetInTicker?.trim().toUpperCase();
      if (!ticker) return;
      try {
        const price = ticker === 'USDT' ? 1 : await fetchUsdPriceForSymbol(ticker);
        form.setValue('assetInUsdPrice', formatDecimal(price));
      } catch (error) {
        console.error('Failed to fetch price', error);
      }
    };
    const timer = setTimeout(fetchPrice, 600);
    return () => clearTimeout(timer);
  }, [assetInTicker, form]);

  const onSubmit = async (data: TradeFormValues) => {
    setIsSubmitting(true);
    try {
      const tradeDate = new Date(data.date);
      const outAmount = parseFloat(data.assetOutAmount);
      const outPrice = parseFloat(data.assetOutUsdPrice);
      const inAmount = parseFloat(data.assetInAmount);
      const inPrice = parseFloat(data.assetInUsdPrice);

      await db.transaction('rw', db.trades, db.ledger, async () => {
        const tradeId = await db.trades.add({
          type: "trade",
          date: tradeDate,
          notes: data.notes || "",
        });

        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.accountId),
          assetTicker: data.assetOutTicker.toUpperCase(),
          amount: -outAmount,
          usdPriceAtTime: outPrice,
        });

        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.accountId),
          assetTicker: data.assetInTicker.toUpperCase(),
          amount: inAmount,
          usdPriceAtTime: inPrice,
        });
      });

      form.reset();
      onSuccess();
    } catch (error) {
      console.error('Failed to save trade', error);
      alert('Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="date">Date & Time</Label>
        <Input
          id="date"
          type="datetime-local"
          {...form.register("date")}
        />
        {form.formState.errors.date && (
          <p className="text-xs text-red-500 mt-1">{form.formState.errors.date.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="accountId">Account</Label>
        <Select onValueChange={(v) => form.setValue("accountId", v)} value={form.watch("accountId")}>
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
          <p className="text-xs text-red-500 mt-1">{form.formState.errors.accountId.message}</p>
        )}
      </div>

      <div className="border rounded-lg p-3 bg-red-50 dark:bg-red-950/20">
        <h3 className="font-semibold text-sm mb-3 text-red-700 dark:text-red-400">Sold / Outgoing</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="assetOutTicker">Asset</Label>
            <AssetCombobox
              value={form.watch("assetOutTicker")}
              onValueChange={(v: string) => form.setValue("assetOutTicker", v)}
              placeholder="e.g. BTC"
              assets={availableAssets}
            />
            {form.formState.errors.assetOutTicker && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assetOutTicker.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="assetOutAmount">Amount</Label>
            <Input
              id="assetOutAmount"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("assetOutAmount")}
            />
            {form.formState.errors.assetOutAmount && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assetOutAmount.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="assetOutUsdPrice">Price (USD)</Label>
            <Input
              id="assetOutUsdPrice"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("assetOutUsdPrice")}
            />
            {form.formState.errors.assetOutUsdPrice && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assetOutUsdPrice.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
        <h3 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-400">Bought / Incoming</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="assetInTicker">Asset</Label>
            <AssetCombobox
              value={form.watch("assetInTicker")}
              onValueChange={(v: string) => form.setValue("assetInTicker", v)}
              placeholder="e.g. ETH"
              assets={availableAssets}
            />
            {form.formState.errors.assetInTicker && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assetInTicker.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="assetInAmount">Amount</Label>
            <Input
              id="assetInAmount"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("assetInAmount")}
            />
            {form.formState.errors.assetInAmount && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assetInAmount.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="assetInUsdPrice">Price (USD)</Label>
            <Input
              id="assetInUsdPrice"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("assetInUsdPrice")}
            />
            {form.formState.errors.assetInUsdPrice && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assetInUsdPrice.message}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Optional notes..." {...form.register("notes")} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Trade"}
      </Button>
    </form>
  );
}
