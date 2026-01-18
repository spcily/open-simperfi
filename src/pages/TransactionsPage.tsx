import { useEffect, useState } from 'react';
import { db, Trade, LedgerEntry } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BuyFormComponent } from '@/components/forms/BuyFormComponent';
import { SellFormComponent } from '@/components/forms/SellFormComponent';
import { DepositFormComponent } from '@/components/forms/DepositFormComponent';
import { WithdrawFormComponent } from '@/components/forms/WithdrawFormComponent';
import { TransferFormComponent } from '@/components/forms/TransferFormComponent';

interface EnrichedTrade extends Trade {
  ledgerEntries: LedgerEntry[];
}

export default function TransactionsPage() {
  const [trades, setTrades] = useState<EnrichedTrade[]>([]);
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState(false);
  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [accounts, setAccounts] = useState<Record<number, string>>({});

  const fetchData = async () => {
    // Fetch all accounts for lookup
    const allAccounts = await db.accounts.toArray();
    const accountMap = allAccounts.reduce((acc, account) => {
      if (account.id !== undefined) {
        acc[account.id] = account.name;
      }
      return acc;
    }, {} as Record<number, string>);
    setAccounts(accountMap);

    // Fetch all trades
    const allTrades = await db.trades.orderBy('date').reverse().toArray();

    // Enrich with ledger entries
    const enriched = await Promise.all(
      allTrades.map(async (trade) => {
        const entries = await db.ledger.where('tradeId').equals(trade.id!).toArray();
        return { ...trade, ledgerEntries: entries };
      })
    );

    setTrades(enriched);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await db.transaction('rw', db.trades, db.ledger, async () => {
        await db.trades.delete(id);
        await db.ledger.where('tradeId').equals(id).delete();
      });
      fetchData();
    }
  };

  const handleSuccess = () => {
    setIsBuyDialogOpen(false);
    setIsSellDialogOpen(false);
    setIsDepositDialogOpen(false);
    setIsWithdrawDialogOpen(false);
    setIsTransferDialogOpen(false);
    fetchData();
  };

  // Helper to format the description of the trade based on entries
  const renderDescription = (trade: EnrichedTrade) => {
    const incoming = trade.ledgerEntries.filter(e => e.amount > 0);
    const outgoing = trade.ledgerEntries.filter(e => e.amount < 0);

    return (
      <div className="flex flex-col gap-1">
        {outgoing.map(e => (
          <span key={e.id} className="text-red-500 dark:text-red-400">
            Sent: {Math.abs(e.amount)} <strong>{e.assetTicker}</strong>
            {e.accountId && accounts[e.accountId] && (
              <span className="text-xs text-muted-foreground ml-1">({accounts[e.accountId]})</span>
            )}
          </span>
        ))}
        {incoming.map(e => (
          <span key={e.id} className="text-green-600 dark:text-green-400">
            Received: {Math.abs(e.amount)} <strong>{e.assetTicker}</strong>
            {e.accountId && accounts[e.accountId] && (
              <span className="text-xs text-muted-foreground ml-1">({accounts[e.accountId]})</span>
            )}
          </span>
        ))}
        {trade.notes && <span className="text-xs text-muted-foreground italic max-w-xs">{trade.notes}</span>}
      </div>
    );
  };

  // Helper to color code types
  const getBadgeVariant = (type: string) => {
      switch (type) {
          case 'deposit': return 'default'; // primary
          case 'withdraw': return 'destructive';
          default: return 'secondary';
      }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Transactions</h1>
        
        <div className="flex gap-2 flex-wrap">
          <Dialog open={isBuyDialogOpen} onOpenChange={setIsBuyDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Buy
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-w-[95vw] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle>Add Buy Order</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto px-6 h-[60vh] sm:h-[500px]">
                <BuyFormComponent onSuccess={handleSuccess} />
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isSellDialogOpen} onOpenChange={setIsSellDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Sell
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-w-[95vw] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle>Add Sell Order</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto px-6 h-[60vh] sm:h-[500px]">
                <SellFormComponent onSuccess={handleSuccess} />
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isDepositDialogOpen} onOpenChange={setIsDepositDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Deposit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-w-[95vw] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle>Add Deposit</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto px-6 h-[60vh] sm:h-[500px]">
                <DepositFormComponent onSuccess={handleSuccess} />
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Withdraw
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-w-[95vw] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle>Add Withdrawal</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto px-6 h-[60vh] sm:h-[500px]">
                <WithdrawFormComponent onSuccess={handleSuccess} />
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Transfer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-w-[95vw] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle>Add Transfer</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto px-6 h-[60vh] sm:h-[500px]">
                <TransferFormComponent onSuccess={handleSuccess} />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
            {trades.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">No transactions found.</div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <Table className="hidden md:table">
                    <TableHeader>
                        <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {trades.map((trade) => (
                        <TableRow key={trade.id}>
                            <TableCell>
                                {trade.date.toLocaleDateString()} 
                                <span className="text-xs text-muted-foreground block">
                                    {trade.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </TableCell>
                            <TableCell>
                                <Badge variant={getBadgeVariant(trade.type)} className="capitalize">
                                    {trade.type}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                {renderDescription(trade)}
                            </TableCell>
                            <TableCell className="text-right">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDelete(trade.id!)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {trades.map((trade) => (
                            <div key={trade.id} className="border rounded-lg p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="font-medium text-sm">
                                            {trade.date.toLocaleDateString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {trade.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={getBadgeVariant(trade.type)} className="capitalize">
                                            {trade.type}
                                        </Badge>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-destructive"
                                            onClick={() => handleDelete(trade.id!)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div>
                                    {renderDescription(trade)}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
