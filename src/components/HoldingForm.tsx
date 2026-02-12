import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db, Holding, Account } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const holdingSchema = z.object({
  ticker: z.string().min(1, 'Ticker is required').toUpperCase(),
  buyAvgPrice: z.string().min(1, 'Buy average price is required'),
  amount: z.string().min(1, 'Amount is required'),
  accountId: z.string().min(1, 'Account is required'),
  notes: z.string().optional(),
});

type HoldingFormValues = z.infer<typeof holdingSchema>;

interface HoldingFormProps {
  holding?: Holding;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function HoldingForm({ holding, onSuccess, onCancel }: HoldingFormProps) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);

  React.useEffect(() => {
    db.accounts.toArray().then(setAccounts);
  }, []);

  const form = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingSchema),
    defaultValues: {
      ticker: holding?.ticker || '',
      buyAvgPrice: holding?.buyAvgPrice.toString() || '',
      amount: holding?.currentAmount.toString() || '',
      accountId: holding?.accountDistribution[0]?.accountId.toString() || '',
      notes: holding?.notes || '',
    },
  });

  const onSubmit = async (data: HoldingFormValues) => {
    const accountId = parseInt(data.accountId);
    const buyAvgPrice = parseFloat(data.buyAvgPrice);
    const amount = parseFloat(data.amount);

    // Get all accounts to create distribution across all
    const allAccounts = await db.accounts.toArray();
    
    if (holding?.id) {
      // Update existing holding - preserve existing distribution, update selected account
      const existingDistribution = holding.accountDistribution || [];
      const updatedDistribution = allAccounts.map(acc => {
        if (!acc.id) return null;
        // If this is the selected account, use the new amount
        if (acc.id === accountId) {
          return { accountId: acc.id, amount };
        }
        // Otherwise preserve existing amount or default to 0
        const existing = existingDistribution.find(d => d.accountId === acc.id);
        return { accountId: acc.id, amount: existing?.amount || 0 };
      }).filter(Boolean) as { accountId: number; amount: number }[];

      // Calculate total amount across all accounts
      const totalAmount = updatedDistribution.reduce((sum, d) => sum + d.amount, 0);

      await db.holdings.update(holding.id, {
        ticker: data.ticker,
        buyAvgPrice,
        buyTotalAmount: totalAmount,
        currentAmount: totalAmount,
        accountDistribution: updatedDistribution,
        notes: data.notes,
      });
    } else {
      // Create new holding - add to all accounts with amount only in selected account
      const accountDistribution = allAccounts.map(acc => 
        acc.id ? { accountId: acc.id, amount: acc.id === accountId ? amount : 0 } : null
      ).filter(Boolean) as { accountId: number; amount: number }[];

      await db.holdings.add({
        ticker: data.ticker,
        buyAvgPrice,
        buyTotalAmount: amount,
        currentAmount: amount,
        accountDistribution,
        notes: data.notes,
      });
    }

    form.reset();
    onSuccess();
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="ticker">Asset Ticker</Label>
        <Input
          id="ticker"
          placeholder="BTC, ETH, etc."
          {...form.register('ticker')}
        />
        {form.formState.errors.ticker && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.ticker.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="buyAvgPrice">Average Buy Price (USD)</Label>
        <Input
          id="buyAvgPrice"
          type="number"
          step="any"
          placeholder="0.00"
          {...form.register('buyAvgPrice')}
        />
        {form.formState.errors.buyAvgPrice && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.buyAvgPrice.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          type="number"
          step="any"
          placeholder="0.00"
          {...form.register('amount')}
        />
        {form.formState.errors.amount && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.amount.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="accountId">Account</Label>
        <select
          id="accountId"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          {...form.register('accountId')}
        >
          <option value="">Select Account</option>
          {accounts.map((account) =>
            account.id ? (
              <option key={account.id} value={account.id.toString()}>
                {account.name}
              </option>
            ) : null
          )}
        </select>
        {form.formState.errors.accountId && (
          <p className="text-sm text-red-500 mt-1">{form.formState.errors.accountId.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input
          id="notes"
          placeholder="Add notes..."
          {...form.register('notes')}
        />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">
          {holding ? 'Update Holding' : 'Add Holding'}
        </Button>
      </div>
    </form>
  );
}

interface BuySellDialogProps {
  holding: Holding;
  type: 'buy' | 'sell';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BuySellDialog({ holding, type, open, onOpenChange, onSuccess }: BuySellDialogProps) {
  const [price, setPrice] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    db.accounts.toArray().then(accs => {
      setAccounts(accs);
      // Auto-select first account with non-zero amount if selling
      if (type === 'sell' && !accountId) {
        const accountWithAmount = holding.accountDistribution.find(d => d.amount > 0);
        if (accountWithAmount) {
          setAccountId(accountWithAmount.accountId.toString());
        }
      }
    });
  }, [type, accountId, holding.accountDistribution]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    const selectedAccountId = parseInt(accountId);

    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('Invalid price');
      return;
    }

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }

    if (!selectedAccountId) {
      setError('Please select an account');
      return;
    }

    // Get current amount in selected account
    const accountHolding = holding.accountDistribution.find(d => d.accountId === selectedAccountId);
    const currentAccountAmount = accountHolding?.amount || 0;

    if (type === 'sell' && amountNum > currentAccountAmount) {
      setError(`Cannot sell more than ${currentAccountAmount.toFixed(8)} available in this account`);
      return;
    }

    // Update account distribution
    const updatedDistribution = holding.accountDistribution.map(d => {
      if (d.accountId === selectedAccountId) {
        return {
          ...d,
          amount: type === 'buy' ? d.amount + amountNum : d.amount - amountNum
        };
      }
      return d;
    });

    // Calculate new total amount
    const newTotalAmount = updatedDistribution.reduce((sum, d) => sum + d.amount, 0);

    if (type === 'buy') {
      // Calculate new buy average
      const totalCost = holding.buyAvgPrice * holding.buyTotalAmount + priceNum * amountNum;
      const totalAmount = holding.buyTotalAmount + amountNum;
      const newBuyAvg = totalCost / totalAmount;

      await db.holdings.update(holding.id!, {
        buyAvgPrice: newBuyAvg,
        buyTotalAmount: totalAmount,
        currentAmount: newTotalAmount,
        accountDistribution: updatedDistribution,
      });
    } else {
      // Sell: calculate sell average
      const prevSellTotal = holding.sellTotalAmount || 0;
      const prevSellSum = (holding.sellAvgPrice || 0) * prevSellTotal;
      const newSellSum = prevSellSum + priceNum * amountNum;
      const newSellTotal = prevSellTotal + amountNum;
      const newSellAvg = newSellSum / newSellTotal;

      await db.holdings.update(holding.id!, {
        sellAvgPrice: newSellAvg,
        sellTotalAmount: newSellTotal,
        currentAmount: newTotalAmount,
        accountDistribution: updatedDistribution,
      });
    }

    setPrice('');
    setAmount('');
    setAccountId('');
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === 'buy' ? 'Buy' : 'Sell'} {holding.ticker}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Account</Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              required
            >
              <option value="">Select Account</option>
              {accounts.map((account) => {
                if (!account.id) return null;
                const accountHolding = holding.accountDistribution.find(d => d.accountId === account.id);
                const accountAmount = accountHolding?.amount || 0;
                return (
                  <option key={account.id} value={account.id.toString()}>
                    {account.name} ({accountAmount.toFixed(8)} {holding.ticker})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label>Price (USD)</Label>
            <Input
              type="number"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {type === 'sell' && accountId && (
              <p className="text-xs text-muted-foreground mt-1">
                Available: {(holding.accountDistribution.find(d => d.accountId === parseInt(accountId))?.amount || 0).toFixed(8)}
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {type === 'buy' ? 'Buy' : 'Sell'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
