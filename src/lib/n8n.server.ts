// n8n automation webhook. Fail-safe: never throws, never blocks a payment.
export const N8N_EVENTS = ["payment.confirmed"] as const;

export async function emitN8nEvent(event: (typeof N8N_EVENTS)[number], payload: Record<string, unknown>) {
  const url = process.env["N8N_WEBHOOK_URL"];
  if (!url) {
    console.log(`[n8n] Automatización deshabilitada (sin N8N_WEBHOOK_URL); evento ${event} omitido.`);
    return { sent: false };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, sent_at: new Date().toISOString(), ...payload }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) console.error(`[n8n] Webhook respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { sent: res.ok };
  } catch (e) {
    console.error("[n8n] Error enviando webhook", e);
    return { sent: false };
  }
}
