import { useQuery } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMXN } from "@/lib/format";
import { meQuery } from "@/lib/session";
import { ROLES_GERENCIA, tieneRol } from "@/lib/roles";

/** HND-035: cobros CoDi pagados hoy, para el dueño (total, cobros, ticket promedio y por cajero). */
export function VentasDelDia() {
  const { data: me } = useQuery(meQuery);
  const esGerencia = tieneRol(me?.role, ROLES_GERENCIA);
  const q = useQuery({
    queryKey: ["ventas-hoy"],
    enabled: esGerencia,
    refetchInterval: 30_000,
    queryFn: async () => {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("charges")
        .select("monto, descuento_puntos, cajero_id, profiles(full_name)")
        .eq("estado", "pagado")
        .gte("paid_at", inicio.toISOString());
      if (error) throw error;
      return data;
    },
  });
  if (!esGerencia || !q.data) return null;

  const cobros = q.data;
  const cobrado = (c: (typeof cobros)[number]) => Number(c.monto) - Number(c.descuento_puntos);
  const total = cobros.reduce((s, c) => s + cobrado(c), 0);
  const porCajero = new Map<string, number>();
  for (const c of cobros) {
    const nombre = c.profiles?.full_name ?? "Sin nombre";
    porCajero.set(nombre, (porCajero.get(nombre) ?? 0) + cobrado(c));
  }

  return (
    <Card className="mb-6 shadow-card">
      <CardHeader className="flex-row items-center gap-2">
        <QrCode className="size-4 text-muted-foreground" />
        <CardTitle className="text-base">Ventas CoDi de hoy</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-4">
        <Dato etiqueta="Cobrado" valor={formatMXN(total)} grande />
        <Dato etiqueta="Cobros" valor={String(cobros.length)} />
        <Dato
          etiqueta="Ticket promedio"
          valor={cobros.length ? formatMXN(total / cobros.length) : "—"}
        />
        <div>
          <p className="text-xs text-muted-foreground">Por cajero</p>
          {porCajero.size === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">Sin cobros todavía</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm">
              {[...porCajero].map(([nombre, monto]) => (
                <li key={nombre} className="flex justify-between gap-2">
                  <span className="truncate">{nombre}</span>
                  <span className="tabular-nums">{formatMXN(monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Dato({
  etiqueta,
  valor,
  grande = false,
}: {
  etiqueta: string;
  valor: string;
  grande?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p
        className={
          grande ? "text-2xl font-bold tabular-nums" : "text-xl font-semibold tabular-nums"
        }
      >
        {valor}
      </p>
    </div>
  );
}
