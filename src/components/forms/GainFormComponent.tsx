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

const gainSchema = z.object({
  date: z.string(),
  notes: z.string().optional(),
  accountId: z.string().min(1, "Account is required"),
  asset: z.string().min(1, "Asset is required"),
  amount: z.string().min(1, "Amount is required"),
  usdPrice: z.string().optional(),
});

type GainFormValues = z.infer<typeof gainSchema>;

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

const fetchPriceFromBinance = async (ticker: string): Promise<number | null> => {
  try {
    const symbol = `${ticker}USDT`.toUpperCase();
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const value = parseFloat(payload?.price);
    if (!Number.isFinite(value)) return null;
    return value;
  } catch (error) {
    console.error('Failed to fetch price', error);
    return null;
  }
};

export function GainFormComponent({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [availableAssets, setAvailableAssets] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<GainFormValues>({
    resolver: zodResolver(gainSchema),
    defaultValues: {
      date: getLocalDateTimeInputValue(),
      accountId: "",
      asset: "",
      amount: "",
      usdPrice: "",
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
    };
    loadData();
  }, [form]);

  // Auto-fetch price when asset changes
  const asset = form.watch("asset");
  
  React.useEffect(() => {
    const fetchPrice = async () => {
      const ticker = asset?.trim().toUpperCase();
      if (!ticker) return;
      
      const price = await fetchPriceFromBinance(ticker);
      if (price !== null) {
        form.setValue('usdPrice', price.toString());
      }
    };
    const timer = setTimeout(fetchPrice, 600);
    return () => clearTimeout(timer);
  }, [asset, form]);

  const onSubmit = async (data: GainFormValues) => {
    setIsSubmitting(true);
    try {
      const tradeDate = new Date(data.date);
      const amount = parseFloat(data.amount);
      const usdPrice = data.usdPrice ? parseFloat(data.usdPrice) : undefined;
      const ticker = data.asset.trim().toUpperCase();

      await db.transaction('rw', db.trades, db.ledger, async () => {
        const tradeId = await db.trades.add({
          type: "gain",
          date: tradeDate,
          notes: data.notes || "",
        });

        // Positive entry for gained asset (cost basis = 0, but record market price)
        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.accountId),
          assetTicker: ticker,
          amount: amount,
          usdPriceAtTime: usdPrice, // Record price but won't affect avg buy price
        });
      });

      form.reset();
      onSuccess();
    } catch (error) {
      console.error('Failed to save gain transaction', error);
      alert('Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          Gain Transaction
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Record gains from airdrops, perp wins, staking rewards, or predictions. These won't affect your average buy price.
        </p>
        
        <div className="space-y-3">
          <div>
            <Label>Asset Received</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="any"
                placeholder="Amount"
                {...form.register("amount")}
              />
              <AssetCombobox
                value={form.watch("asset")}
                onValueChange={(v: string) => form.setValue("asset", v)}
                placeholder="Asset"
                assets={availableAssets}
              />
            </div>
            {(form.formState.errors.amount || form.formState.errors.asset) && (
              <p className="text-xs text-red-500 mt-1">
                {form.formState.errors.amount?.message || form.formState.errors.asset?.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="usdPrice">USD Price at Time (Optional)</Label>
            <Input
              id="usdPrice"
              type="number"
              step="any"
              placeholder="0.00"
              {...form.register("usdPrice")}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Auto-fetched from Binance. Used for historical records only.
            </p>
            {form.formState.errors.usdPrice && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.usdPrice.message}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea 
          id="notes" 
          placeholder="e.g., Airdrop from XYZ protocol, Perp win on BTC long, Staking rewards..." 
          {...form.register("notes")} 
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Record Gain"}
      </Button>
    </form>
  );
}
