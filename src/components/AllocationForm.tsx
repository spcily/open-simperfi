import * as React from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";

// Schema for the form
const targetSchema = z.object({
  targets: z.array(
    z.object({
      ticker: z.string().min(1, "Ticker is required").transform(val => val.toUpperCase()),
      percentage: z.coerce.number().min(0).max(100),
    })
  )
});

type TargetFormValues = z.infer<typeof targetSchema>;

export function AllocationForm({ onSuccess }: { onSuccess: () => void }) {
  const { register, control, handleSubmit, formState: { errors }, reset, watch } = useForm<TargetFormValues>({
    resolver: zodResolver(targetSchema),
    defaultValues: {
      targets: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "targets"
  });

  // Load existing targets
  React.useEffect(() => {
    db.targets.toArray().then((targets) => {
        if (targets.length > 0) {
            reset({ targets });
        } else {
            // Default empty row
            reset({ targets: [{ ticker: '', percentage: 0 }] });
        }
    });
  }, [reset]);

  const watchedTargets = watch("targets");
  const totalPercentage = watchedTargets?.reduce((sum, t) => sum + (Number(t.percentage) || 0), 0) || 0;

  const onSubmit = async (data: TargetFormValues) => {
    await db.transaction('rw', db.targets, async () => {
      await db.targets.clear();
      await db.targets.bulkAdd(data.targets);
    });
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex-1">
              <Label className={index === 0 ? "mb-2 block" : "sr-only"}>Ticker</Label>
              <Input
                placeholder="BTC"
                {...register(`targets.${index}.ticker`)}
                className={errors.targets?.[index]?.ticker ? "border-red-500" : ""}
              />
            </div>
            <div className="flex-1">
              <Label className={index === 0 ? "mb-2 block" : "sr-only"}>Target %</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="50"
                {...register(`targets.${index}.percentage`)}
                className={errors.targets?.[index]?.percentage ? "border-red-500" : ""}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={() => remove(index)}
              className="mb-[2px]"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between py-2 border-t">
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ ticker: "", percentage: 0 })}
        >
            <Plus className="mr-2 h-4 w-4" /> Add Asset
        </Button>
        <div className={`font-semibold ${totalPercentage !== 100 ? 'text-amber-600' : 'text-green-600'}`}>
            Total: {totalPercentage.toFixed(1)}%
        </div>
      </div>

      <Button type="submit" className="w-full">Save Strategy</Button>
    </form>
  );
}
