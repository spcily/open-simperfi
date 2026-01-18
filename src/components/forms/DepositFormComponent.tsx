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

const depositSchema = z.object({
  date: z.string(),
  notes: z.string().optional(),
  accountId: z.string().min(1, "Account is required"),
  assetTicker: z.string().min(1, "Asset is required"),
  amount: z.string().min(1, "Amount is required"),
  usdPrice: z.string().min(1, "Price is required"),
});

type DepositFormValues = z.infer<typeof depositSchema>;

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

export function DepositFormComponent({ onSuccess }: { onSuccess: () => void }) {
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

  const form = useForm<DepositFormValues>({
    resolver: zodResolver(depositSchema),
    defaultValues: {
      date: getLocalDateTimeInputValue(),
      accountId: "",
      assetTicker: "",
      amount: "",
      usdPrice: "",
      notes: "",
    },
  });

  // Auto-fetch price
  const assetTicker = form.watch("assetTicker");

  React.useEffect(() => {
    const fetchPrice = async () => {
      const ticker = assetTicker?.trim().toUpperCase();
      if (!ticker) return;
      try {
        const price = ticker === 'USDT' ? 1 : await fetchUsdPriceForSymbol(ticker);
        form.setValue('usdPrice', formatDecimal(price));
      } catch (error) {
        console.error('Failed to fetch price', error);
      }
    };
    const timer = setTimeout(fetchPrice, 600);
    return () => clearTimeout(timer);
  }, [assetTicker, form]);

  const onSubmit = async (data: DepositFormValues) => {
    setIsSubmitting(true);
    try {
      const tradeDate = new Date(data.date);
      const amount = parseFloat(data.amount);
      const price = parseFloat(data.usdPrice);

      await db.transaction('rw', db.trades, db.ledger, async () => {
        const tradeId = await db.trades.add({
          type: "deposit",
          date: tradeDate,
          notes: data.notes || "",
        });

        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.accountId),
          assetTicker: data.assetTicker.toUpperCase(),
          amount: amount,
          usdPriceAtTime: price,
        });
      });

      form.reset();
      onSuccess();
    } catch (error) {
      console.error('Failed to save deposit', error);
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

      <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
        <h3 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-400">Deposit Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="assetTicker">Asset</Label>
            <AssetCombobox
              value={form.watch("assetTicker")}
              onValueChange={(v: string) => form.setValue("assetTicker", v)}
              placeholder="e.g. BTC"
              assets={availableAssets}
            />
            {form.formState.errors.assetTicker && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assetTicker.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("amount")}
            />
            {form.formState.errors.amount && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.amount.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="usdPrice">Price (USD)</Label>
            <Input
              id="usdPrice"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("usdPrice")}
            />
            {form.formState.errors.usdPrice && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.usdPrice.message}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Optional notes..." {...form.register("notes")} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Deposit"}
      </Button>
    </form>
  );
}
