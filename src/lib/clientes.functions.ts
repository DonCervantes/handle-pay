import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirRol } from "./autorizacion";
import { ROLES_OFICINA } from "./roles";
import { resumirClientes, saldoVigente, type ClienteDelNegocio } from "./clientes";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
type Admin = Awaited<ReturnType<typeof admin>>;

/** Filas por página al leer de PostgREST (su máximo por respuesta es 1000). */
const PAGINA = 1000;
/** Tope de filas por consulta para que un negocio enorme no tumbe la pantalla. */
const MAXIMO_FILAS = 20_000;
/** Movimientos que se muestran en la ficha. */
const HISTORIAL_MAXIMO = 100;

/** Lee todas las páginas de una consulta (hasta MAXIMO_FILAS). */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < MAXIMO_FILAS; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return filas;
}

/** Vigencia (días) de la regla activa de cada negocio de la org. */
async function vigenciasDeLaOrg(db: Admin, orgId: string) {
  const { data } = await db
    .from("point_rules")
    .select("business_id, vigencia_dias")
    .eq("org_id", orgId)
    .eq("activo", true);
  return new Map((data ?? []).map((r) => [r.business_id, r.vigencia_dias]));
}

/** Fichas de clientes por id, en bloques para no pasarse del largo de la URL. */
async function fichasDeClientes(db: Admin, ids: readonly string[]) {
  const fichas: { id: string; nombre: string | null; email: string; nivel: string }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db
      .from("customers")
      .select("id, nombre, email, nivel")
      .in("id", ids.slice(i, i + 150));
    if (error) throw error;
    fichas.push(...(data ?? []));
  }
  return fichas;
}

/**
 * T21 · Clientes del changarro: quienes pagaron (o tienen puntos) en el negocio de la
 * org. El personal no puede leer `customers` por RLS (la ficha es del cliente), así
 * que el servidor arma la vista con el admin client, SIEMPRE filtrando por la org de
 * quien llama: nunca devuelve clientes que no hayan tenido actividad aquí.
 */
export const misClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClienteDelNegocio[]> => {
    const perfil = await exigirRol(context.supabase, context.userId, ROLES_OFICINA);
    if (!perfil.org_id) return [];
    const orgId = perfil.org_id;
    const db = await admin();
    try {
      const [cobros, saldos, vigencias] = await Promise.all([
        todas((desde, hasta) =>
          db
            .from("charges")
            .select("customer_id, estado, monto, descuento_puntos, paid_at, created_at")
            .eq("org_id", orgId)
            .eq("estado", "pagado")
            .not("customer_id", "is", null)
            .order("id")
            .range(desde, hasta),
        ),
        todas((desde, hasta) =>
          db
            .from("customer_point_balances")
            .select("customer_id, business_id, saldo, ultimo_movimiento")
            .eq("org_id", orgId)
            .order("customer_id")
            .range(desde, hasta),
        ),
        vigenciasDeLaOrg(db, orgId),
      ]);
      const ids = [
        ...new Set(
          [...cobros, ...saldos].map((f) => f.customer_id).filter((id): id is string => !!id),
        ),
      ];
      const fichas = await fichasDeClientes(db, ids);
      return resumirClientes(fichas, cobros, saldos, vigencias);
    } catch (error) {
      console.error("misClientes", error);
      throw new Error("No pudimos cargar tus clientes. Intenta de nuevo.");
    }
  });

/**
 * Ficha de un cliente del changarro: resumen, cobros y movimientos de puntos en este
 * negocio. Devuelve null si el cliente no tiene actividad en la org de quien llama
 * (así no se puede consultar a cualquier cliente de la red adivinando su id).
 */
export const fichaCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const perfil = await exigirRol(context.supabase, context.userId, ROLES_OFICINA);
    if (!perfil.org_id) return null;
    const orgId = perfil.org_id;
    const db = await admin();
    try {
      const [cobros, saldosQ, movimientosQ, vigencias] = await Promise.all([
        todas((desde, hasta) =>
          db
            .from("charges")
            .select("id, customer_id, estado, monto, descuento_puntos, paid_at, created_at")
            .eq("org_id", orgId)
            .eq("customer_id", data.id)
            .order("created_at", { ascending: false })
            .range(desde, hasta),
        ),
        db
          .from("customer_point_balances")
          .select("customer_id, business_id, saldo, ultimo_movimiento")
          .eq("org_id", orgId)
          .eq("customer_id", data.id),
        db
          .from("point_transactions")
          .select("id, tipo, puntos, saldo_resultante, created_at")
          .eq("org_id", orgId)
          .eq("customer_id", data.id)
          .order("created_at", { ascending: false })
          .limit(HISTORIAL_MAXIMO),
        vigenciasDeLaOrg(db, orgId),
      ]);
      if (saldosQ.error) throw saldosQ.error;
      if (movimientosQ.error) throw movimientosQ.error;
      const saldos = saldosQ.data ?? [];
      const movimientos = movimientosQ.data ?? [];
      // Sin cobros ni puntos aquí: no es cliente de este negocio.
      if (!cobros.length && !saldos.length && !movimientos.length) return null;

      const [ficha] = await fichasDeClientes(db, [data.id]);
      if (!ficha) return null;
      const [resumen] = resumirClientes([ficha], cobros, saldos, vigencias);
      const vencidos = saldos.some(
        (s) =>
          Number(s.saldo) > 0 &&
          saldoVigente(
            s.saldo,
            s.ultimo_movimiento,
            s.business_id ? (vigencias.get(s.business_id) ?? null) : null,
          ) === 0,
      );
      return {
        cliente: resumen ?? {
          id: ficha.id,
          nombre: ficha.nombre,
          email: ficha.email,
          nivel: "nuevo" as const,
          compras: 0,
          totalGastado: 0,
          puntos: 0,
          ultimaVisita: null,
          primeraVisita: null,
        },
        /** Tiene puntos que ya vencieron por inactividad (se muestran en 0). */
        puntosVencidos: vencidos,
        cobros: cobros.slice(0, HISTORIAL_MAXIMO).map((c) => ({
          id: c.id,
          estado: c.estado,
          monto: Number(c.monto),
          descuento: Number(c.descuento_puntos),
          fecha: c.paid_at ?? c.created_at,
        })),
        totalCobros: cobros.length,
        movimientos: movimientos.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          puntos: Number(m.puntos),
          saldo: Number(m.saldo_resultante),
          fecha: m.created_at,
        })),
      };
    } catch (error) {
      console.error("fichaCliente", error);
      throw new Error("No pudimos cargar la ficha del cliente. Intenta de nuevo.");
    }
  });
