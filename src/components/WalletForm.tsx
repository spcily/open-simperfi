import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { db, Wallet } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";

const walletSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["hot", "cold", "exchange", "staked"]),
});

type WalletFormValues = z.infer<typeof walletSchema>;

interface WalletFormProps {
  onSuccess: () => void;
  initialData?: Wallet | null;
}

export function WalletForm({ onSuccess, initialData }: WalletFormProps) {
  const form = useForm<WalletFormValues>({
    resolver: zodResolver(walletSchema),
    defaultValues: {
      name: initialData?.name || "",
      type: initialData?.type || "hot",
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        type: initialData.type,
      });
    }
  }, [initialData, form]);

  const onSubmit = async (data: WalletFormValues) => {
    try {
      if (initialData && initialData.id) {
        await db.wallets.update(initialData.id, data);
      } else {
        await db.wallets.add(data);
      }
      form.reset();
      onSuccess();
    } catch (error) {
      console.error("Failed to save wallet:", error);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Wallet Name</Label>
        <Input id="name" {...form.register("name")} placeholder="e.g. Ledger Nano X" />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <Select
          onValueChange={(value) => form.setValue("type", value as any)}
          value={form.watch("type")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select wallet type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hot">Hot Wallet</SelectItem>
            <SelectItem value="cold">Cold Wallet</SelectItem>
            <SelectItem value="exchange">Exchange</SelectItem>
            <SelectItem value="staked">Staked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button type="submit">{initialData ? "Update Wallet" : "Create Wallet"}</Button>
      </DialogFooter>
    </form>
  );
}
