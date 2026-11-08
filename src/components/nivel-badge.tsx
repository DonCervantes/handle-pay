import { NIVELES, type Nivel } from "@/lib/puntos";
import { cn } from "@/lib/utils";

/** Nivel del cliente (Nuevo, De confianza, VIP) como etiqueta. */
export function NivelBadge({ nivel, className }: { nivel: Nivel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        nivel === "vip"
          ? "bg-warning/15 text-warning ring-warning/25"
          : nivel === "confianza"
            ? "bg-info/10 text-info ring-info/20"
            : "bg-muted text-muted-foreground ring-border",
        className,
      )}
    >
      {NIVELES[nivel].nombre}
    </span>
  );
}
