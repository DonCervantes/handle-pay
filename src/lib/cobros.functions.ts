import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirRol } from "./autorizacion";
import { ROLES_CAJA, ROLES_GERENCIA } from "./roles";
import { MONTO_MAXIMO, VIGENCIA_COBRO_SEG, conceptoCobro, validarClabe } from "./codi";
import { modoSimulador, obtenerProveedor } from "./pagos/index.server";
import { estadoCuenta } from "./pagos/proveedor";
import { firmarWebhook } from "./standard-webhooks";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** El negocio de quien llama (RLS: solo el de su organización). */
async function miNegocio(supabase: any) {
  const { data } = await supabase
    .from("businesses")
    .select("id, nombre_comercial, tipo_persona, estado_kyb, activo")
    .maybeSingle();
  return data as {
    id: string;
    nombre_comercial: string;
    tipo_persona: "fisica" | "moral";
    estado_kyb: string;
    activo: boolean;
  } | null;
}

/**
 * ¿Puede cobrar esta caja? Lo usa la pantalla de Caja. El cajero no puede leer la
 * cuenta de cobro (RLS la reserva a la gerencia), así que el servidor responde por él.
 */
export const estadoCaja = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirRol(context.supabase, context.userId, ROLES_CAJA);
    const simulador = modoSimulador();
    const negocio = await miNegocio(context.supabase);
    if (!negocio || negocio.estado_kyb !== "aprobado" || !negocio.activo) {
      return {
        simulador,
        negocio: negocio?.nombre_comercial ?? null,
        listo: false as const,
        motivo: "negocio" as const,
      };
    }
    const db = await admin();
    const { data: cuenta } = await db
      .from("pey_accounts")
      .select("estado")
      .eq("business_id", negocio.id)
      .maybeSingle();
    if (cuenta?.estado !== "activa") {
      return {
        simulador,
        negocio: negocio.nombre_comercial,
        listo: false as const,
        motivo: "cuenta" as const,
      };
    }
    return { simulador, negocio: negocio.nombre_comercial, listo: true as const, motivo: null };
  });

// -----------------------------------------------------------------------------
// HND-031: cuenta de cobro CoDi del negocio
// -----------------------------------------------------------------------------

export const registrarCuentaCodi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ clabe: z.string().max(30), titular: z.string().trim().min(3).max(255) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const perfil = await exigirRol(
      context.supabase,
      context.userId,
      ROLES_GERENCIA,
      "Solo el dueño o un administrador conecta la cuenta de cobro.",
    );
    const negocio = await miNegocio(context.supabase);
    if (!negocio || negocio.estado_kyb !== "aprobado") {
      throw new Error(
        "Tu negocio debe estar aprobado por la red Handle antes de conectar la cuenta de cobro.",
      );
    }
    const clabe = data.clabe.replace(/\D+/g, "");
    const errorClabe = validarClabe(clabe);
    if (errorClabe) throw new Error(errorClabe);

    const db = await admin();
    const { data: existente } = await db
      .from("pey_accounts")
      .select("id, estado")
      .eq("business_id", negocio.id)
      .maybeSingle();
    if (existente && existente.estado !== "error") {
      throw new Error("Tu negocio ya tiene una cuenta de cobro registrada.");
    }

    const cuenta = await obtenerProveedor().registrarCuenta({
      alias: negocio.nombre_comercial,
      titular: data.titular,
      clabe,
      esEmpresa: negocio.tipo_persona === "moral",
    });
    const fila = {
      business_id: negocio.id,
      org_id: perfil.org_id!,
      pey_bank_account_id: cuenta.id,
      estado: estadoCuenta(cuenta.estado),
      clabe_ultimos4: clabe.slice(-4),
      titular: data.titular,
      error_mensaje: cuenta.error ?? null,
    };
    const { error } = existente
      ? await db.from("pey_accounts").update(fila).eq("id", existente.id)
      : await db.from("pey_accounts").insert(fila);
    if (error) {
      console.error("registrarCuentaCodi", error);
      throw new Error(
        "La cuenta se registró en el servicio de cobros, pero no pudimos guardarla. Avísale a soporte.",
      );
    }
    return { estado: fila.estado };
  });

