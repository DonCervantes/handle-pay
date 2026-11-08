// HND-034: recepción de webhooks de Pey (firmados con Standard Webhooks).
// Eventos: codi.qr.payment_received, codi.pn.payment_received, bank.account.updated.
//
// Garantías:
// - Nada se procesa sin firma válida y reciente.
// - Idempotente por webhook-id: un reintento de algo ya procesado responde 200 sin repetir.
// - Si el procesamiento falla, responde 500 y el evento queda sin "procesado_at",
//   así el reintento de Pey sí se vuelve a intentar.
import { verificarWebhook } from "../standard-webhooks";

type EventoPago = {
  type: "codi.qr.payment_received" | "codi.pn.payment_received";
  amount: number;
  bankAccountId?: string;
  codiQrId?: string;
  transactionId: string;
  datePaid: number;
  metadata?: { externalMetadata?: Record<string, string> };
};
type EventoCuenta = { type: "bank.account.updated"; bankAccountId: string; codiStatus: string };
type Evento = EventoPago | EventoCuenta | { type?: string };

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function registrarPago(evento: EventoPago): Promise<string> {
  const db = await admin();
  const referencia =
    evento.type === "codi.qr.payment_received" ? evento.codiQrId : evento.transactionId;

  // 1) El cobro se identifica por el id que Handle mandó en metadata; si no viene, por la referencia de Pey.
  let cobroId = evento.metadata?.externalMetadata?.["cobroId"];
  if (!cobroId && referencia) {
    const { data } = await db
      .from("charges")
      .select("id")
      .eq("pey_charge_id", referencia)
      .maybeSingle();
    cobroId = data?.id;
  }
  if (!cobroId) throw new Error(`Pago sin cobro asociado (referencia ${referencia ?? "ninguna"})`);

  // 2) El dinero debe haber llegado a la cuenta del negocio dueño del cobro.
  const { data: cobro } = await db
    .from("charges")
    .select("business_id")
    .eq("id", cobroId)
    .maybeSingle();
  if (!cobro) throw new Error(`Cobro ${cobroId} no encontrado`);
  if (evento.bankAccountId) {
    const { data: cuenta } = await db
      .from("pey_accounts")
      .select("pey_bank_account_id")
      .eq("business_id", cobro.business_id)
      .maybeSingle();
    if (cuenta?.pey_bank_account_id !== evento.bankAccountId) {
      throw new Error(`El pago llegó a una cuenta que no es la del negocio del cobro ${cobroId}`);
    }
  }

  // 3) Registro atómico en la base: cobro pagado + ingreso en finanzas (idempotente).
  const { data, error } = await db.rpc("registrar_pago_pey", {
    _charge_id: cobroId,
    _monto: evento.amount,
    _fecha_pago: new Date(evento.datePaid * 1000).toISOString(),
    _pey_referencia: evento.transactionId,
  });
  if (error) throw new Error(error.message);
  return data ?? "pagado";
}

async function activarCuenta(evento: EventoCuenta): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("pey_accounts")
    .update({
      estado: evento.codiStatus === "ACTIVE" ? "activa" : "en_registro",
      error_mensaje: null,
    })
    .eq("pey_bank_account_id", evento.bankAccountId)
    .select("id");
  return data?.length ? "cuenta_actualizada" : "cuenta_no_encontrada";
}

export async function procesarWebhookPey(request: Request): Promise<Response> {
  const secreto = process.env["PEY_WEBHOOK_SECRET"];
  if (!secreto) {
    console.error("[webhook Pey] Falta PEY_WEBHOOK_SECRET");
    return json({ error: "webhook no configurado" }, 500);
  }

  const cuerpo = await request.text();
  const encabezados = {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    firma: request.headers.get("webhook-signature"),
  };
  if (!(await verificarWebhook(secreto, encabezados, cuerpo))) {
    return json({ error: "firma inválida" }, 401);
  }

  let evento: Evento;
  try {
    evento = JSON.parse(cuerpo) as Evento;
  } catch {
    return json({ error: "cuerpo inválido" }, 400);
  }

  const db = await admin();
  const id = encabezados.id!;
  const { error: errorAlta } = await db
    .from("pey_webhook_events")
    .insert({ id, tipo: evento.type ?? "desconocido", payload: JSON.parse(cuerpo) });
  if (errorAlta) {
    if (errorAlta.code !== "23505") return json({ error: "no se pudo registrar el evento" }, 500);
    const { data: previo } = await db
      .from("pey_webhook_events")
      .select("procesado_at")
      .eq("id", id)
      .single();
    if (previo?.procesado_at) return json({ ok: true, duplicado: true });
  }

  try {
    let resultado = "ignorado";
    if (evento.type === "codi.qr.payment_received" || evento.type === "codi.pn.payment_received") {
      resultado = await registrarPago(evento as EventoPago);
    } else if (evento.type === "bank.account.updated") {
      resultado = await activarCuenta(evento as EventoCuenta);
    }
    await db
      .from("pey_webhook_events")
      .update({ procesado_at: new Date().toISOString(), resultado })
      .eq("id", id);
    return json({ ok: true, resultado });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[webhook Pey]", id, mensaje);
    await db
      .from("pey_webhook_events")
      .update({ resultado: `error: ${mensaje}` })
      .eq("id", id);
    return json({ error: "no se pudo procesar" }, 500);
  }
}
