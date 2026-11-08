import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "info" | "destructive" | "neutral" | "primary";

const toneClass: Record<Tone, string> = {
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/15 text-warning ring-warning/25",
  info: "bg-info/10 text-info ring-info/20",
  destructive: "bg-destructive/10 text-destructive ring-destructive/20",
  neutral: "bg-muted text-muted-foreground ring-border",
  primary: "bg-accent text-accent-foreground ring-primary/20",
};

const map: Record<string, { label: string; tone: Tone }> = {
  income: { label: "Ingreso", tone: "success" },
  expense: { label: "Egreso", tone: "destructive" },
  draft: { label: "Borrador", tone: "neutral" },
  signed: { label: "Firmado", tone: "info" },
  submitted: { label: "Enviado", tone: "warning" },
  confirmed: { label: "Confirmado", tone: "success" },
  failed: { label: "Fallido", tone: "destructive" },
  activo: { label: "Activo", tone: "success" },
  prospecto: { label: "Prospecto", tone: "info" },
  inactivo: { label: "Inactivo", tone: "neutral" },
  vacaciones: { label: "Vacaciones", tone: "warning" },
  baja: { label: "Baja", tone: "neutral" },
  activa: { label: "Activa", tone: "success" },
  inactiva: { label: "Sin configurar", tone: "warning" },
  // Expediente KYB y sus documentos
  borrador: { label: "Borrador", tone: "neutral" },
  en_revision: { label: "En revisión", tone: "warning" },
  aprobado: { label: "Aprobado", tone: "success" },
  rechazado: { label: "Rechazado", tone: "destructive" },
  pendiente: { label: "Pendiente", tone: "info" },
  validado: { label: "Validado", tone: "success" },
  falta: { label: "Falta", tone: "neutral" },
  // Cobros CoDi y cuenta de cobro
  pagado: { label: "Pagado", tone: "success" },
  expirado: { label: "Vencido", tone: "neutral" },
  cancelado: { label: "Cancelado", tone: "neutral" },
  en_registro: { label: "En registro", tone: "warning" },
  suspendida: { label: "Suspendida", tone: "destructive" },
  error: { label: "Con error", tone: "destructive" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = map[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClass[s.tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