/** Consulta al proveedor el estado de registro de la cuenta (tarda días hábiles con Banxico). */
export const actualizarCuentaCodi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirRol(context.supabase, context.userId, ROLES_GERENCIA);
    const { data: cuenta } = await context.supabase
      .from("pey_accounts")
      .select("id, pey_bank_account_id")
      .maybeSingle();
    if (!cuenta?.pey_bank_account_id) throw new Error("Tu negocio aún no tiene cuenta de cobro.");
    const r = await obtenerProveedor().consultarCuenta(cuenta.pey_bank_account_id);
    const estado = estadoCuenta(r.estado);
    const db = await admin();
    await db
      .from("pey_accounts")
      .update({ estado, error_mensaje: r.error ?? null })
      .eq("id", cuenta.id);
    return { estado };
  });

// -----------------------------------------------------------------------------
// HND-032 / HND-033: cobros por QR y por push
// -----------------------------------------------------------------------------

export const crearCobro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        monto: z
          .number()
          .positive()
          .max(MONTO_MAXIMO)
          .refine((m) => Math.round(m * 100) === m * 100, "El monto admite máximo 2 decimales."),
        tipo: z.enum(["qr", "push"]),
        telefono: z
          .string()
          .regex(/^\d{10}$/)
          .optional(),
        detalle: z.string().trim().max(60).optional(),
        idempotencyKey: z.string().uuid(),
      })
      .refine(
        (d) => d.tipo === "qr" || !!d.telefono,
        "Para cobrar por push escribe el celular del cliente.",
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const perfil = await exigirRol(
      context.supabase,
      context.userId,
      ROLES_CAJA,
      "No tienes permiso para cobrar.",
    );
    const negocio = await miNegocio(context.supabase);
    if (!negocio || negocio.estado_kyb !== "aprobado" || !negocio.activo) {
      throw new Error("Tu negocio aún no está habilitado para cobrar.");
    }
    const db = await admin();
    const { data: cuenta } = await db
      .from("pey_accounts")
      .select("pey_bank_account_id, estado")
      .eq("business_id", negocio.id)
      .maybeSingle();
    if (!cuenta?.pey_bank_account_id || cuenta.estado !== "activa") {
      throw new Error("La cuenta de cobro del negocio aún no está activa.");
    }

    // Con la sesión de quien cobra: RLS exige su org, su rol y estado "pendiente".
    const { data: cobro, error } = await context.supabase
      .from("charges")
      .insert({
        business_id: negocio.id,
        org_id: perfil.org_id!,
        cajero_id: context.userId,
        monto: data.monto,
        tipo: data.tipo,
        idempotency_key: data.idempotencyKey,
      })
      .select("id, created_at")
      .single();
    if (error) {
      if (error.code === "23505")
        throw new Error("Este cobro ya se había creado. Revisa la lista de cobros de hoy.");
      console.error("crearCobro", error);
      throw new Error("No pudimos crear el cobro. Intenta de nuevo.");
    }

    const datos = {
      cuentaId: cuenta.pey_bank_account_id,
      monto: data.monto,
      concepto: conceptoCobro(negocio.nombre_comercial, data.detalle),
      vigenciaSeg: VIGENCIA_COBRO_SEG,
      cobroId: cobro.id,
    };
    try {
      const proveedor = obtenerProveedor();
      let referencia: string;
      let qr: string | null = null;
      if (data.tipo === "qr") {
        const r = await proveedor.crearCobroQr(datos);
        referencia = r.referencia;
        qr = r.qr;
      } else {
        referencia = (await proveedor.crearCobroPush({ ...datos, telefono: data.telefono! }))
          .referencia;
      }
      await db.from("charges").update({ pey_charge_id: referencia }).eq("id", cobro.id);
      return { cobroId: cobro.id, creadoEn: cobro.created_at, qr };
    } catch (e) {
      // Sin cobro en el proveedor, el registro local no debe quedar pendiente.
      await db.from("charges").update({ estado: "cancelado" }).eq("id", cobro.id);
      throw e;
    }
  });

