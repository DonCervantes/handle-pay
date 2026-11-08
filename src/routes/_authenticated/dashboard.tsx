import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gift, QrCode, Receipt, Repeat, Ticket, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AvisoExpediente } from "@/components/aviso-expediente";
import { formatMXN } from "@/lib/format";
import { pageMeta } from "@/lib/metadata";
import { meQuery } from "@/lib/session";
import { puedeEntrar } from "@/lib/roles";
import {
  calcularResumen,
  cobrado,
  DIAS_RESUMEN,
  inicioDeDia,
  type CobroResumen,
  type MovimientoResumen,
} from "@/lib/resumen";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () =>
    pageMeta("Resumen", "Ventas de hoy, cobros CoDi, puntos y clientes que regresan a tu changarro."),
  component: Resumen,
});

const puntosFmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const horaFmt = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });
/** Eje de la gráfica: $450, $1.4k, $2k. */
function ejeMonto(v: number) {
  if (v < 1000) return `$${Math.round(v)}`;
  const miles = Math.round(v / 100) / 10;
  return `$${Number.isInteger(miles) ? miles : miles.toFixed(1)}k`;
}
const diaFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

/** Cobros pagados y movimientos de puntos de los últimos 30 días (RLS: solo la org propia). */
const resumenQuery = {
  queryKey: ["resumen-negocio"],
  refetchInterval: 30_000,
  queryFn: async () => {
    const desde = inicioDeDia(new Date(), DIAS_RESUMEN - 1).toISOString();
    const [cobros, movimientos] = await Promise.all([
      supabase
        .from("charges")
        .select(
          "id, monto, descuento_puntos, paid_at, customer_id, profiles(full_name), customers(nombre)",
        )
        .eq("estado", "pagado")
        .gte("paid_at", desde)
        .order("paid_at", { ascending: false })
        .limit(2000),
      supabase
        .from("point_transactions")
        .select("tipo, puntos, created_at")
        .gte("created_at", desde)
        .limit(5000),
    ]);
    if (cobros.error) throw cobros.error;
    if (movimientos.error) throw movimientos.error;
    const filas: CobroResumen[] = (cobros.data ?? []).map((c) => ({
      id: c.id,
      monto: c.monto,
      descuento_puntos: c.descuento_puntos,
      paid_at: c.paid_at,
      customer_id: c.customer_id,
      cajero: c.profiles?.full_name ?? null,
      cliente: c.customers?.nombre ?? null,
    }));
    return { cobros: filas, movimientos: (movimientos.data ?? []) as MovimientoResumen[] };
  },
};

function Resumen() {
  const { data: me } = useQuery(meQuery);
  const q = useQuery(resumenQuery);
  const puedeCobrar = puedeEntrar(me?.role, "/caja");

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Cómo va tu changarro hoy y en los últimos 30 días."
        actions={
          puedeCobrar ? (
            <Button asChild size="lg">
              <Link to="/caja">
                <QrCode /> Cobrar
              </Link>
            </Button>
          ) : undefined
        }
      />
      <AvisoExpediente />
      {q.isError ? (
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="font-medium">No pudimos cargar tu resumen.</p>
            <p className="text-sm text-muted-foreground">Revisa tu conexión e intenta de nuevo.</p>
            <Button variant="outline" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : !q.data ? (
        <CargandoResumen />
      ) : (
        <Contenido cobros={q.data.cobros} movimientos={q.data.movimientos} />
      )}
    </>
  );
}

