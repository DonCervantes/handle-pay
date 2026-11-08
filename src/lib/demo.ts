// Cuentas y marcas de los datos de demostración (T13). Archivo sin secretos: lo usan
// scripts/demo-datos.mjs (que crea los datos con service role) y la página /demo (T14).
//
// Todo lo que crea la demo queda marcado para poder borrarlo sin tocar nada ajeno, pero la
// marca NO se ve en la app (T23):
//   * correos @demo.handle-prueba.mx (personas, dueños de cada changarro y clientes)
//   * metadatos del usuario de Auth: { demo_handle: true }
//   * una organización es de la demo si tiene al menos un miembro y TODOS sus miembros son
//     @demo.handle-prueba.mx (cada changarro de la demo tiene su propia cuenta de dueño).
// Los nombres de organización ya no llevan prefijo. Las corridas viejas usaban "Demo · ": la
// limpieza todavía reconoce ese prefijo para poder borrarlas.
// Solo sintaxis que Node puede ejecutar sin compilar (sin enums ni alias de rutas).

/** Dominio de todos los correos de la demo (personas y clientes de mostrador). */
export const DOMINIO_DEMO = "demo.handle-prueba.mx";

/** Marca en user_metadata de las cuentas de Auth de la demo (no se muestra en la app). */
export const METADATO_DEMO = "demo_handle";

/**
 * Prefijo que usaban las organizaciones de la demo hasta T23. Ya no se crea: solo sirve
 * para que `demo:limpiar` reconozca (y borre) datos sembrados con la versión anterior.
 */
export const PREFIJO_ORG_DEMO_ANTERIOR = "Demo · ";

/** ¿Este correo es de la demo? (sin distinguir mayúsculas). */
export function esCorreoDemo(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${DOMINIO_DEMO}`);
}

/**
 * ¿Esta organización es de la demo? Lo decide quién la integra, no su nombre: al menos un
 * miembro y todos con correo de la demo. Con la marca anterior (nombre "Demo · …") basta con
 * que no tenga miembros ajenos.
 */
export function esOrgDemo(org: {
  nombre?: string | null;
  correosMiembros: readonly (string | null | undefined)[];
}): boolean {
  const todosDemo = org.correosMiembros.every((c) => esCorreoDemo(c));
  if (!todosDemo) return false;
  if (org.correosMiembros.length > 0) return true;
  return !!org.nombre && org.nombre.startsWith(PREFIJO_ORG_DEMO_ANTERIOR);
}

export type ClaveCuentaDemo = "duena" | "cajero" | "cliente" | "red";

export type CuentaDemo = {
  clave: ClaveCuentaDemo;
  email: string;
  nombre: string;
  /** Rol en profiles.role. */
  rol: "owner" | "cajero" | "cliente" | "admin_red";
  /** Texto del botón en /demo ("Entrar como …"). */
  etiqueta: string;
  /** Qué hace esta persona en la historia de la demo. */
  descripcion: string;
};

/** Negocio de la dueña: es el que cobra en la caja durante la demo. */
export const NEGOCIO_DUENA = "Abarrotes Doña Lupita";
/** Organización (y negocio) de la dueña: el mismo nombre que ve en la app. */
export const ORG_DUENA = NEGOCIO_DUENA;
/** Organización de la cuenta de la red Handle (admin_red). */
export const ORG_RED = "Red Handle";

/** Changarros de la demo con expediente "en revisión" (para mostrar la aprobación KYB en /red). */
export const NEGOCIOS_EN_REVISION_DEMO = ["Cremería La Vaquita", "Pollería El Gallo de Oro"] as const;

/** Correo de la cuenta dueña de cada changarro de la demo (salvo Doña Lupita, que es la dueña). */
export function correoDuenoDemo(slug: string): string {
  return `dueno.${slug}@${DOMINIO_DEMO}`;
}

/** Las cuatro cuentas con las que se entra a la demo, en el orden de los botones. */
export const CUENTAS_DEMO: readonly CuentaDemo[] = [
  {
    clave: "duena",
    email: `lupita@${DOMINIO_DEMO}`,
    nombre: "Lupita Hernández",
    rol: "owner",
    etiqueta: "Dueña",
    descripcion: "Dueña de Abarrotes Doña Lupita: ve sus ventas y configura los puntos.",
  },
  {
    clave: "cajero",
    email: `beto.cajero@${DOMINIO_DEMO}`,
    nombre: "Beto Ramírez",
    rol: "cajero",
    etiqueta: "Cajero",
    descripcion: "Cobra con CoDi en la caja de Doña Lupita.",
  },
  {
    clave: "cliente",
    email: `mariana@${DOMINIO_DEMO}`,
    nombre: "Mariana López",
    rol: "cliente",
    etiqueta: "Cliente",
    descripcion: "Clienta frecuente de la colonia: junta puntos y es VIP.",
  },
  {
    clave: "red",
    email: `red@${DOMINIO_DEMO}`,
    nombre: "Equipo Red Handle",
    rol: "admin_red",
    etiqueta: "Red Handle",
    descripcion: "Revisa negocios, los recomienda y corrige su ubicación en el mapa.",
  },
];

/** Clientes con cuenta además de la principal: dan variedad de niveles en la caja. */
export const CLIENTES_EXTRA_DEMO = [
  { email: `jorge@${DOMINIO_DEMO}`, nombre: "Jorge Martínez" },
  { email: `sofia@${DOMINIO_DEMO}`, nombre: "Sofía Torres" },
];

export function cuentaDemo(clave: ClaveCuentaDemo): CuentaDemo {
  const cuenta = CUENTAS_DEMO.find((c) => c.clave === clave);
  if (!cuenta) throw new Error(`Cuenta de demo desconocida: ${clave}`);
  return cuenta;
}
