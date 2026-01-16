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
import { TradeForm } from '@/components/TradeForm';

interface EnrichedTrade extends Trade {
  ledgerEntries: LedgerEntry[];
}

export default function TransactionsPage() {
  const [trades, setTrades] = useState<EnrichedTrade[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
    setIsDialogOpen(false);
    fetchData();
  };

  // Helper to format the description of the trade based on entries
  const renderDescription = (trade: EnrichedTrade) => {
    const incoming = trade.ledgerEntries.filter(e => e.amount > 0);
    const outgoing = trade.ledgerEntries.filter(e => e.amount < 0);

    return (
      <div className="flex flex-col gap-1">
        {outgoing.map(e => (
          <span key={e.id} className="text-red-500">
            Sent: {Math.abs(e.amount)} <strong>{e.assetTicker}</strong>
            {e.accountId && accounts[e.accountId] && (
              <span className="text-xs text-muted-foreground ml-1">({accounts[e.accountId]})</span>
            )}
          </span>
        ))}
        {incoming.map(e => (
          <span key={e.id} className="text-green-600">
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
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Transactions</h1>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add Transaction
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Transaction</DialogTitle>
            </DialogHeader>
            {/* Pass generic onSuccess to close and refresh */}
            <TradeForm onSuccess={handleSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
            {trades.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">No transactions found.</div>
            ) : (
                <Table>
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
            )}
        </CardContent>
      </Card>
    </div>
  );
}
