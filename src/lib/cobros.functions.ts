import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirRol } from "./autorizacion";
import { ROLES_CAJA, ROLES_GERENCIA } from "./roles";
import {
  MONTO_MAXIMO,
  VIGENCIA_COBRO_SEG,
  cobroParaCerrar,
  conceptoCobro,
  validarClabe,
} from "./codi";
import { puntosGanados, type Nivel, type ReglaPuntos } from "./puntos";
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

type Admin = Awaited<ReturnType<typeof admin>>;

/** Regla de puntos activa del negocio, o null si no tiene programa activo. */
async function reglaActiva(db: Admin, businessId: string): Promise<ReglaPuntos | null> {
  const { data } = await db
    .from("point_rules")
    .select("porcentaje, tope_puntos, vigencia_dias, canje_max_porcentaje, activo")
    .eq("business_id", businessId)
    .eq("activo", true)
    .maybeSingle();
  if (!data) return null;
  return {
    porcentaje: Number(data.porcentaje),
    tope_puntos: data.tope_puntos == null ? null : Number(data.tope_puntos),
    vigencia_dias: data.vigencia_dias,
    canje_max_porcentaje: Number(data.canje_max_porcentaje),
    activo: data.activo,
  };
}

/**
 * Cierra un cobro no pagado (cancelado o expirado) y devuelve los puntos que tenía
 * reservados. Atómico e idempotente en la base. Devuelve el estado final del cobro.
 */
