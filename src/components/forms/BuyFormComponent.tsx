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
import { filterStablecoins, isStablecoin } from "@/lib/stablecoins";

const buySchema = z.object({
  date: z.string(),
  notes: z.string().optional(),
  accountId: z.string().min(1, "Account is required"),
  buyingAsset: z.string().min(1, "Asset is required"),
  payingWith: z.string().min(1, "Currency is required"),
  pairPrice: z.string().min(1, "Price is required"),
  buyAmount: z.string().min(1, "Amount is required"),
  payAmount: z.string().min(1, "Total is required"),
});

type BuyFormValues = z.infer<typeof buySchema>;

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

const fetchPairPriceFromBinance = async (base: string, quote: string): Promise<number | null> => {
  try {
    const symbol = `${base}${quote}`.toUpperCase();
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const value = parseFloat(payload?.price);
    if (!Number.isFinite(value)) return null;
    return value;
  } catch (error) {
    console.error('Failed to fetch pair price', error);
    return null;
  }
};

const formatDecimal = (value: number, maxDecimals = 8): string => {
  if (!Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(maxDecimals));
  return rounded.toString();
};

export function BuyFormComponent({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [availableAssets, setAvailableAssets] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<BuyFormValues>({
    resolver: zodResolver(buySchema),
    defaultValues: {
      date: getLocalDateTimeInputValue(),
      accountId: "",
      buyingAsset: "",
      payingWith: "",
      pairPrice: "",
      buyAmount: "",
      payAmount: "",
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
        form.setValue('accountId', String(accountsList[0].id));
      }

      const entries = await db.ledger.toArray();
      const uniqueTickers = [...new Set(entries.map(e => e.assetTicker))].sort();
      setAvailableAssets(uniqueTickers);
      
      // Auto-select first stablecoin as paying currency
      const stablecoins = filterStablecoins(uniqueTickers);
      if (stablecoins.length > 0) {
        form.setValue('payingWith', stablecoins[0]);
      }
    };
    loadData();
  }, [form]);

  // Auto-fetch price when assets change
  const buyingAsset = form.watch("buyingAsset");
  const payingWith = form.watch("payingWith");
  
  React.useEffect(() => {
    const fetchPrice = async () => {
      const base = buyingAsset?.trim().toUpperCase();
      const quote = payingWith?.trim().toUpperCase();
      if (!base || !quote) return;
      
      const price = await fetchPairPriceFromBinance(base, quote);
      if (price !== null) {
        form.setValue('pairPrice', formatDecimal(price));
      }
    };
    const timer = setTimeout(fetchPrice, 600);
    return () => clearTimeout(timer);
  }, [buyingAsset, payingWith, form]);

  // Auto-calculate pay amount when buy amount or price changes
  const buyAmount = form.watch("buyAmount");
  const pairPrice = form.watch("pairPrice");

  React.useEffect(() => {
    const buy = parseFloat(buyAmount);
    const price = parseFloat(pairPrice);
    if (Number.isFinite(buy) && Number.isFinite(price) && buy > 0 && price > 0) {
      const pay = buy * price;
      form.setValue('payAmount', formatDecimal(pay, 2));
    }
  }, [buyAmount, pairPrice, form]);

  const onSubmit = async (data: BuyFormValues) => {
    setIsSubmitting(true);
    try {
      const tradeDate = new Date(data.date);
      const buyAmt = parseFloat(data.buyAmount);
      const payAmt = parseFloat(data.payAmount);
      const price = parseFloat(data.pairPrice);

      const buyTicker = data.buyingAsset.trim().toUpperCase();
      const payTicker = data.payingWith.trim().toUpperCase();

      await db.transaction('rw', db.trades, db.ledger, async () => {
        const tradeId = await db.trades.add({
          type: "buy",
          date: tradeDate,
          notes: data.notes || "",
          pair: `${buyTicker}/${payTicker}`,
          pairPrice: price,
        });

        // Positive entry for buying asset
        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.accountId),
          assetTicker: buyTicker,
          amount: buyAmt,
          usdPriceAtTime: price,
        });

        // Negative entry for paying asset
        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.accountId),
          assetTicker: payTicker,
          amount: -payAmt,
          usdPriceAtTime: isStablecoin(payTicker) ? 1 : undefined,
        });
      });

      form.reset();
      onSuccess();
    } catch (error) {
      console.error('Failed to save buy order', error);
      alert('Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show pair info if both assets selected
  const showPairInfo = buyingAsset && payingWith;

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
      </div>

      <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
        <h3 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-400">
          Buy Order
          {showPairInfo && <span className="ml-2 font-normal text-xs">({buyingAsset}/{payingWith})</span>}
        </h3>
        
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Buying</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="any"
                  placeholder="Amount"
                  {...form.register("buyAmount")}
                />
                <AssetCombobox
                  value={form.watch("buyingAsset")}
                  onValueChange={(v: string) => form.setValue("buyingAsset", v)}
                  placeholder="Asset"
                  assets={availableAssets}
                />
              </div>
              {(form.formState.errors.buyAmount || form.formState.errors.buyingAsset) && (
                <p className="text-xs text-red-500 mt-1">
                  {form.formState.errors.buyAmount?.message || form.formState.errors.buyingAsset?.message}
                </p>
              )}
            </div>

            <div>
              <Label>Paying</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="any"
                  placeholder="Total"
                  {...form.register("payAmount")}
                />
                <AssetCombobox
                  value={form.watch("payingWith")}
                  onValueChange={(v: string) => form.setValue("payingWith", v)}
                  placeholder="Currency"
                  assets={availableAssets}
                />
              </div>
              {(form.formState.errors.payAmount || form.formState.errors.payingWith) && (
                <p className="text-xs text-red-500 mt-1">
                  {form.formState.errors.payAmount?.message || form.formState.errors.payingWith?.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="pairPrice">
              Price
              {showPairInfo && <span className="ml-1 text-xs font-normal">({payingWith} per {buyingAsset})</span>}
            </Label>
            <Input
              id="pairPrice"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("pairPrice")}
            />
            {form.formState.errors.pairPrice && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.pairPrice.message}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Optional notes..." {...form.register("notes")} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Buy Order"}
      </Button>
    </form>
  );
}
