import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { db, Account } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const tradeSchema = z.object({
  type: z.enum(["trade", "deposit", "withdraw", "transfer"]),
  date: z.string(), // HTML date input returns string
  notes: z.string().optional(),
  
  // Asset 1 (e.g., Sold / Outgoing)
  assetOutTicker: z.string().optional(),
  assetOutAmount: z.string().optional(), // Using string for easy input, parse later
  assetOutUsdPrice: z.string().optional(),
  
  // Asset 2 (e.g., Bought / Incoming)
  assetInTicker: z.string().optional(),
  assetInAmount: z.string().optional(),
  assetInUsdPrice: z.string().optional(), // Price per unit in USD at time of transaction
  
    // Source / Main Account
    accountId: z.string().min(1, "Account is required"),

    // Destination Account (For Transfer)
  toAccountId: z.string().optional(),
}).refine((data) => {
    // If transfer, require dest account
    if (data.type === 'transfer') {
        return !!data.toAccountId;
    }
    return true;
}, {
    message: "Destination account is required for transfers",
    path: ["toAccountId"],
}).refine((data) => {
    // If transfer, source and dest account cannot be the same
    if (data.type === 'transfer') {
        return data.accountId !== data.toAccountId;
    }
    return true;
}, {
    message: "Cannot transfer to the same account",
    path: ["toAccountId"],
});

type AutoPriceStatus = 'idle' | 'loading' | 'success' | 'error';

const AUTO_PRICE_DEBOUNCE_MS = 600;

const fetchUsdPriceForSymbol = async (ticker: string): Promise<number> => {
  const pair = `${ticker}USDT`;
  const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
  if (!response.ok) {
    throw new Error('Failed to fetch live price');
  }
  const payload = await response.json();
  const value = parseFloat(payload?.price);
  if (!Number.isFinite(value)) {
    throw new Error('Received invalid price');
  }
  return value;
};

const formatDecimal = (value: number, maxDecimals = 6): string => {
  if (!Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(maxDecimals));
  return rounded.toString();
};

type TradeFormValues = z.infer<typeof tradeSchema>;

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