/**
 * Respaldo del webhook: pregunta al proveedor si un cobro pendiente ya se pagó y,
 * si sí, lo registra con la MISMA función atómica e idempotente que el webhook.
 * La caja lo llama periódicamente mientras espera el pago.
 */
export const verificarCobro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cobroId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirRol(context.supabase, context.userId, ROLES_CAJA);
    const { data: cobro } = await context.supabase
      .from("charges")
      .select("id, tipo, estado, pey_charge_id")
      .eq("id", data.cobroId)
      .maybeSingle();
    if (!cobro) throw new Error("Cobro no encontrado.");
    if (cobro.estado !== "pendiente" || !cobro.pey_charge_id) return { estado: cobro.estado };

    const pago = await obtenerProveedor().consultarPago({
      tipo: cobro.tipo,
      referencia: cobro.pey_charge_id,
    });
    if (!pago.pagado) return { estado: "pendiente" as const };

    const db = await admin();
    const { error } = await db.rpc("registrar_pago_pey", {
      _charge_id: cobro.id,
      _monto: pago.monto,
      _fecha_pago: new Date(pago.fechaPagoSeg * 1000).toISOString(),
      _pey_referencia: pago.transaccionId,
    });
    if (error) throw new Error(error.message);
    return { estado: "pagado" as const };
  });

export const cancelarCobro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cobroId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const perfil = await exigirRol(context.supabase, context.userId, ROLES_CAJA);
    const db = await admin();
    const { data: filas } = await db
      .from("charges")
      .update({ estado: "cancelado" })
      .eq("id", data.cobroId)
      .eq("org_id", perfil.org_id!)
      .eq("estado", "pendiente")
      .select("id");
    if (!filas?.length) throw new Error("Ese cobro ya no está pendiente.");
    return { ok: true as const };
  });

/**
 * SOLO SIMULADOR: simula que el cliente pagó. Envía a /api/webhooks/pey un webhook
 * firmado igual que Pey, así se prueba el camino real (firma → idempotencia → conciliación).
 */
export const simularPago = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cobroId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!modoSimulador()) throw new Error("Los pagos simulados solo existen en modo de pruebas.");
    await exigirRol(context.supabase, context.userId, ROLES_CAJA);
    const { data: cobro } = await context.supabase
      .from("charges")
      .select("id, business_id, monto, descuento_puntos, tipo, pey_charge_id, estado")
      .eq("id", data.cobroId)
      .maybeSingle();
    if (!cobro || cobro.estado !== "pendiente") throw new Error("Ese cobro ya no está pendiente.");
    const db = await admin();
    const { data: cuenta } = await db
      .from("pey_accounts")
      .select("pey_bank_account_id")
      .eq("business_id", cobro.business_id)
      .single();

    const tipo = cobro.tipo === "qr" ? "codi.qr.payment_received" : "codi.pn.payment_received";
    const evento = {
      type: tipo,
      amount: Number(cobro.monto) - Number(cobro.descuento_puntos),
      apiKeyId: "simulador",
      bankAccountId: cuenta?.pey_bank_account_id,
      ...(cobro.tipo === "qr" ? { codiQrId: cobro.pey_charge_id } : {}),
      transactionId:
        cobro.tipo === "qr" ? `sim_tx_${crypto.randomUUID().slice(0, 8)}` : cobro.pey_charge_id,
      concept: "Pago simulado",
      datePaid: Math.floor(Date.now() / 1000),
      numRef: "0",
      metadata: { externalMetadata: { cobroId: cobro.id } },
    };
    const cuerpo = JSON.stringify(evento);
    const id = `msg_sim_${crypto.randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const firma = await firmarWebhook(process.env["PEY_WEBHOOK_SECRET"]!, id, timestamp, cuerpo);
    const origen = new URL(getRequest().url).origin;
    const r = await fetch(`${origen}/api/webhooks/pey`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": firma,
      },
      body: cuerpo,
    });
    if (!r.ok) throw new Error(`El webhook simulado falló (HTTP ${r.status}).`);
    return { ok: true as const };
  });
