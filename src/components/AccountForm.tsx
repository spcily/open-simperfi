import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { db, Account } from "@/lib/db";
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
import { ACCOUNT_TYPE_OPTIONS, ACCOUNT_TYPE_VALUES, normalizeAccountType } from "@/lib/account-types";

const ACCOUNT_TYPE_ENUM_VALUES = ACCOUNT_TYPE_VALUES as unknown as [
  (typeof ACCOUNT_TYPE_VALUES)[number],
  ...(typeof ACCOUNT_TYPE_VALUES)[number][]
];

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(ACCOUNT_TYPE_ENUM_VALUES),
});

type AccountFormValues = z.infer<typeof accountSchema>;

interface AccountFormProps {
  onSuccess: () => void;
  initialData?: Account | null;
}

export function AccountForm({ onSuccess, initialData }: AccountFormProps) {
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: initialData?.name || "",
      type: normalizeAccountType(initialData?.type),
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        type: normalizeAccountType(initialData.type),
      });
    }
  }, [initialData, form]);

  const onSubmit = async (data: AccountFormValues) => {
    try {
      if (initialData && initialData.id) {
        await db.accounts.update(initialData.id, data);
      } else {
        await db.accounts.add(data);
      }
      form.reset();
      onSuccess();
    } catch (error) {
      console.error("Failed to save account:", error);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Account Name</Label>
        <Input id="name" {...form.register("name")} placeholder="e.g. Ledger Nano X" />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Account Type</Label>
        <Select
          onValueChange={(value) => form.setValue("type", value as AccountFormValues["type"])}
          value={form.watch("type")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select account type" />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button type="submit">{initialData ? "Update Account" : "Create Account"}</Button>
      </DialogFooter>
    </form>
  );
}