export function TradeForm({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);

  React.useEffect(() => {
    db.accounts.toArray().then(setAccounts);
  }, []);

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      type: "trade",
      date: getLocalDateTimeInputValue(),
      accountId: "",
      toAccountId: "",
      assetOutTicker: "",
      assetOutAmount: "",
      assetOutUsdPrice: "",
      assetInTicker: "",
      assetInAmount: "",
      assetInUsdPrice: "",
      notes: "",
    },
  });

  const transactionType = form.watch("type");
  const assetInTickerValue = form.watch("assetInTicker");
  const assetOutTickerValue = form.watch("assetOutTicker");
  const assetInUsdPriceValue = form.watch("assetInUsdPrice");
  const assetOutUsdPriceValue = form.watch("assetOutUsdPrice");
  const normalizedAssetInTicker = (assetInTickerValue || '').trim().toUpperCase();
  const normalizedAssetOutTicker = (assetOutTickerValue || '').trim().toUpperCase();
  const [inAutoPriceStatus, setInAutoPriceStatus] = React.useState<AutoPriceStatus>('idle');
  const [inAutoPriceTicker, setInAutoPriceTicker] = React.useState<string | null>(null);
  const [outAutoPriceStatus, setOutAutoPriceStatus] = React.useState<AutoPriceStatus>('idle');
  const [outAutoPriceTicker, setOutAutoPriceTicker] = React.useState<string | null>(null);
  const [inPriceManuallyEdited, setInPriceManuallyEdited] = React.useState(false);
  const [outPriceManuallyEdited, setOutPriceManuallyEdited] = React.useState(false);
  const [inPriceFetchBlockedTicker, setInPriceFetchBlockedTicker] = React.useState<string | null>(null);
  const [outPriceFetchBlockedTicker, setOutPriceFetchBlockedTicker] = React.useState<string | null>(null);
  const inTickerRef = React.useRef<string>('');
  const outTickerRef = React.useRef<string>('');
  const lastAmountEditedRef = React.useRef<'in' | 'out' | null>(null);
  const previousPricesRef = React.useRef<{ in: string; out: string }>({ in: '', out: '' });

  React.useEffect(() => {
    if (inTickerRef.current !== normalizedAssetInTicker) {
      setInPriceManuallyEdited(false);
      setInPriceFetchBlockedTicker(null);
      inTickerRef.current = normalizedAssetInTicker;
    }
  }, [normalizedAssetInTicker]);

  React.useEffect(() => {
    if (outTickerRef.current !== normalizedAssetOutTicker) {
      setOutPriceManuallyEdited(false);
      setOutPriceFetchBlockedTicker(null);
      outTickerRef.current = normalizedAssetOutTicker;
    }
  }, [normalizedAssetOutTicker]);

  React.useEffect(() => {
    setInPriceManuallyEdited(false);
    setOutPriceManuallyEdited(false);
    lastAmountEditedRef.current = null;
    previousPricesRef.current = { in: '', out: '' };
    setInPriceFetchBlockedTicker(null);
    setOutPriceFetchBlockedTicker(null);
  }, [transactionType]);

  React.useEffect(() => {
    const priceFieldVisible = transactionType === 'trade' || transactionType === 'deposit';
    if (!priceFieldVisible || !normalizedAssetInTicker) {
      setInAutoPriceStatus('idle');
      setInAutoPriceTicker(null);
      return;
    }

    if ((inAutoPriceTicker === normalizedAssetInTicker && inAutoPriceStatus === 'success') ||
        (inPriceManuallyEdited && inAutoPriceTicker === normalizedAssetInTicker) ||
        (inPriceFetchBlockedTicker === normalizedAssetInTicker)) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setInAutoPriceStatus('loading');
        const livePrice = normalizedAssetInTicker === 'USDT'
          ? 1
          : await fetchUsdPriceForSymbol(normalizedAssetInTicker);
        if (cancelled) return;
        setInAutoPriceTicker(normalizedAssetInTicker);
        setInAutoPriceStatus('success');
        form.setValue('assetInUsdPrice', formatDecimal(livePrice), { shouldDirty: true });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to fetch live price', error);
        setInAutoPriceStatus('error');
        setInPriceFetchBlockedTicker(normalizedAssetInTicker);
      }
    }, AUTO_PRICE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    normalizedAssetInTicker,
    transactionType,
    inPriceManuallyEdited,
    inPriceFetchBlockedTicker,
    inAutoPriceTicker,
    inAutoPriceStatus,
    form,
  ]);

  React.useEffect(() => {
    const priceFieldVisible = transactionType === 'trade' || transactionType === 'withdraw';
    if (!priceFieldVisible || !normalizedAssetOutTicker) {
      setOutAutoPriceStatus('idle');
      setOutAutoPriceTicker(null);
      return;
    }

    if ((outAutoPriceTicker === normalizedAssetOutTicker && outAutoPriceStatus === 'success') ||
        (outPriceManuallyEdited && outAutoPriceTicker === normalizedAssetOutTicker) ||
        (outPriceFetchBlockedTicker === normalizedAssetOutTicker)) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setOutAutoPriceStatus('loading');
        const livePrice = normalizedAssetOutTicker === 'USDT'
          ? 1
          : await fetchUsdPriceForSymbol(normalizedAssetOutTicker);
        if (cancelled) return;
        setOutAutoPriceTicker(normalizedAssetOutTicker);
        setOutAutoPriceStatus('success');
        form.setValue('assetOutUsdPrice', formatDecimal(livePrice), { shouldDirty: true });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to fetch live price', error);
        setOutAutoPriceStatus('error');
        setOutPriceFetchBlockedTicker(normalizedAssetOutTicker);
      }
    }, AUTO_PRICE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    normalizedAssetOutTicker,
    transactionType,
    outPriceManuallyEdited,
    outPriceFetchBlockedTicker,
    outAutoPriceTicker,
    outAutoPriceStatus,
    form,
  ]);

  React.useEffect(() => {
    if (transactionType !== 'trade') {
      previousPricesRef.current = {
        in: assetInUsdPriceValue || '',
        out: assetOutUsdPriceValue || '',
      };
      return;
    }

    const prev = previousPricesRef.current;
    const currentIn = assetInUsdPriceValue || '';
    const currentOut = assetOutUsdPriceValue || '';
    const inChanged = prev.in !== currentIn;
    const outChanged = prev.out !== currentOut;
    if (!inChanged && !outChanged) {
      return;
    }

    previousPricesRef.current = { in: currentIn, out: currentOut };

    const priceIn = parseFloat(currentIn);
    const priceOut = parseFloat(currentOut);
    if (!Number.isFinite(priceIn) || priceIn <= 0) return;
    if (!Number.isFinite(priceOut) || priceOut <= 0) return;

    const basis = lastAmountEditedRef.current;
    if (!basis) return;

    if (basis === 'out') {
      const amountOut = parseFloat(form.getValues('assetOutAmount') || '');
      if (!Number.isFinite(amountOut) || amountOut <= 0) return;
      const derivedIn = (Math.abs(amountOut) * priceOut) / priceIn;
      if (!Number.isFinite(derivedIn) || derivedIn <= 0) return;
      form.setValue('assetInAmount', formatDecimal(derivedIn), { shouldDirty: true });
    } else if (basis === 'in') {
      const amountIn = parseFloat(form.getValues('assetInAmount') || '');
      if (!Number.isFinite(amountIn) || amountIn <= 0) return;
      const derivedOut = (Math.abs(amountIn) * priceIn) / priceOut;
      if (!Number.isFinite(derivedOut) || derivedOut <= 0) return;
      form.setValue('assetOutAmount', formatDecimal(derivedOut), { shouldDirty: true });
    }
  }, [
    transactionType,
    assetInUsdPriceValue,
    assetOutUsdPriceValue,
    form,
  ]);

  const buyPriceHelperText = React.useMemo(() => {
    const priceFieldVisible = transactionType === 'trade' || transactionType === 'deposit';
    if (!priceFieldVisible) return null;
    if (!normalizedAssetInTicker) return 'Enter a ticker to auto-fill the live price.';
    if (inAutoPriceStatus === 'loading') return `Fetching ${normalizedAssetInTicker} price...`;
    if (inAutoPriceStatus === 'error') return 'Live price unavailable right now. Enter your own value.';
    if (inAutoPriceStatus === 'success' && inAutoPriceTicker) {
      return `Fetched live price for ${inAutoPriceTicker}. Adjust if needed.`;
    }
    return null;
  }, [transactionType, normalizedAssetInTicker, inAutoPriceStatus, inAutoPriceTicker]);

  const sellPriceHelperText = React.useMemo(() => {
    const priceFieldVisible = transactionType === 'trade' || transactionType === 'withdraw';
    if (!priceFieldVisible) return null;
    if (!normalizedAssetOutTicker) return 'Enter a ticker to auto-fill the live price.';
    if (outAutoPriceStatus === 'loading') return `Fetching ${normalizedAssetOutTicker} price...`;
    if (outAutoPriceStatus === 'error') return 'Live price unavailable right now. Enter your own value.';
    if (outAutoPriceStatus === 'success' && outAutoPriceTicker) {
      return `Fetched live price for ${outAutoPriceTicker}. Adjust if needed.`;
    }
    return null;
  }, [transactionType, normalizedAssetOutTicker, outAutoPriceStatus, outAutoPriceTicker]);

  const onSubmit = async (data: TradeFormValues) => {
    const accountId = parseInt(data.accountId);
    
    await db.transaction('rw', db.trades, db.ledger, async () => {
      // 1. Create Parent Trade
      const tradeId = await db.trades.add({
        date: new Date(data.date),
        type: data.type,
        notes: data.notes,
      });

      // 2. Create Ledger Entries
      if (data.type === 'trade') {
        // Outgoing (Selling/swapping from)
        if (data.assetOutTicker && data.assetOutAmount) {
          await db.ledger.add({
            tradeId: tradeId as number,
            accountId,
            assetTicker: data.assetOutTicker.toUpperCase(),
            amount: -Math.abs(parseFloat(data.assetOutAmount)), // Negative
            usdPriceAtTime: data.assetOutUsdPrice ? parseFloat(data.assetOutUsdPrice) : undefined,
          });
        }
        // Incoming (Buying/swapping to)
        if (data.assetInTicker && data.assetInAmount) {
          await db.ledger.add({
            tradeId: tradeId as number,
            accountId,
            assetTicker: data.assetInTicker.toUpperCase(),
            amount: Math.abs(parseFloat(data.assetInAmount)), // Positive
            usdPriceAtTime: data.assetInUsdPrice ? parseFloat(data.assetInUsdPrice) : undefined,
          });
        }
      } else if (data.type === 'deposit') {
        if (data.assetInTicker && data.assetInAmount) {
           await db.ledger.add({
            tradeId: tradeId as number,
            accountId,
            assetTicker: data.assetInTicker.toUpperCase(),
            amount: Math.abs(parseFloat(data.assetInAmount)),
            // Deposits usually might not set cost basis, but we can allow it if user wants to set initial price
             usdPriceAtTime: data.assetInUsdPrice ? parseFloat(data.assetInUsdPrice) : undefined,
          });
        }
      } else if (data.type === 'withdraw') {
         if (data.assetOutTicker && data.assetOutAmount) {
           await db.ledger.add({
            tradeId: tradeId as number,
            accountId,
            assetTicker: data.assetOutTicker.toUpperCase(),
            amount: -Math.abs(parseFloat(data.assetOutAmount)),
            usdPriceAtTime: data.assetOutUsdPrice ? parseFloat(data.assetOutUsdPrice) : undefined,
          });
        }
      } else if (data.type === 'transfer') {
          // Transfer logic:
          // 1. Outgoing from Source Account
          // 2. Incoming to Destination Account
          // We can reuse assetOut or assetIn fields, let's use assetIn for "The Asset"
            if (data.assetInTicker && data.assetInAmount && data.toAccountId) {
             const amount = Math.abs(parseFloat(data.assetInAmount));
             const ticker = data.assetInTicker.toUpperCase();
             const toAccountId = parseInt(data.toAccountId);

             // Out from source
             await db.ledger.add({
                 tradeId: tradeId as number,
               accountId,
                 assetTicker: ticker,
                 amount: -amount 
             });

             // In to dest
             await db.ledger.add({
                 tradeId: tradeId as number,
               accountId: toAccountId,
                 assetTicker: ticker,
                 amount: amount
             });
          }
      }
    });

    form.reset({
      type: "trade",
      date: getLocalDateTimeInputValue(),
          accountId: "",
          toAccountId: "",
      assetOutTicker: "",
      assetOutAmount: "",
      assetOutUsdPrice: "",
      assetInTicker: "",
      assetInAmount: "",
      assetInUsdPrice: "",
      notes: "",
    });
    setInPriceManuallyEdited(false);
    setOutPriceManuallyEdited(false);
    lastAmountEditedRef.current = null;
    previousPricesRef.current = { in: '', out: '' };
    onSuccess();
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
            <Label>Date & Time</Label>
            <Input type="datetime-local" step="60" {...form.register("date")} />
        </div>
        <div>
          <Label>Type</Label>
          <select 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            {...form.register("type")}
          >
            <option value="trade">Trade (Swap)</option>
            <option value="deposit">Deposit (In)</option>
            <option value="withdraw">Withdraw (Out)</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
         <Label>
           {transactionType === 'transfer' ? 'From Account (Source)' : 'Account'}
         </Label>
         <select 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            {...form.register("accountId")}
         >
           <option value="" disabled>Select Account</option>
           {accounts.map((account) =>
             account.id ? (
               <option key={account.id} value={account.id.toString()}>
                 {account.name}
               </option>
             ) : null
           )}
         </select>
         {form.formState.errors.accountId && <p className="text-red-500 text-sm">{form.formState.errors.accountId.message}</p>}
      </div>

      {transactionType === 'transfer' && (
          <div className="space-y-2">
            <Label>To Account (Destination)</Label>
            <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("toAccountId")}
            >
            <option value="" disabled>Select Destination Account</option>
            {accounts.map((account) =>
              account.id ? (
                <option key={account.id} value={account.id.toString()}>
                  {account.name}
                </option>
              ) : null
            )}
            </select>
            {form.formState.errors.toAccountId && <p className="text-red-500 text-sm">{form.formState.errors.toAccountId.message}</p>}
          </div>
      )}

      {/* Outgoing Section: Show for Trade & Withdraw (But NOT Transfer) */}
      {(transactionType === 'trade' || transactionType === 'withdraw') && (
        <div className="border p-4 rounded-md bg-red-50/50">
          <Label className="text-red-600 font-semibold mb-2 block">Outgoing (Sell/Send)</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
               <Label>Asset Symbol</Label>
               <Input placeholder="USDT, BTC" {...form.register("assetOutTicker")} />
            </div>
            <div>
               <Label>Amount</Label>
               <Input
                 type="number"
                 step="any"
                 placeholder="0.00"
                 {...form.register("assetOutAmount", {
                   onChange: () => {
                     lastAmountEditedRef.current = 'out';
                   },
                 })}
               />
            </div>
            <div>
              <Label>Price per Unit (USD)</Label>
              <Input
                type="number"
                step="any"
                placeholder="For Value"
                {...form.register("assetOutUsdPrice", {
                  onChange: () => {
                    setOutPriceManuallyEdited(true);
                    previousPricesRef.current = {
                      in: previousPricesRef.current.in,
                      out: '',
                    };
                  },
                })}
              />
              {sellPriceHelperText && (
                <p className="text-xs text-muted-foreground mt-1">{sellPriceHelperText}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Incoming Section: Show for Trade & Deposit */}
      {(transactionType === 'trade' || transactionType === 'deposit') && (
        <div className="border p-4 rounded-md bg-green-50/50">
          <Label className="text-green-600 font-semibold mb-2 block">Incoming (Buy/Receive)</Label>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
               <Label>Asset Symbol</Label>
               <Input placeholder="BTC, ETH" {...form.register("assetInTicker")} />
            </div>
            <div className="col-span-1">
               <Label>Amount</Label>
               <Input
                 type="number"
                 step="any"
                 placeholder="0.00"
                 {...form.register("assetInAmount", {
                   onChange: () => {
                     lastAmountEditedRef.current = 'in';
                   },
                 })}
               />
            </div>
            <div className="col-span-1">
               <Label>Price per Unit (USD)</Label>
               <Input
                 type="number"
                 step="any"
                 placeholder="For Avg Cost"
                 {...form.register("assetInUsdPrice", {
                   onChange: () => {
                     setInPriceManuallyEdited(true);
                     setOutPriceManuallyEdited(false);
                     previousPricesRef.current = {
                       in: '',
                       out: previousPricesRef.current.out,
                     };
                   },
                 })}
               />
               {buyPriceHelperText && (
                 <p className="text-xs text-muted-foreground mt-1">{buyPriceHelperText}</p>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Transfer Section: Reusing Incoming fields logic visually? No, lets make a clean one */}
      {transactionType === 'transfer' && (
         <div className="border p-4 rounded-md bg-blue-50/50">
         <Label className="text-blue-600 font-semibold mb-2 block">Asset to Transfer</Label>
         <div className="grid grid-cols-2 gap-2">
           <div>
              <Label>Asset Symbol</Label>
              <Input placeholder="BTC" {...form.register("assetInTicker")} />
           </div>
           <div>
              <Label>Amount</Label>
              <Input type="number" step="any" placeholder="0.00" {...form.register("assetInAmount")} />
           </div>
         </div>
       </div> 
      )}

      <div>
        <Label>Notes</Label>
        <Textarea {...form.register("notes")} />
      </div>

      <Button type="submit" className="w-full">Save Transaction</Button>
    </form>
  );
}
