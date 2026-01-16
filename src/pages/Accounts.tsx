import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { db, Account } from "@/lib/db";
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
import { AccountForm } from "@/components/AccountForm";
import { getAccountTypeLabel } from "@/lib/account-types";

interface AccountWithBalance extends Account {
  balanceSummary: string;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const fetchData = async () => {
    try {
      const allAccounts = await db.accounts.toArray();
      const allLedger = await db.ledger.toArray();

      const accountsWithBalances = allAccounts.map((account) => {
        const accountEntries = allLedger.filter((l) => l.accountId === account.id);
        
        // Sum by ticker
        const balances: Record<string, number> = {};
        accountEntries.forEach((entry) => {
          balances[entry.assetTicker] = (balances[entry.assetTicker] || 0) + entry.amount;
        });

        // Create summary string (e.g. "1.2 BTC, 500 USD")
        // Filter out zero or near-zero balances
        const summaryParts = Object.entries(balances)
          .filter(([_, amount]) => Math.abs(amount) > 0.000001)
          .map(([ticker, amount]) => `${amount.toLocaleString()} ${ticker}`);

        const balanceSummary = summaryParts.length > 0 ? summaryParts.join(", ") : "No assets";
        
        return { ...account, balanceSummary };
      });

      setAccounts(accountsWithBalances);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this account? This might affect transaction history if not cleaned up.")) {
      await db.accounts.delete(id);
      fetchData();
    }
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    setIsDialogOpen(true);
  };

  const openNew = () => {
    setEditingAccount(null);
    setIsDialogOpen(true);
  };

  const handleSuccess = () => {
    setIsDialogOpen(false);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAccount ? "Edit Account" : "Create New Account"}</DialogTitle>
              <DialogDescription>
                {editingAccount
                  ? "Update the details of your account."
                  : "Add a new account to track your assets."}
              </DialogDescription>
            </DialogHeader>
            <AccountForm onSuccess={handleSuccess} initialData={editingAccount} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Accounts</CardTitle>
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
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                    No accounts found. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>{getAccountTypeLabel(account.type)}</TableCell>
                    <TableCell>{account.balanceSummary}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(account)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => account.id && handleDelete(account.id)}
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
