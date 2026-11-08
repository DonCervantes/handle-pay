import type { ReactNode, SelectHTMLAttributes } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/table-feedback";

export function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyRow({ cols, text, action }: { cols: number; text: string; action?: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-sm text-muted-foreground">
        <EmptyState text={text}>{action}</EmptyState>
      </td>
    </tr>
  );
}
