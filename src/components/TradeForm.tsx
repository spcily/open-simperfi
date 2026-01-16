import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { db } from "@/lib/db";
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
  
  // Asset 2 (e.g., Bought / Incoming)
  assetInTicker: z.string().optional(),
  assetInAmount: z.string().optional(),
  assetInUsdPrice: z.string().optional(), // Price per unit in USD at time of transaction
  
  // Source / Main Wallet
  walletId: z.string().min(1, "Wallet is required"),

  // Destination Wallet (For Transfer)
  toWalletId: z.string().optional(),
}).refine((data) => {
    // If transfer, require dest wallet
    if (data.type === 'transfer') {
        return !!data.toWalletId;
    }
    return true;
}, {
    message: "Destination wallet is required for transfers",
    path: ["toWalletId"],
}).refine((data) => {
    // If transfer, source and dest wallet cannot be the same
    if (data.type === 'transfer') {
        return data.walletId !== data.toWalletId;
    }
    return true;
}, {
    message: "Cannot transfer to the same wallet",
    path: ["toWalletId"],
});

type TradeFormValues = z.infer<typeof tradeSchema>;

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

export function TradeForm({ onSuccess }: { onSuccess: () => void }) {
  const [wallets, setWallets] = React.useState<any[]>([]);

  React.useEffect(() => {
    db.wallets.toArray().then(setWallets);
  }, []);

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      type: "trade",
      date: getLocalDateTimeInputValue(),
      walletId: "",
      toWalletId: "",
    },
  });

  const transactionType = form.watch("type");

  const onSubmit = async (data: TradeFormValues) => {
    const walletId = parseInt(data.walletId);
    
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
            walletId,
            assetTicker: data.assetOutTicker.toUpperCase(),
            amount: -Math.abs(parseFloat(data.assetOutAmount)), // Negative
          });
        }
        // Incoming (Buying/swapping to)
        if (data.assetInTicker && data.assetInAmount) {
          await db.ledger.add({
            tradeId: tradeId as number,
            walletId,
            assetTicker: data.assetInTicker.toUpperCase(),
            amount: Math.abs(parseFloat(data.assetInAmount)), // Positive
            usdPriceAtTime: data.assetInUsdPrice ? parseFloat(data.assetInUsdPrice) : undefined,
          });
        }
      } else if (data.type === 'deposit') {
        if (data.assetInTicker && data.assetInAmount) {
           await db.ledger.add({
            tradeId: tradeId as number,
            walletId,
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
            walletId,
            assetTicker: data.assetOutTicker.toUpperCase(),
            amount: -Math.abs(parseFloat(data.assetOutAmount)),
          });
        }
      } else if (data.type === 'transfer') {
          // Transfer logic:
          // 1. Outgoing from Source Wallet
          // 2. Incoming to Dest Wallet
          // We can reuse assetOut or assetIn fields, let's use assetIn for "The Asset"
          if (data.assetInTicker && data.assetInAmount && data.toWalletId) {
             const amount = Math.abs(parseFloat(data.assetInAmount));
             const ticker = data.assetInTicker.toUpperCase();
             const toWalletId = parseInt(data.toWalletId);

             // Out from source
             await db.ledger.add({
                 tradeId: tradeId as number,
                 walletId: walletId,
                 assetTicker: ticker,
                 amount: -amount 
             });

             // In to dest
             await db.ledger.add({
                 tradeId: tradeId as number,
                 walletId: toWalletId,
                 assetTicker: ticker,
                 amount: amount
             });
          }
      }
    });

    form.reset({
      type: "trade",
      date: getLocalDateTimeInputValue(),
      walletId: "",
      toWalletId: "",
      assetOutTicker: "",
      assetOutAmount: "",
      assetInTicker: "",
      assetInAmount: "",
      assetInUsdPrice: "",
      notes: "",
    });
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
             {transactionType === 'transfer' ? 'From Wallet (Source)' : 'Wallet'}
         </Label>
         <select 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            {...form.register("walletId")}
         >
           <option value="" disabled>Select Wallet</option>
           {wallets.map(w => (
             <option key={w.id} value={w.id.toString()}>{w.name}</option>
           ))}
         </select>
         {form.formState.errors.walletId && <p className="text-red-500 text-sm">{form.formState.errors.walletId.message}</p>}
      </div>

      {transactionType === 'transfer' && (
          <div className="space-y-2">
            <Label>To Wallet (Destination)</Label>
            <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("toWalletId")}
            >
            <option value="" disabled>Select Destination Wallet</option>
            {wallets.map(w => (
                <option key={w.id} value={w.id.toString()}>{w.name}</option>
            ))}
            </select>
            {form.formState.errors.toWalletId && <p className="text-red-500 text-sm">{form.formState.errors.toWalletId.message}</p>}
          </div>
      )}

      {/* Outgoing Section: Show for Trade & Withdraw (But NOT Transfer) */}
      {(transactionType === 'trade' || transactionType === 'withdraw') && (
        <div className="border p-4 rounded-md bg-red-50/50">
          <Label className="text-red-600 font-semibold mb-2 block">Outgoing (Sell/Send)</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
               <Label>Asset Symbol</Label>
               <Input placeholder="USDT, BTC" {...form.register("assetOutTicker")} />
            </div>
            <div>
               <Label>Amount</Label>
               <Input type="number" step="any" placeholder="0.00" {...form.register("assetOutAmount")} />
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
               <Input type="number" step="any" placeholder="0.00" {...form.register("assetInAmount")} />
            </div>
            <div className="col-span-1">
               <Label>Price per Unit (USD)</Label>
               <Input type="number" step="any" placeholder="For Avg Cost" {...form.register("assetInUsdPrice")} />
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
