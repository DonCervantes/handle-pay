import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { CheckCircle2, FlaskConical, Loader2, QrCode, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import {
  cancelarCobro,
  crearCobro,
  estadoCaja,
  simularPago,
  verificarCobro,
} from "@/lib/cobros.functions";
import { VIGENCIA_COBRO_SEG, cobroVencido, leerMonto, telefonoValido } from "@/lib/codi";
import { formatMXN } from "@/lib/format";
import { meQuery } from "@/lib/session";
import { ROLES_GERENCIA, tieneRol } from "@/lib/roles";
import { pageMeta } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/caja")({
  head: () => pageMeta("Caja", "Cobra con CoDi por QR o al celular de tu cliente."),
  component: Caja,
});

type CobroActivo = {
  cobroId: string;
  creadoEn: string;
  qr: string | null;
  monto: number;
  tipo: "qr" | "push";
  telefono?: string;
};

const mensaje = (e: unknown) =>
  e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.";

function inicioDelDia() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function Caja() {
  const estadoFn = useServerFn(estadoCaja);
  const estado = useQuery({ queryKey: ["estado-caja"], queryFn: () => estadoFn() });
  const [activo, setActivo] = useState<CobroActivo | null>(null);

  if (estado.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Preparando la caja…
      </p>
    );
  }
  if (estado.error || !estado.data) {
    return <p className="text-sm text-destructive">No pudimos abrir la caja. Recarga la página.</p>;
  }
  const e = estado.data;

  return (
    <>
      <PageHeader
        title="Caja"
        description={e.negocio ? `Cobra con CoDi en ${e.negocio}.` : "Cobra con CoDi."}
      />
      {e.simulador && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <FlaskConical className="size-4 shrink-0" /> Modo de pruebas: los cobros son simulados y
          no se mueve dinero.
        </p>
      )}
      {!e.listo ? (
        <CajaNoLista motivo={e.motivo} />
      ) : activo ? (
        <CobroEnCurso cobro={activo} simulador={e.simulador} onTerminar={() => setActivo(null)} />
      ) : (
        <NuevoCobro onCreado={setActivo} />
      )}
      <CobrosDeHoy />
    </>
  );
}

