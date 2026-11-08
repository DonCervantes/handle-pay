// UUID v4 para el navegador. `crypto.randomUUID()` solo existe en contextos seguros
// (https o localhost): al abrir la demo desde un celular por la IP de la red local
// (http://192.168.x.x) no está, y la caja no podía cobrar (T16). `getRandomValues`
// sí existe en http, así que se usa como respaldo.
export function idUnico(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // versión 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
