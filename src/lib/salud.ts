// HND-062 · Estado del servicio para la verificación post-deploy (GET /api/health).
//
// Responde si el Worker está vivo y si tiene la configuración mínima para operar.
// Nunca devuelve valores: solo NOMBRES de variables que faltan, el modo de pagos
// (mock/pey, que también se ve en la interfaz) y la hora del servidor.
// No consulta la base para que sea barato y no se pueda usar para cargarla.

type Entorno = Record<string, string | undefined>;

export type Salud = {
  ok: boolean;
  servicio: "handle";
  pagos: "mock" | "pey";
  faltan: string[];
  hora: string;
};

const BASICAS = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const PAGOS_REALES = ["PEY_API_KEY", "PEY_WEBHOOK_SECRET"] as const;

const presente = (env: Entorno, nombre: string) => !!env[nombre]?.trim();

export function revisarSalud(env: Entorno, ahora: Date = new Date()): Salud {
  const pagos = (env["PAYMENTS_PROVIDER"] ?? "mock").trim().toLowerCase() === "pey" ? "pey" : "mock";
  const requeridas: readonly string[] =
    pagos === "pey" ? [...BASICAS, ...PAGOS_REALES] : BASICAS;
  const faltan = requeridas.filter((n) => !presente(env, n));
  return { ok: faltan.length === 0, servicio: "handle", pagos, faltan, hora: ahora.toISOString() };
}

export function respuestaSalud(env: Entorno): Response {
  const salud = revisarSalud(env);
  return new Response(JSON.stringify(salud), {
    status: salud.ok ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
