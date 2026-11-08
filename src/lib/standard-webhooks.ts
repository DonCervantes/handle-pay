// Firma y verificación de webhooks según Standard Webhooks (https://www.standardwebhooks.com),
// el esquema que usa Pey. Con Web Crypto: funciona igual en Node, Bun y Cloudflare Workers.
//
// Contenido firmado: `${webhook-id}.${webhook-timestamp}.${cuerpo crudo}`
// Firma: HMAC-SHA256 con el secreto (whsec_<base64>), en base64, con prefijo "v1,".
// El encabezado webhook-signature puede traer varias firmas separadas por espacio.

const TOLERANCIA_SEG = 5 * 60;

function base64ABytes(b64: string): Uint8Array<ArrayBuffer> {
  const binario = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function bytesABase64(bytes: ArrayBuffer): string {
  let binario = "";
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario);
}

async function clave(secreto: string): Promise<CryptoKey> {
  const crudo = base64ABytes(secreto.startsWith("whsec_") ? secreto.slice(6) : secreto);
  return crypto.subtle.importKey("raw", crudo, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** Comparación en tiempo constante (evita filtrar la firma por tiempos de respuesta). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

export async function firmarWebhook(
  secreto: string,
  id: string,
  timestamp: number,
  cuerpo: string,
): Promise<string> {
  const firma = await crypto.subtle.sign(
    "HMAC",
    await clave(secreto),
    new TextEncoder().encode(`${id}.${timestamp}.${cuerpo}`),
  );
  return `v1,${bytesABase64(firma)}`;
}

export type EncabezadosWebhook = {
  id: string | null;
  timestamp: string | null;
  firma: string | null;
};

/**
 * true si la firma es válida y el timestamp está dentro de ±5 minutos (evita que
 * alguien reenvíe un webhook viejo que haya interceptado).
 */
export async function verificarWebhook(
  secreto: string,
  { id, timestamp, firma }: EncabezadosWebhook,
  cuerpo: string,
  ahoraSeg: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!id || !timestamp || !firma) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(ahoraSeg - ts) > TOLERANCIA_SEG) return false;
  const esperada = await firmarWebhook(secreto, id, ts, cuerpo);
  return firma.split(" ").some((f) => iguales(f, esperada));
}