async function cerrarCobro(db: Admin, cobroId: string, estado: "cancelado" | "expirado") {
  const { data, error } = await db.rpc("cerrar_cobro", { _charge_id: cobroId, _estado: estado });
  if (error) throw new Error(error.message);
  return data;
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
    // Cierra los cobros abandonados del negocio y devuelve sus puntos (HND-043).
    const { error: errorVencer } = await db.rpc("vencer_cobros_pendientes", {
      _business_id: negocio.id,
    });
    if (errorVencer) console.error("vencer_cobros_pendientes", errorVencer);
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
        // HND-042 / HND-043: cliente identificado y puntos que usa como descuento.
        clienteEmail: z.string().trim().toLowerCase().email().max(255).optional(),
        puntosCanje: z
          .number()
          .positive()
          .refine((p) => Math.round(p * 100) === p * 100, "Los puntos admiten máximo 2 decimales.")
          .optional(),
      })
      .refine(
        (d) => d.tipo === "qr" || !!d.telefono,
        "Para cobrar por push escribe el celular del cliente.",
      )
      .refine(
        (d) => !d.puntosCanje || !!d.clienteEmail,
        "Para usar puntos identifica primero al cliente.",
      )
      .refine(
        (d) => !d.puntosCanje || d.puntosCanje < d.monto,
        "Los puntos no pueden cubrir toda la compra.",
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

    // HND-042: liga el cliente por correo (lo crea si aún no existe, sin cuenta).
    let cliente: { id: string; nivel: Nivel } | null = null;
    if (data.clienteEmail) {
      const { data: id, error: errorCliente } = await db.rpc("cliente_por_email", {
        _email: data.clienteEmail,
      });
      if (errorCliente || !id) {
        console.error("cliente_por_email", errorCliente);
        throw new Error("No pudimos identificar al cliente. Revisa su correo.");
      }
      const { data: ficha } = await db.from("customers").select("nivel").eq("id", id).single();
      cliente = { id, nivel: (ficha?.nivel ?? "nuevo") as Nivel };
    }

    // Con la sesión de quien cobra: RLS exige su org, su rol, estado "pendiente" y sin canje.
    const { data: cobro, error } = await context.supabase
      .from("charges")
      .insert({
        business_id: negocio.id,
        org_id: perfil.org_id!,
        cajero_id: context.userId,
        customer_id: cliente?.id ?? null,
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

    // HND-043: reserva los puntos y obtiene lo que se cobra por CoDi (monto − descuento).
    let neto = data.monto;
    if (data.puntosCanje) {
      const { data: aCobrar, error: errorCanje } = await db.rpc("aplicar_canje", {
        _charge_id: cobro.id,
        _puntos: data.puntosCanje,
      });
      if (errorCanje || aCobrar == null) {
        await cerrarCobro(db, cobro.id, "cancelado").catch((e) =>
          console.error("cerrar_cobro tras canje fallido", e),
        );
        // Los mensajes de aplicar_canje (saldo insuficiente, máximo por compra) son para el cajero.
        throw new Error(errorCanje?.message ?? "No pudimos aplicar los puntos.");
      }
      neto = Number(aCobrar);
    }
    const descuento = Math.round((data.monto - neto) * 100) / 100;
    const puntosAGanar = cliente
      ? puntosGanados(neto, await reglaActiva(db, negocio.id), cliente.nivel)
      : 0;

    const datos = {
      cuentaId: cuenta.pey_bank_account_id,
      monto: neto,
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
      return {
        cobroId: cobro.id,
        creadoEn: cobro.created_at,
        qr,
        monto: data.monto,
        descuento,
        neto,
        puntosAGanar,
      };
    } catch (e) {
      // Sin cobro en el proveedor, el registro local no debe quedar pendiente:
      // se cierra con la función atómica, que además devuelve los puntos reservados.
      await cerrarCobro(db, cobro.id, "cancelado").catch((err) =>
        console.error("cerrar_cobro tras fallo del proveedor", err),
      );
      throw e;
    }
  });

/**
 * HND-042: busca al cliente por correo para la caja. Solo busca, no crea (la ficha
 * se crea al cobrar). Aplica el vencimiento por inactividad antes de dar el saldo.
 */
export const buscarCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirRol(context.supabase, context.userId, ROLES_CAJA, "No tienes permiso para cobrar.");
    const negocio = await miNegocio(context.supabase);
    if (!negocio) throw new Error("Tu cuenta no tiene un negocio registrado.");
    const db = await admin();
    const regla = await reglaActiva(db, negocio.id);

    // ilike sin comodines: el correo se compara completo, sin importar mayúsculas.
    const patron = data.email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: cliente } = await db
      .from("customers")
      .select("id, nombre, nivel")
      .ilike("email", patron)
      .maybeSingle();
    if (!cliente) return { encontrado: false as const, regla };

    const { error: errorExpirar } = await db.rpc("expirar_puntos_inactivos", {
      _customer_id: cliente.id,
      _business_id: negocio.id,
    });
    if (errorExpirar) console.error("expirar_puntos_inactivos", errorExpirar);
    const { data: saldo } = await db
      .from("customer_point_balances")
      .select("saldo")
      .eq("customer_id", cliente.id)
      .eq("business_id", negocio.id)
      .maybeSingle();

    return {
      encontrado: true as const,
      regla,
      cliente: {
        nombre: cliente.nombre,
        nivel: cliente.nivel as Nivel,
        saldo: Number(saldo?.saldo ?? 0),
      },
    };
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
      .select("id, tipo, estado, pey_charge_id, created_at")
      .eq("id", data.cobroId)
      .maybeSingle();
    if (!cobro) throw new Error("Cobro no encontrado.");
    if (cobro.estado !== "pendiente") return { estado: cobro.estado };

    const db = await admin();
    const pago = cobro.pey_charge_id
      ? await obtenerProveedor().consultarPago({
          tipo: cobro.tipo,
          referencia: cobro.pey_charge_id,
        })
      : null;
    if (!pago?.pagado) {
      // Pasados 15 min sin pago, se cierra como expirado y se devuelven sus puntos.
      if (cobroParaCerrar(cobro.created_at)) {
        return { estado: await cerrarCobro(db, cobro.id, "expirado") };
      }
      return { estado: "pendiente" as const };
    }

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
    const { data: cobro } = await db
      .from("charges")
      .select("id, estado")
      .eq("id", data.cobroId)
      .eq("org_id", perfil.org_id!)
      .maybeSingle();
    if (!cobro || cobro.estado !== "pendiente") throw new Error("Ese cobro ya no está pendiente.");
    // Atómico: cancela y devuelve los puntos reservados. Si el pago llegó justo antes,
    // la función respeta el estado "pagado".
    const estado = await cerrarCobro(db, cobro.id, "cancelado");
    if (estado !== "cancelado") throw new Error("Ese cobro ya no está pendiente.");
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
