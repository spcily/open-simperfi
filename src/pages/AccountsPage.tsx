import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Account } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccountForm } from '@/components/AccountForm';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import { formatCrypto } from '@/lib/utils';
import { getAccountTypeLabel } from '@/lib/account-types';

export default function AccountsPage() {
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [editingAccount, setEditingAccount] = React.useState<Account | null>(null);

    const accounts = useLiveQuery(() => db.accounts.toArray());
    const ledger = useLiveQuery(() => db.ledger.toArray());

    const accountBalances = React.useMemo(() => {
        if (!accounts || !ledger) return new Map<number, string>();

        const map = new Map<number, string>();
        
        accounts.forEach(account => {
            if (!account.id) return;
            
            // Get entries for this account
            const entries = ledger.filter(l => l.accountId === account.id);
            
            // Sum per ticker
            const sums: Record<string, number> = {};
            entries.forEach(e => {
                sums[e.assetTicker] = (sums[e.assetTicker] || 0) + e.amount;
            });

            // Format string (e.g. "0.5 BTC, 100 USD")
            const balanceStr = Object.entries(sums)
                .filter(([_, bal]) => Math.abs(bal) > 0.000001) // Filter dust
                .map(([ticker, bal]) => `${formatCrypto(bal)} ${ticker}`)
                .join(', ');
            
            map.set(account.id, balanceStr || "Empty");
        });
        
        return map;
    }, [accounts, ledger]);

    const onDelete = async (id: number) => {
        if (confirm("Are you sure? This will NOT delete the associated transactions, effectively 'orphaning' them.")) {
            await db.accounts.delete(id);
        }
    };

    return (
        <div className="container mx-auto space-y-6">
             <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Accounts</h1>
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                    <DialogTrigger asChild>
                        <Button>+ Add Account</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Account</DialogTitle>
                        </DialogHeader>
                        <AccountForm onSuccess={() => setIsAddModalOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Your Accounts</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Desktop Table */}
                    <Table className="hidden md:table">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Estimated Balance</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts?.map((account) => (
                                <TableRow key={account.id}>
                                    <TableCell className="font-medium">{account.name}</TableCell>
                                    <TableCell>{getAccountTypeLabel(account.type)}</TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {accountBalances.get(account.id!)}
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                         <Dialog open={editingAccount?.id === account.id} onOpenChange={(open) => !open && setEditingAccount(null)}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => setEditingAccount(account)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Edit Account</DialogTitle>
                                                </DialogHeader>
                                                <AccountForm initialData={account} onSuccess={() => setEditingAccount(null)} />
                                            </DialogContent>
                                        </Dialog>

                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => onDelete(account.id!)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {accounts?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                        No accounts found. Create one to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {accounts?.map((account) => (
                            <div key={account.id} className="border rounded-lg p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-base">{account.name}</h3>
                                        <p className="text-sm text-muted-foreground mt-1">{getAccountTypeLabel(account.type)}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Dialog open={editingAccount?.id === account.id} onOpenChange={(open) => !open && setEditingAccount(null)}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingAccount(account)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Edit Account</DialogTitle>
                                                </DialogHeader>
                                                <AccountForm initialData={account} onSuccess={() => setEditingAccount(null)} />
                                            </DialogContent>
                                        </Dialog>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => onDelete(account.id!)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Estimated Balance</div>
                                    <div className="text-sm font-medium">{accountBalances.get(account.id!)}</div>
                                </div>
                            </div>
                        ))}
                        {accounts?.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                No accounts found. Create one to get started.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
