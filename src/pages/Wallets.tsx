import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { db, Wallet } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WalletForm } from "@/components/WalletForm";

interface WalletWithBalance extends Wallet {
  balanceSummary: string;
}

export default function Wallets() {
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);

  const fetchData = async () => {
    try {
      const allWallets = await db.wallets.toArray();
      const allLedger = await db.ledger.toArray();

      const walletsWithBalances = allWallets.map((wallet) => {
        const walletEntries = allLedger.filter((l) => l.walletId === wallet.id);
        
        // Sum by ticker
        const balances: Record<string, number> = {};
        walletEntries.forEach((entry) => {
          balances[entry.assetTicker] = (balances[entry.assetTicker] || 0) + entry.amount;
        });

        // Create summary string (e.g. "1.2 BTC, 500 USD")
        // Filter out zero or near-zero balances
        const summaryParts = Object.entries(balances)
          .filter(([_, amount]) => Math.abs(amount) > 0.000001)
          .map(([ticker, amount]) => `${amount.toLocaleString()} ${ticker}`);

        const balanceSummary = summaryParts.length > 0 ? summaryParts.join(", ") : "No assets";
        
        return { ...wallet, balanceSummary };
      });

      setWallets(walletsWithBalances);
    } catch (error) {
      console.error("Failed to fetch wallets:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this wallet? This might affect transaction history if not cleaned up.")) {
      await db.wallets.delete(id);
      fetchData();
    }
  };

  const openEdit = (wallet: Wallet) => {
    setEditingWallet(wallet);
    setIsDialogOpen(true);
  };

  const openNew = () => {
    setEditingWallet(null);
    setIsDialogOpen(true);
  };

  const handleSuccess = () => {
    setIsDialogOpen(false);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Wallets</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Wallet
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingWallet ? "Edit Wallet" : "Create New Wallet"}</DialogTitle>
              <DialogDescription>
                {editingWallet
                  ? "Update the details of your wallet."
                  : "Add a new wallet to track your assets."}
              </DialogDescription>
            </DialogHeader>
            <WalletForm onSuccess={handleSuccess} initialData={editingWallet} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Wallets</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Assets (Est.)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                    No wallets found. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                wallets.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell className="font-medium">{wallet.name}</TableCell>
                    <TableCell className="capitalize">{wallet.type}</TableCell>
                    <TableCell>{wallet.balanceSummary}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(wallet)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => wallet.id && handleDelete(wallet.id)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
