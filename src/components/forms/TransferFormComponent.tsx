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

const transferSchema = z.object({
  date: z.string(),
  notes: z.string().optional(),
  accountId: z.string().min(1, "Source account is required"),
  toAccountId: z.string().min(1, "Destination account is required"),
  assetTicker: z.string().min(1, "Asset is required"),
  amount: z.string().min(1, "Amount is required"),
}).refine((data) => data.accountId !== data.toAccountId, {
  message: "Source and destination accounts must be different",
  path: ["toAccountId"],
});

type TransferFormValues = z.infer<typeof transferSchema>;

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

export function TransferFormComponent({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [availableAssets, setAvailableAssets] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      date: getLocalDateTimeInputValue(),
      accountId: "",
      toAccountId: "",
      assetTicker: "",
      amount: "",
      notes: "",
    },
  });

  // Load data and auto-select first account as source
  React.useEffect(() => {
    const loadData = async () => {
      const accountsList = await db.accounts.toArray();
      setAccounts(accountsList);

      // Auto-select first account for "From Account"
      if (accountsList.length > 0 && accountsList[0].id) {
        form.setValue("accountId", String(accountsList[0].id));
      }

      const entries = await db.ledger.toArray();
      const uniqueTickers = [...new Set(entries.map(e => e.assetTicker))].sort();
      setAvailableAssets(uniqueTickers);
    };
    loadData();
  }, [form]);

  const onSubmit = async (data: TransferFormValues) => {
    setIsSubmitting(true);
    try {
      const tradeDate = new Date(data.date);
      const amount = parseFloat(data.amount);

      await db.transaction('rw', db.trades, db.ledger, async () => {
        const tradeId = await db.trades.add({
          type: "transfer",
          date: tradeDate,
          notes: data.notes || "",
        });

        // Negative ledger entry for source account
        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.accountId),
          assetTicker: data.assetTicker.toUpperCase(),
          amount: -amount,
        });

        // Positive ledger entry for destination account
        await db.ledger.add({
          tradeId: tradeId as number,
          accountId: parseInt(data.toAccountId),
          assetTicker: data.assetTicker.toUpperCase(),
          amount: amount,
        });
      });

      form.reset();
      onSuccess();
    } catch (error) {
      console.error('Failed to save transfer', error);
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

      <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20">
        <h3 className="font-semibold text-sm mb-3 text-blue-700 dark:text-blue-400">Transfer Details</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <Label htmlFor="accountId">From Account</Label>
            <Select onValueChange={(v) => form.setValue("accountId", v)} value={form.watch("accountId")}>
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
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

          <div>
            <Label htmlFor="toAccountId">To Account</Label>
            <Select onValueChange={(v) => form.setValue("toAccountId", v)} value={form.watch("toAccountId")}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={String(acc.id)}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.toAccountId && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.toAccountId.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="amount">Transferring</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              id="amount"
              type="number"
              step="any"
              placeholder="Amount"
              {...form.register("amount")}
            />
            <AssetCombobox
              value={form.watch("assetTicker")}
              onValueChange={(v: string) => form.setValue("assetTicker", v)}
              placeholder="Asset"
              assets={availableAssets}
            />
          </div>
          {(form.formState.errors.amount || form.formState.errors.assetTicker) && (
            <p className="text-xs text-red-500 mt-1">
              {form.formState.errors.amount?.message || form.formState.errors.assetTicker?.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Optional notes..." {...form.register("notes")} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Transfer"}
      </Button>
    </form>
  );
}
