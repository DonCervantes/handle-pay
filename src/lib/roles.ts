// Roles de Handle (profiles.role), a qué pantalla entra cada uno y qué rutas puede abrir.
// Este archivo es la única fuente de verdad del acceso en la app. La protección real
// de los datos está en la base (RLS) y en las funciones de servidor; esto evita que
// alguien llegue a pantallas que no le corresponden.
export type Rol =
  "owner" | "admin" | "finance" | "hr" | "sales" | "cajero" | "admin_red" | "cliente";

/** Dueño y administradores: gestionan el negocio y su equipo. */
export const ROLES_GERENCIA = ["owner", "admin"] as const satisfies readonly Rol[];
/** Personal de oficina: usa el ERP (dashboard, finanzas, clientes, colaboradores). */
export const ROLES_OFICINA = [
  "owner",
  "admin",
  "finance",
  "hr",
  "sales",
] as const satisfies readonly Rol[];
/** Quién registra y modifica movimientos de dinero. */
export const ROLES_FINANZAS = ["owner", "admin", "finance"] as const satisfies readonly Rol[];
/** Quién cobra en caja. */
export const ROLES_CAJA = ["owner", "admin", "cajero"] as const satisfies readonly Rol[];
/** Todo el personal de un negocio y la red (todos menos el cliente final). */
export const ROLES_PERSONAL = [
  ...ROLES_OFICINA,
  "cajero",
  "admin_red",
] as const satisfies readonly Rol[];

/** Roles que el dueño o un administrador pueden dar de alta en su equipo. */
export const ROLES_DE_EQUIPO = ["cajero", "admin"] as const satisfies readonly Rol[];
export type RolDeEquipo = (typeof ROLES_DE_EQUIPO)[number];

export function tieneRol(rol: string | null | undefined, roles: readonly Rol[]): boolean {
  return !!rol && (roles as readonly string[]).includes(rol);
}

export type Inicio = "/dashboard" | "/caja" | "/monedero" | "/red";

/** Pantalla de inicio según el rol. Cualquier rol desconocido va al dashboard. */
export function inicioPorRol(rol: string | null | undefined): Inicio {
  switch (rol) {
    case "cajero":
      return "/caja";
    case "cliente":
      return "/monedero";
    case "admin_red":
      return "/red";
    default:
      return "/dashboard";
  }
}

export type Marco = "oficina" | "simple";

/**
 * Qué marco de pantalla usa cada rol. Cajero y cliente usan el "simple", pensado
 * para celular (sin menú lateral ni nada del ERP); el resto, el de oficina.
 */
export function marcoPorRol(rol: string | null | undefined): Marco {
  return rol === "cajero" || rol === "cliente" ? "simple" : "oficina";
}

/**
 * Quién puede abrir cada sección privada. Una ruta cubre también sus subrutas
 * (/clientes cubre /clientes/123). Lo que no aparece aquí NO se abre para nadie:
 * cada pantalla nueva necesita su regla (lo verifica un test).
 */
const ACCESO: readonly { ruta: string; roles: readonly Rol[] }[] = [
  { ruta: "/dashboard", roles: ROLES_OFICINA },
  { ruta: "/finanzas", roles: ROLES_OFICINA },
  { ruta: "/pagos", roles: ROLES_OFICINA },
  { ruta: "/clientes", roles: ROLES_OFICINA },
  { ruta: "/colaboradores", roles: ROLES_OFICINA },
  { ruta: "/api", roles: ROLES_GERENCIA },
  { ruta: "/negocio", roles: ROLES_GERENCIA },
  { ruta: "/caja", roles: ROLES_CAJA },
  { ruta: "/monedero", roles: ["cliente"] },
  { ruta: "/red", roles: ["admin_red"] },
  { ruta: "/configuracion", roles: ROLES_PERSONAL },
];

/** Regla que aplica a una ruta, o undefined si no tiene (= nadie entra). */
export function reglaDeRuta(ruta: string) {
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  return ACCESO.find((r) => limpia === r.ruta || limpia.startsWith(`${r.ruta}/`));
}

export function puedeEntrar(rol: string | null | undefined, ruta: string): boolean {
  const regla = reglaDeRuta(ruta);
  return !!regla && tieneRol(rol, regla.roles);
}