function Contenido({
  cobros,
  movimientos,
}: {
  cobros: CobroResumen[];
  movimientos: MovimientoResumen[];
}) {
  const r = calcularResumen(cobros, movimientos);
  const cambio = r.hoy.cambioVsAyer;

  return (
    <div className="space-y-6">
      <section aria-labelledby="titulo-hoy">
        <h2 id="titulo-hoy" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Hoy
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra
            etiqueta="Ventas de hoy"
            valor={formatMXN(r.hoy.ventas)}
            icono={Wallet}
            destacada
            className="col-span-2 lg:col-span-1"
            nota={
              cambio === null ? (
                "Sin ventas ayer para comparar"
              ) : (
                <span className={cambio >= 0 ? "text-success" : "text-destructive"}>
                  {cambio >= 0 ? (
                    <TrendingUp className="mr-1 inline size-3.5" />
                  ) : (
                    <TrendingDown className="mr-1 inline size-3.5" />
                  )}
                  {cambio >= 0 ? "+" : ""}
                  {cambio}% vs. ayer
                </span>
              )
            }
          />
          <Cifra etiqueta="Cobros CoDi" valor={String(r.hoy.cobros)} icono={Receipt} nota="Pagados hoy" />
          <Cifra
            etiqueta="Ticket promedio"
            valor={r.hoy.ticketPromedio === null ? "—" : formatMXN(r.hoy.ticketPromedio)}
            icono={Ticket}
            nota="Por cobro"
          />
          <Card className="col-span-2 shadow-card lg:col-span-1">
            <CardContent className="p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">Por cajero</p>
              {r.hoy.porCajero.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Sin cobros todavía</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {r.hoy.porCajero.map((c) => (
                    <li key={c.nombre} className="flex justify-between gap-2">
                      <span className="truncate">{c.nombre}</span>
                      <span className="tabular-nums font-medium">{formatMXN(c.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="titulo-mes">
        <h2 id="titulo-mes" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos {DIAS_RESUMEN} días
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra
            etiqueta="Ventas"
            valor={formatMXN(r.periodo.ventas)}
            icono={Wallet}
            nota={`${r.periodo.cobros} cobros`}
          />
          <Cifra
            etiqueta="Puntos entregados"
            valor={puntosFmt.format(r.periodo.puntosEmitidos)}
            icono={Gift}
            nota="Ganados por tus clientes"
          />
          <Cifra
            etiqueta="Puntos canjeados"
            valor={puntosFmt.format(r.periodo.puntosCanjeados)}
            icono={Gift}
            nota={`${formatMXN(r.periodo.puntosCanjeados)} de descuento`}
          />
          <Cifra
            etiqueta="Clientes que regresan"
            valor={`${r.periodo.recurrentes} de ${r.periodo.clientes}`}
            icono={Repeat}
            nota={
              r.periodo.porcentajeRecurrentes === null
                ? "Aún sin clientes con puntos"
                : `${r.periodo.porcentajeRecurrentes}% compró 2 veces o más`
            }
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ventas por día</CardTitle>
            <p className="text-sm text-muted-foreground">Lo cobrado por CoDi, sin contar el descuento en puntos</p>
          </CardHeader>
          <CardContent className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.ventasPorDia} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="etiqueta"
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  width={48}
                  tickFormatter={ejeMonto}
                />
                <Tooltip
                  formatter={(v: number) => [formatMXN(v), "Ventas"]}
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Últimos cobros</CardTitle>
          </CardHeader>
          <CardContent>
            {r.ultimos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no hay cobros pagados. Cuando cobres en la Caja, aparecerán aquí.
              </p>
            ) : (
              <ul className="space-y-4">
                {r.ultimos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.cliente ?? "Venta sin cliente"}</p>
                      <p className="text-xs text-muted-foreground">
                        {diaFmt.format(new Date(c.paid_at!))} · {horaFmt.format(new Date(c.paid_at!))}
                        {c.cajero ? ` · ${c.cajero}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums font-medium">{formatMXN(cobrado(c))}</p>
                      {Number(c.descuento_puntos) > 0 && (
                        <p className="text-xs text-gold">−{puntosFmt.format(Number(c.descuento_puntos))} pts</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  icono: Icono,
  nota,
  destacada = false,
  className = "",
}: {
  etiqueta: string;
  valor: string;
  icono: ComponentType<{ className?: string }>;
  nota?: ReactNode;
  destacada?: boolean;
  className?: string;
}) {
  return (
    <Card className={`shadow-card ${className}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{etiqueta}</span>
          <Icono className="size-4 shrink-0" />
        </div>
        <p
          className={`mt-2 break-words font-bold tabular-nums ${destacada ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"}`}
        >
          {valor}
        </p>
        {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

function CargandoResumen() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando resumen">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
