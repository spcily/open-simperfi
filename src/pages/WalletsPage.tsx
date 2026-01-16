import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Wallet } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WalletForm } from '@/components/WalletForm';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import { formatCrypto } from '@/lib/utils';

export default function WalletsPage() {
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [editingWallet, setEditingWallet] = React.useState<Wallet | null>(null);

    const wallets = useLiveQuery(() => db.wallets.toArray());
    const ledger = useLiveQuery(() => db.ledger.toArray());

    const walletBalances = React.useMemo(() => {
        if (!wallets || !ledger) return new Map<number, string>();

        const map = new Map<number, string>();
        
        wallets.forEach(w => {
            if (!w.id) return;
            
            // Get entries for this wallet
            const entries = ledger.filter(l => l.walletId === w.id);
            
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
            
            map.set(w.id, balanceStr || "Empty");
        });
        
        return map;
    }, [wallets, ledger]);

    const onDelete = async (id: number) => {
        if (confirm("Are you sure? This will NOT delete the associated transactions, effectively 'orphaning' them.")) {
            await db.wallets.delete(id);
        }
    };

    return (
        <div className="container mx-auto space-y-6">
             <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Wallets</h1>
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                    <DialogTrigger asChild>
                        <Button>+ Add Wallet</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Wallet</DialogTitle>
                        </DialogHeader>
                        <WalletForm onSuccess={() => setIsAddModalOpen(false)} />
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
                                <TableHead>Estimated Balance</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {wallets?.map((wallet) => (
                                <TableRow key={wallet.id}>
                                    <TableCell className="font-medium">{wallet.name}</TableCell>
                                    <TableCell className="capitalize">{wallet.type}</TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {walletBalances.get(wallet.id!)}
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                         <Dialog open={editingWallet?.id === wallet.id} onOpenChange={(open) => !open && setEditingWallet(null)}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => setEditingWallet(wallet)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Edit Wallet</DialogTitle>
                                                </DialogHeader>
                                                <WalletForm initialData={wallet} onSuccess={() => setEditingWallet(null)} />
                                            </DialogContent>
                                        </Dialog>

                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => onDelete(wallet.id!)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {wallets?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                        No wallets found. Create one to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