function CajaNoLista({ motivo }: { motivo: "negocio" | "cuenta" }) {
  const { data: me } = useQuery(meQuery);
  const esGerencia = tieneRol(me?.role, ROLES_GERENCIA);
  const texto =
    motivo === "negocio"
      ? "El negocio aún no está aprobado por la red Handle."
      : "La cuenta de cobro CoDi del negocio aún no está activa.";
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center shadow-card">
      <QrCode className="size-8 text-muted-foreground" />
      <p className="font-semibold">Todavía no se puede cobrar</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {texto}{" "}
        {esGerencia ? "Termina el proceso en Mi negocio." : "Pídele al dueño que lo termine."}
      </p>
      {esGerencia && (
        <Button asChild>
          <Link to="/negocio">Ir a Mi negocio</Link>
        </Button>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Nuevo cobro
// -----------------------------------------------------------------------------

function NuevoCobro({ onCreado }: { onCreado: (c: CobroActivo) => void }) {
  const qc = useQueryClient();
  const crearFn = useServerFn(crearCobro);
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState<"qr" | "push">("qr");
  const [telefono, setTelefono] = useState("");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valor = leerMonto(monto);

  async function cobrar(e: FormEvent) {
    e.preventDefault();
    if (valor === null) return setError("Escribe un monto válido (hasta 2 decimales).");
    const tel = tipo === "push" ? telefonoValido(telefono) : null;
    if (tipo === "push" && !tel) return setError("Escribe el celular del cliente a 10 dígitos.");
    setEnviando(true);
    try {
      const r = await crearFn({
        data: {
          monto: valor,
          tipo,
          ...(tel ? { telefono: tel } : {}),
          ...(detalle.trim() ? { detalle: detalle.trim() } : {}),
          idempotencyKey: crypto.randomUUID(),
        },
      });
      onCreado({ ...r, monto: valor, tipo, ...(tel ? { telefono: tel } : {}) });
      await qc.invalidateQueries({ queryKey: ["cobros-hoy"] });
    } catch (err) {
      toast.error(mensaje(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <form onSubmit={cobrar} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="monto">¿Cuánto vas a cobrar?</Label>
            <div className="flex items-center gap-2 rounded-xl border bg-background px-4 focus-within:ring-2 focus-within:ring-ring/50">
              <span className="text-3xl font-semibold text-muted-foreground">$</span>
              <input
                id="monto"
                inputMode="decimal"
                autoComplete="off"
                value={monto}
                onChange={(e) => {
                  setMonto(e.target.value);
                  setError(null);
                }}
                placeholder="0.00"
                className="h-16 w-full bg-transparent text-4xl font-bold tabular-nums outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de cobro">
            {(
              [
                {
                  valor: "qr",
                  titulo: "Código QR",
                  detalle: "El cliente lo escanea",
                  icono: QrCode,
                },
                {
                  valor: "push",
                  titulo: "A su celular",
                  detalle: "Le llega la solicitud",
                  icono: Smartphone,
                },
              ] as const
            ).map((o) => (
              <button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={tipo === o.valor}
                onClick={() => setTipo(o.valor)}
                className={cn(
                  "flex min-h-16 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left",
                  tipo === o.valor
                    ? "border-primary bg-accent text-accent-foreground"
                    : "bg-background",
                )}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <o.icono className="size-4" /> {o.titulo}
                </span>
                <span className="text-xs text-muted-foreground">{o.detalle}</span>
              </button>
            ))}
          </div>

          {tipo === "push" && (
            <div className="space-y-1.5">
              <Label htmlFor="telefono">Celular del cliente</Label>
              <Input
                id="telefono"
                type="tel"
                inputMode="numeric"
                value={telefono}
                onChange={(e) => {
                  setTelefono(e.target.value);
                  setError(null);
                }}
                placeholder="55 1234 5678"
                className="h-12 text-lg"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="detalle">Concepto (opcional)</Label>
            <Input
              id="detalle"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Ej.: 3 tacos de pastor"
              maxLength={60}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button className="h-14 w-full text-lg" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" />}
            {valor !== null ? `Cobrar ${formatMXN(valor)}` : "Cobrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Cobro en curso: QR o push, esperando el pago
// -----------------------------------------------------------------------------

function useCuentaRegresiva(creadoEn: string) {
  const restante = () =>
    Math.max(
      0,
      VIGENCIA_COBRO_SEG - Math.floor((Date.now() - new Date(creadoEn).getTime()) / 1000),
    );
  const [segundos, setSegundos] = useState(restante);
  useEffect(() => {
    const t = setInterval(() => setSegundos(restante()), 1000);
    return () => clearInterval(t);
  }, [creadoEn]);
  return segundos;
}

function CobroEnCurso({
  cobro,
  simulador,
  onTerminar,
}: {
  cobro: CobroActivo;
  simulador: boolean;
  onTerminar: () => void;
}) {
  const qc = useQueryClient();
  const cancelarFn = useServerFn(cancelarCobro);
  const simularFn = useServerFn(simularPago);
  const [imagenQr, setImagenQr] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"cancelar" | "simular" | null>(null);
  const segundos = useCuentaRegresiva(cobro.creadoEn);

  // Estado del cobro: tiempo real (Supabase Realtime) con consulta periódica de respaldo.
  const estado = useQuery({
    queryKey: ["cobro", cobro.cobroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select("estado")
        .eq("id", cobro.cobroId)
        .single();
      if (error) throw error;
      return data.estado;
    },
    refetchInterval: (q) => (q.state.data === "pendiente" ? 4000 : false),
  });

  // Con Pey real: además del webhook, pregunta al proveedor si ya se pagó (en local
  // Pey no puede mandar webhooks a localhost). El registro es idempotente.
  const verificarFn = useServerFn(verificarCobro);
  useQuery({
    queryKey: ["verificar-cobro", cobro.cobroId],
    enabled: !simulador && estado.data === "pendiente",
    refetchInterval: 5000,
    queryFn: async () => {
      const r = await verificarFn({ data: { cobroId: cobro.cobroId } });
      if (r.estado !== "pendiente")
        await qc.invalidateQueries({ queryKey: ["cobro", cobro.cobroId] });
      return r.estado;
    },
  });

  useEffect(() => {
    const canal = supabase
      .channel(`cobro-${cobro.cobroId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "charges", filter: `id=eq.${cobro.cobroId}` },
        () => qc.invalidateQueries({ queryKey: ["cobro", cobro.cobroId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [cobro.cobroId, qc]);

  useEffect(() => {
    if (cobro.qr) void QRCode.toDataURL(cobro.qr, { width: 320, margin: 1 }).then(setImagenQr);
  }, [cobro.qr]);

  const pagado = estado.data === "pagado";
  useEffect(() => {
    if (pagado) void qc.invalidateQueries({ queryKey: ["cobros-hoy"] });
  }, [pagado, qc]);

  async function accion(tipo: "cancelar" | "simular") {
    setOcupado(tipo);
    try {
      if (tipo === "cancelar") {
        await cancelarFn({ data: { cobroId: cobro.cobroId } });
        toast.success("Cobro cancelado");
        await qc.invalidateQueries({ queryKey: ["cobros-hoy"] });
        onTerminar();
      } else {
        await simularFn({ data: { cobroId: cobro.cobroId } });
        await qc.invalidateQueries({ queryKey: ["cobro", cobro.cobroId] });
      }
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setOcupado(null);
    }
  }

  if (pagado) {
    return (
      <Card
        className="flex flex-col items-center gap-3 border-success/40 p-8 text-center shadow-card"
        role="status"
      >
        <CheckCircle2 className="size-16 text-success" />
        <p className="text-2xl font-bold">¡Pagado!</p>
        <p className="text-4xl font-bold tabular-nums">{formatMXN(cobro.monto)}</p>
        <Button className="mt-2 h-12 w-full max-w-xs text-base" onClick={onTerminar}>
          Nuevo cobro
        </Button>
      </Card>
    );
  }

  const vencido = segundos === 0 || estado.data === "expirado";
  const cancelado = estado.data === "cancelado";
  if (vencido || cancelado) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center shadow-card">
        <p className="text-lg font-semibold">{cancelado ? "Cobro cancelado" : "El cobro venció"}</p>
        <p className="text-sm text-muted-foreground">
          Si el cliente aún quiere pagar, genera un cobro nuevo.
        </p>
        <Button className="h-12 w-full max-w-xs text-base" onClick={onTerminar}>
          Nuevo cobro
        </Button>
      </Card>
    );
  }

  const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center shadow-card">
      <p className="text-4xl font-bold tabular-nums">{formatMXN(cobro.monto)}</p>
      {cobro.tipo === "qr" ? (
        <>
          {imagenQr ? (
            <img
              src={imagenQr}
              alt="Código QR para pagar con CoDi"
              className="size-64 rounded-lg border bg-white p-2"
            />
          ) : (
            <div className="grid size-64 place-items-center rounded-lg border">
              <Loader2 className="animate-spin" />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Pídele al cliente que lo escanee desde la app de su banco.
          </p>
        </>
      ) : (
        <>
          <Smartphone className="size-14 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Enviamos la solicitud de pago al celular{" "}
            <span className="font-mono">{cobro.telefono}</span>. Pídele que la acepte en la app de
            su banco.
          </p>
        </>
      )}
      <p className="flex items-center gap-2 text-sm font-medium" role="status">
        <Loader2 className="size-4 animate-spin" /> Esperando el pago… vence en {mm}:{ss}
      </p>
      <div className="grid w-full max-w-xs gap-2">
        {simulador && (
          <Button
            variant="secondary"
            disabled={ocupado !== null}
            onClick={() => void accion("simular")}
          >
            {ocupado === "simular" ? <Loader2 className="animate-spin" /> : <FlaskConical />}{" "}
            Simular pago del cliente
          </Button>
        )}
        <Button variant="ghost" disabled={ocupado !== null} onClick={() => void accion("cancelar")}>
          {ocupado === "cancelar" ? <Loader2 className="animate-spin" /> : <X />} Cancelar cobro
        </Button>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Cobros de hoy
// -----------------------------------------------------------------------------

function CobrosDeHoy() {
  const q = useQuery({
    queryKey: ["cobros-hoy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select("id, monto, tipo, estado, created_at")
        .gte("created_at", inicioDelDia())
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  const cobros = q.data ?? [];
  const total = cobros
    .filter((c) => c.estado === "pagado")
    .reduce((s, c) => s + Number(c.monto), 0);

  return (
    <Card className="mt-6 shadow-card">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Cobros de hoy</CardTitle>
        <span className="text-sm text-muted-foreground">
          Cobrado: <span className="font-semibold text-foreground">{formatMXN(total)}</span>
        </span>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {cobros.length === 0 && (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Aún no hay cobros hoy.</p>
        )}
        {cobros.map((c) => {
          const estado =
            c.estado === "pendiente" && cobroVencido(c.created_at) ? "expirado" : c.estado;
          return (
            <div key={c.id} className="flex items-center gap-3 px-6 py-3">
              {c.tipo === "qr" ? (
                <QrCode className="size-4 text-muted-foreground" />
              ) : (
                <Smartphone className="size-4 text-muted-foreground" />
              )}
              <span className="flex-1 font-medium tabular-nums">{formatMXN(Number(c.monto))}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <StatusBadge status={estado} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
