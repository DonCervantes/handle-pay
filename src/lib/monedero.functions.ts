import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirRol } from "./autorizacion";
import { saldosDelMonedero, type Nivel } from "./puntos";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Movimientos que se muestran en el historial del monedero. */
const MOVIMIENTOS_MAXIMOS = 50;

/**
 * HND-044: monedero del cliente final. El cliente no puede leer `businesses` por RLS
 * (son datos del negocio), así que el servidor arma la vista con el admin client,
 * SIEMPRE filtrando por la ficha de cliente de quien llama.
 */
export const miMonedero = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirRol(context.supabase, context.userId, ["cliente"]);
    const db = await admin();
    const { data: cliente } = await db
      .from("customers")
      .select("id, nombre, nivel")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!cliente) {
      return {
        nombre: null,
        nivel: "nuevo" as Nivel,
        compras: 0,
        saldos: [],
        movimientos: [],
      };
    }

    // Aplica el vencimiento por inactividad antes de mostrar saldos.
    const { data: antes } = await db
      .from("customer_point_balances")
      .select("business_id, saldo")
      .eq("customer_id", cliente.id);
    for (const s of antes ?? []) {
      if (!s.business_id || !(Number(s.saldo) > 0)) continue;
      const { error } = await db.rpc("expirar_puntos_inactivos", {
        _customer_id: cliente.id,
        _business_id: s.business_id,
      });
      if (error) console.error("expirar_puntos_inactivos", error);
    }

    const [saldosQ, movimientosQ, comprasQ] = await Promise.all([
      db
        .from("customer_point_balances")
        .select("business_id, saldo, ultimo_movimiento")
        .eq("customer_id", cliente.id),
      db
        .from("point_transactions")
        .select("id, business_id, tipo, puntos, created_at")
        .eq("customer_id", cliente.id)
        .order("created_at", { ascending: false })
        .limit(MOVIMIENTOS_MAXIMOS),
      db
        .from("charges")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", cliente.id)
        .eq("estado", "pagado"),
    ]);
    if (saldosQ.error || movimientosQ.error) {
      console.error("miMonedero", saldosQ.error ?? movimientosQ.error);
      throw new Error("No pudimos cargar tus puntos. Intenta de nuevo.");
    }

    const ids = [
      ...new Set(
        [...(saldosQ.data ?? []), ...(movimientosQ.data ?? [])]
          .map((f) => f.business_id)
          .filter((id): id is string => !!id),
      ),
    ];
    const [negociosQ, reglasQ] = ids.length
      ? await Promise.all([
          db.from("businesses").select("id, nombre_comercial").in("id", ids),
          db
            .from("point_rules")
            .select("business_id, vigencia_dias")
            .in("business_id", ids)
            .eq("activo", true),
        ])
      : [{ data: [] }, { data: [] }];
    // Solo el nombre comercial: nada de RFC, CURP ni datos del expediente.
    const negocios = new Map((negociosQ.data ?? []).map((n) => [n.id, n.nombre_comercial]));
    const vigencias = new Map((reglasQ.data ?? []).map((r) => [r.business_id, r.vigencia_dias]));

    return {
      nombre: cliente.nombre,
      nivel: cliente.nivel as Nivel,
      compras: comprasQ.count ?? 0,
      saldos: saldosDelMonedero(saldosQ.data ?? [], negocios, vigencias),
      movimientos: (movimientosQ.data ?? []).map((m) => ({
        id: m.id,
        negocio: negocios.get(m.business_id) ?? "Negocio de la red",
        tipo: m.tipo,
        puntos: Number(m.puntos),
        fecha: m.created_at,
      })),
    };
  });
