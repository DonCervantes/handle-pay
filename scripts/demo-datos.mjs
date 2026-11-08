#!/usr/bin/env node
// T13 · Datos de demostración en la base compartida de Supabase (service role).
//
//   node --env-file=.env scripts/demo-datos.mjs            # crea o completa la demo (idempotente)
//   node --env-file=.env scripts/demo-datos.mjs --limpiar  # borra TODO lo de la demo y nada más
//   node --env-file=.env scripts/demo-datos.mjs --conteos  # solo muestra cuántos datos de demo hay
//   (atajos: bun run demo:datos, bun run demo:limpiar)
//
// Qué crea (todo marcado SIN que se vea en la app: correos @demo.handle-prueba.mx y
// user_metadata.demo_handle en Auth; ver src/lib/demo.ts):
//   * 12 changarros en Santa María la Ribera (CDMX), aprobados y activos (salen en /mapa),
//     con pin, categorías variadas, horario, regla de puntos y 3 recomendados.
//   * 2 changarros más con expediente "en revisión" y sus 4 documentos de ejemplo (PDF) en el
//     bucket privado "kyb": la red los aprueba en vivo desde /red.
//   * Cuentas: dueña (Abarrotes Doña Lupita), cajero, 3 clientes con cuenta, red (admin_red) y
//     una cuenta de dueño por cada otro changarro (así cada organización tiene miembros de la
//     demo y se reconoce sin ponerle un prefijo al nombre).
//     Los correos y nombres están en src/lib/demo.ts (los usa también /demo).
//   * ~30 días de cobros CoDi pagados (simulados) con clientes identificados: puntos,
//     algunos canjes y niveles distintos (VIP, confianza, nuevo).
//
// Idempotente: cada cobro tiene una llave fija ("demo:<negocio>:<n>"); lo que ya existe no
// se vuelve a crear. Volver a correrlo otro día solo completa lo que falte.
//
// Limpieza: el ledger de puntos es inmutable (trigger), así que el borrado completo usa el
// Management API (SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_ID) en UNA transacción que solo
// toca organizaciones con al menos un miembro y TODOS sus miembros @demo.handle-prueba.mx
// (o, de corridas anteriores a T23, con nombre "Demo · …" y sin miembros ajenos) y clientes
// @demo.handle-prueba.mx. Luego borra sus documentos del bucket "kyb" y sus usuarios de Auth.
// Sin ese token, --limpiar al menos retira los negocios del mapa.
//
// Nunca imprime llaves. Solo corre con PAYMENTS_PROVIDER=mock (o sin definir).
import { createClient } from "@supabase/supabase-js";
import {
  CLIENTES_EXTRA_DEMO,
  CUENTAS_DEMO,
  DOMINIO_DEMO,
  METADATO_DEMO,
  NEGOCIOS_EN_REVISION_DEMO,
  NEGOCIO_DUENA,
  ORG_DUENA,
  ORG_RED,
  PREFIJO_ORG_DEMO_ANTERIOR,
  correoDuenoDemo,
  cuentaDemo,
  esCorreoDemo,
  esOrgDemo,
} from "../src/lib/demo.ts";
import { VERSION_PRIVACIDAD, VERSION_TERMINOS } from "../src/lib/legal.ts";

const args = process.argv.slice(2);
const LIMPIAR = args.includes("--limpiar");
const SOLO_CONTEOS = args.includes("--conteos");

// ---------------------------------------------------------------------------
// Entorno y candados
// ---------------------------------------------------------------------------
function requerida(nombre) {
  const v = process.env[nombre]?.trim();
  if (!v) {
    console.error(`Falta ${nombre}. Carga el .env: node --env-file=.env scripts/demo-datos.mjs`);
    process.exit(2);
  }
  return v;
}

const proveedor = (process.env.PAYMENTS_PROVIDER ?? "mock").trim().toLowerCase();
if (proveedor !== "mock") {
  console.error(
    `Los datos de demo solo se crean con PAYMENTS_PROVIDER=mock (está en "${proveedor}"). No se toca nada.`,
  );
  process.exit(2);
}

const SUPABASE_URL = requerida("SUPABASE_URL").replace(/\/+$/, "");
const LLAVE = requerida("SUPABASE_SERVICE_ROLE_KEY");
const esLlaveNueva = (k) => k.startsWith("sb_publishable_") || k.startsWith("sb_secret_");

const db = createClient(SUPABASE_URL, LLAVE, {
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      // Las llaves nuevas son opacas, no JWT: no van como Bearer.
      if (esLlaveNueva(LLAVE) && headers.get("Authorization") === `Bearer ${LLAVE}`) {
        headers.delete("Authorization");
      }
      headers.set("apikey", LLAVE);
      return fetch(input, { ...init, headers });
    },
  },
  auth: { persistSession: false, autoRefreshToken: false },
});

function ocultar(texto) {
  let s = String(texto);
  for (const k of [LLAVE, process.env.SUPABASE_ACCESS_TOKEN]) if (k && k.length > 6) s = s.split(k).join("••••");
  return s;
}

function falla(contexto, error) {
  throw new Error(`${contexto}: ${ocultar(error?.message ?? error)}`);
}

// ---------------------------------------------------------------------------
// Catálogo: 12 changarros en Santa María la Ribera (CP 06400), en orden de la colonia
// ---------------------------------------------------------------------------
/** Horario en el formato de src/lib/horario.ts (tramos de días seguidos). */
function horario(tramos) {
  return tramos.map(([desde, hasta, abre, cierra]) => {
    const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const dias =
      desde === hasta
        ? DIAS[desde]
        : hasta === desde + 1
          ? `${DIAS[desde]} y ${DIAS[hasta].toLowerCase()}`
          : `${DIAS[desde]} a ${DIAS[hasta].toLowerCase()}`;
    const legible = (h) => h.replace(/^0(\d)/, "$1");
    return {
      dias,
      horas: abre ? `${legible(abre)} a ${legible(cierra)}` : "Cerrado",
      desde,
      hasta,
      abre: abre ?? null,
      cierra: cierra ?? null,
    };
  });
}
const NEGOCIOS = [
  {
    slug: "dona-lupita",
    dueno: cuentaDemo("duena").nombre,
    nombre: NEGOCIO_DUENA,
    categoria: "abarrotes",
    direccion: "Sabino 154, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45068,
    lng: -99.15912,
    recomendado: true,
    regla: { porcentaje: 5, tope: null, vigencia: 180, canje: 50 },
    horario: horario([[0, 5, "07:30", "21:30"], [6, 6, "09:00", "15:00"]]),
    cobrosPorDia: [4, 8],
  },
  {
    slug: "tacos-el-guero",
    dueno: "Rubén Domínguez",
    nombre: "Tacos El Güero",
    categoria: "taqueria",
    direccion: "Jaime Torres Bodet 88, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45192,
    lng: -99.16041,
    recomendado: true,
    regla: { porcentaje: 8, tope: 40, vigencia: 90, canje: 30 },
    horario: horario([[0, 3, "18:00", "23:59"], [4, 5, "18:00", "02:00"], [6, 6, null, null]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "tortilleria-la-esperanza",
    dueno: "Esperanza Cruz",
    nombre: "Tortillería La Esperanza",
    categoria: "tortilleria",
    direccion: "Naranjo 210, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.44982,
    lng: -99.15745,
    recomendado: false,
    regla: { porcentaje: 3, tope: 10, vigencia: 120, canje: 50 },
    horario: horario([[0, 6, "06:30", "15:00"]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "panaderia-la-espiga",
    dueno: "Alfredo Medina",
    nombre: "Panadería La Espiga",
    categoria: "panaderia",
    direccion: "Dr. Atl 129, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.44895,
    lng: -99.15988,
    recomendado: true,
    regla: { porcentaje: 6, tope: 30, vigencia: 180, canje: 50 },
    horario: horario([[0, 5, "07:00", "21:00"], [6, 6, "08:00", "14:00"]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "carniceria-los-hermanos",
    dueno: "Jesús Salgado",
    nombre: "Carnicería Los Hermanos",
    categoria: "carniceria",
    direccion: "Fresno 45, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45311,
    lng: -99.15832,
    recomendado: false,
    regla: { porcentaje: 4, tope: 50, vigencia: 180, canje: 40 },
    horario: horario([[0, 5, "08:00", "18:00"], [6, 6, "08:00", "14:00"]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "fruteria-dona-chela",
    dueno: "Graciela Rivas",
    nombre: "Frutería Doña Chela",
    categoria: "fruteria",
    direccion: "Pino 77, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45227,
    lng: -99.15663,
    recomendado: false,
    regla: { porcentaje: 5, tope: null, vigencia: 90, canje: 50 },
    horario: horario([[0, 6, "07:00", "19:00"]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "miscelanea-el-kiosco",
    dueno: "Patricia Gómez",
    nombre: "Miscelánea El Kiosco",
    categoria: "tienda",
    direccion: "Salvador Díaz Mirón 101, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45021,
    lng: -99.16169,
    recomendado: false,
    regla: { porcentaje: 4, tope: null, vigencia: 365, canje: 50 },
    horario: horario([[0, 6, "07:00", "22:00"]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "abarrotes-san-cosme",
    dueno: "Héctor Navarro",
    nombre: "Abarrotes San Cosme",
    categoria: "abarrotes",
    direccion: "Eligio Ancona 260, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.44812,
    lng: -99.15791,
    recomendado: false,
    regla: { porcentaje: 3, tope: null, vigencia: 180, canje: 50 },
    horario: horario([[0, 5, "08:00", "21:00"], [6, 6, null, null]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "taqueria-los-cuates",
    dueno: "Omar Castillo",
    nombre: "Taquería Los Cuates",
    categoria: "taqueria",
    direccion: "Manuel Carpio 140, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45403,
    lng: -99.16087,
    recomendado: false,
    regla: { porcentaje: 7, tope: 35, vigencia: 90, canje: 30 },
    horario: horario([[0, 5, "13:00", "23:00"], [6, 6, "13:00", "19:00"]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "papeleria-la-alameda",
    dueno: "Lucía Mendoza",
    nombre: "Papelería La Alameda",
    categoria: "otro",
    direccion: "Santa María la Ribera 33, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.44937,
    lng: -99.16236,
    recomendado: false,
    regla: null,
    horario: horario([[0, 4, "09:00", "19:00"], [5, 5, "10:00", "14:00"], [6, 6, null, null]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "panaderia-santa-maria",
    dueno: "Marcos Ibarra",
    nombre: "Panadería Santa María",
    categoria: "panaderia",
    direccion: "Cedro 312, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45356,
    lng: -99.15712,
    recomendado: false,
    regla: { porcentaje: 5, tope: 20, vigencia: 180, canje: 50 },
    horario: horario([[0, 6, "06:30", "21:00"]]),
    cobrosPorDia: [0, 1],
  },
  {
    slug: "recauderia-el-huerto",
    dueno: "Teresa Luna",
    nombre: "Recaudería El Huerto",
    categoria: "fruteria",
    direccion: "Amado Nervo 58, Santa María la Ribera, Cuauhtémoc, CDMX",
    lat: 19.45126,
    lng: -99.15585,
    recomendado: false,
    regla: { porcentaje: 4, tope: null, vigencia: 120, canje: 50 },
    horario: horario([[0, 5, "07:30", "19:30"], [6, 6, "08:00", "15:00"]]),
    cobrosPorDia: [0, 1],
  },
];

/**
 * Changarros con expediente completo "en revisión" (T23): la red los aprueba en vivo.
 * Datos fiscales genéricos (RFC de público en general y una CURP de ejemplo): no son de nadie.
 * Ya traen pin para que, aunque falle la geocodificación al aprobar, salgan en el mapa.
 */
const NEGOCIOS_EN_REVISION = [
  {
    slug: "cremeria-la-vaquita",
    nombre: NEGOCIOS_EN_REVISION_DEMO[0],
    dueno: "María Castañeda",
    categoria: "tienda",
    direccion: "Ciprés 98, Santa María la Ribera, Cuauhtémoc, CDMX",
    telefono: "5550142233",
    lat: 19.45263,
    lng: -99.15958,
    regla: { porcentaje: 5, tope: 25, vigencia: 180, canje: 50 },
    horario: horario([[0, 5, "08:00", "20:00"], [6, 6, "09:00", "14:00"]]),
  },
  {
    slug: "polleria-el-gallo-de-oro",
    nombre: NEGOCIOS_EN_REVISION_DEMO[1],
    dueno: "Ramón Aguilar",
    categoria: "carniceria",
    direccion: "Olivo 41, Santa María la Ribera, Cuauhtémoc, CDMX",
    telefono: "5550187744",
    lat: 19.44958,
    lng: -99.16074,
    regla: { porcentaje: 4, tope: 30, vigencia: 120, canje: 40 },
    horario: horario([[0, 5, "08:00", "18:00"], [6, 6, "08:00", "15:00"]]),
  },
];
const RFC_GENERICO = "XAXX010101000";
const CURP_EJEMPLO = "XEXX010101HDFXXX04";
const DOCUMENTOS_KYB = [
  ["ine", "Identificación oficial (INE)"],
  ["constancia_fiscal", "Constancia de situación fiscal"],
  ["comprobante_domicilio", "Comprobante de domicilio del negocio"],
  ["titularidad_cuenta", "Estado de cuenta bancario (primera hoja)"],
];

// Clientes de mostrador sin cuenta (la caja los identificó por correo). Dan "clientes recurrentes".
const VECINOS = ["rosa", "don.pepe", "carmen", "luis", "ana", "tono"].map((n) => `${n}@${DOMINIO_DEMO}`);

const DIAS_HISTORIA = 30;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
/** PRNG determinista (mulberry32) para que la historia sea la misma en cada corrida. */
function prng(semilla) {
  let h = 2166136261;
  for (const c of semilla) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const redondear = (n) => Math.round(n * 100) / 100;

async function enParalelo(items, limite, fn) {
  const cola = [...items];
  const trabajadores = Array.from({ length: Math.min(limite, cola.length) }, async () => {
    while (cola.length) await fn(cola.shift());
  });
  await Promise.all(trabajadores);
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------
async function perfilPorCorreo(email) {
  const { data, error } = await db
    .from("profiles")
    .select("id, org_id, role")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) falla(`Leer perfil de ${email}`, error);
  return data;
}

/** Usuarios de Auth con correo de demo (para limpiar o recuperar altas a medias). */
async function usuariosAuthDemo() {
  const encontrados = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) falla("Listar usuarios de Auth", error);
    for (const u of data.users) if (esCorreoDemo(u.email)) encontrados.push(u);
    if (data.users.length < 1000) break;
  }
  return encontrados;
}

const LEGAL = { terminos_version: VERSION_TERMINOS, privacidad_version: VERSION_PRIVACIDAD };

/**
 * Crea la cuenta si no existe (el trigger handle_new_user arma perfil, org o ficha de cliente).
 * Si hay un usuario de Auth sin perfil (alta a medias), se borra y se crea de nuevo: es de demo.
 */
async function asegurarUsuario(email, metadatos, { invitacionCajero } = {}) {
  if (!esCorreoDemo(email)) throw new Error(`Solo se crean correos @${DOMINIO_DEMO} (${email}).`);
  const perfil = await perfilPorCorreo(email);
  if (perfil) return { ...perfil, creado: false };

  const huerfano = (await usuariosAuthDemo()).find((u) => u.email?.toLowerCase() === email);
  if (huerfano) {
    const { error } = await db.auth.admin.deleteUser(huerfano.id);
    if (error) falla(`Borrar alta a medias de ${email}`, error);
  }

  if (invitacionCajero) {
    const { error } = await db
      .from("team_invites")
      .upsert({ email, org_id: invitacionCajero, role: "cajero" }, { onConflict: "email" });
    if (error) falla("Invitación del cajero", error);
  }

  const { error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    // La marca de la demo va en los metadatos (no se muestra en ninguna pantalla).
    user_metadata: { ...metadatos, ...LEGAL, [METADATO_DEMO]: true },
  });
  if (error) falla(`Crear ${email}`, error);
  const nuevo = await perfilPorCorreo(email);
  if (!nuevo) throw new Error(`El alta de ${email} no creó perfil.`);
  return { ...nuevo, creado: true };
}

// ---------------------------------------------------------------------------
// Organizaciones y negocios
// ---------------------------------------------------------------------------
/**
 * Cuenta dueña de un changarro de la demo: el alta (trigger handle_new_user) crea la
 * organización con el nombre del negocio, sin prefijo, y sus cuentas "Caja" y "Cuenta CoDi".
 * Que todos sus miembros sean @demo.handle-prueba.mx es lo que la marca como de la demo.
 */
async function asegurarDueno(n) {
  const email = correoDuenoDemo(n.slug);
  const p = await asegurarUsuario(email, { full_name: n.dueno, tipo_cuenta: "negocio", org_name: n.nombre });
  if (!p.org_id || p.role !== "owner") {
    throw new Error(`${email} existe pero no es dueño de una organización; revisa a mano.`);
  }
  return p.org_id;
}

async function asegurarNegocio(orgId, n) {
  const fila = {
    org_id: orgId,
    nombre_comercial: n.nombre,
    razon_social: n.dueno,
    tipo_persona: "fisica",
    rfc: RFC_GENERICO,
    categoria: n.categoria,
    direccion: n.direccion,
    cp: "06400",
    lat: n.lat,
    lng: n.lng,
    horario: n.horario,
    estado_kyb: "aprobado",
    activo: true,
    recomendado: n.recomendado,
  };
  const { data: existente } = await db.from("businesses").select("id").eq("org_id", orgId).maybeSingle();
  // Si ya existe solo se reactiva: no se pisan pin, horario ni recomendado que se hayan
  // cambiado durante una demo (eso es justo lo que se muestra).
  const { data, error } = existente
    ? await db
        .from("businesses")
        .update({ estado_kyb: "aprobado", activo: true })
        .eq("id", existente.id)
        .select("id")
        .single()
    : await db.from("businesses").insert(fila).select("id").single();
  if (error) falla(`Negocio ${n.nombre}`, error);

  const { data: cuenta } = await db.from("pey_accounts").select("id").eq("business_id", data.id).maybeSingle();
  if (!cuenta) {
    const { error: e2 } = await db.from("pey_accounts").insert({
      org_id: orgId,
      business_id: data.id,
      pey_bank_account_id: `sim_demo_${n.slug}`,
      estado: "activa",
      clabe_ultimos4: String(1000 + (n.slug.length * 397) % 9000).slice(0, 4),
      titular: n.nombre,
    });
    if (e2) falla(`Cuenta CoDi de ${n.nombre}`, e2);
  }

  if (n.regla) {
    const { data: regla } = await db
      .from("point_rules")
      .select("id")
      .eq("business_id", data.id)
      .eq("activo", true)
      .maybeSingle();
    if (!regla) {
      const { error: e3 } = await db.from("point_rules").insert({
        org_id: orgId,
        business_id: data.id,
        porcentaje: n.regla.porcentaje,
        tope_puntos: n.regla.tope,
        vigencia_dias: n.regla.vigencia,
        canje_max_porcentaje: n.regla.canje,
        activo: true,
      });
      if (e3) falla(`Regla de puntos de ${n.nombre}`, e3);
    }
  }
  return data.id;
}

/**
 * PDF de una página con texto (Helvetica, WinAnsi). Basta para que la red abra cada documento
 * del expediente desde /red/$id. Dice claramente que es un ejemplo sin valor oficial.
 */
function pdfDeEjemplo(lineas) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const texto = [
    "0.85 0.2 0.2 RG 3 w 30 30 552 336 re S",
    "BT /F1 18 Tf 50 330 Td",
    `(${esc(lineas[0])}) Tj`,
    "/F1 12 Tf 0 -30 Td",
    ...lineas.slice(1).flatMap((l) => [`(${esc(l)}) Tj`, "0 -22 Td"]),
    "ET",
  ].join("\n");
  const contenido = Buffer.from(texto, "latin1");
  const objetos = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 396] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "latin1",
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "latin1"),
    Buffer.concat([
      Buffer.from(`<< /Length ${contenido.length} >>\nstream\n`, "latin1"),
      contenido,
      Buffer.from("\nendstream", "latin1"),
    ]),
  ];
  const partes = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [];
  let largo = partes[0].length;
  objetos.forEach((cuerpo, i) => {
    offsets.push(largo);
    const obj = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
      cuerpo,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    partes.push(obj);
    largo += obj.length;
  });
  const xref = [
    "xref",
    `0 ${objetos.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objetos.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(largo),
    "%%EOF",
    "",
  ].join("\n");
  partes.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(partes);
}

/**
 * Changarro con expediente completo esperando a la red: datos, regla de puntos, los 4
 * documentos (PDF de ejemplo en el bucket "kyb") y el envío a revisión. Si ya existe y no
 * está en borrador (p. ej. la red ya lo aprobó en un ensayo) no se toca: para volver a
 * mostrar la aprobación, `demo:limpiar && demo:datos`.
 */
async function asegurarNegocioEnRevision(orgId, n) {
  const { data: existente, error: e0 } = await db
    .from("businesses")
    .select("id, estado_kyb")
    .eq("org_id", orgId)
    .maybeSingle();
  if (e0) falla(`Leer negocio ${n.nombre}`, e0);
  if (existente && existente.estado_kyb !== "borrador") return existente.id;

  let businessId = existente?.id;
  if (!businessId) {
    const { data, error } = await db
      .from("businesses")
      .insert({
        org_id: orgId,
        nombre_comercial: n.nombre,
        razon_social: n.dueno,
        tipo_persona: "fisica",
        rfc: RFC_GENERICO,
        curp: CURP_EJEMPLO,
        telefono: n.telefono,
        categoria: n.categoria,
        direccion: n.direccion,
        cp: "06400",
        lat: n.lat,
        lng: n.lng,
        horario: n.horario,
        estado_kyb: "borrador",
        activo: false,
        recomendado: false,
      })
      .select("id")
      .single();
    if (error) falla(`Negocio ${n.nombre}`, error);
    businessId = data.id;

    const { error: e1 } = await db.from("point_rules").insert({
      org_id: orgId,
      business_id: businessId,
      porcentaje: n.regla.porcentaje,
      tope_puntos: n.regla.tope,
      vigencia_dias: n.regla.vigencia,
      canje_max_porcentaje: n.regla.canje,
      activo: true,
    });
    if (e1) falla(`Regla de puntos de ${n.nombre}`, e1);
  }

  for (const [tipo, titulo] of DOCUMENTOS_KYB) {
    const ruta = `${orgId}/${tipo}-ejemplo.pdf`;
    const pdf = pdfDeEjemplo([
      titulo,
      "DOCUMENTO DE EJEMPLO - SIN VALOR OFICIAL",
      `Negocio: ${n.nombre}`,
      `Titular: ${n.dueno}`,
      `Domicilio: ${n.direccion}`,
      "Archivo de muestra para la revisión de expedientes en Handle.",
    ]);
    const { error: eS } = await db.storage
      .from("kyb")
      .upload(ruta, pdf, { contentType: "application/pdf", upsert: true });
    if (eS) falla(`Subir ${tipo} de ${n.nombre}`, eS);
    const { error: eD } = await db
      .from("kyb_documents")
      .upsert({ business_id: businessId, org_id: orgId, tipo, storage_path: ruta }, { onConflict: "business_id,tipo" });
    if (eD) falla(`Documento ${tipo} de ${n.nombre}`, eD);
  }

  // El trigger validar_envio_kyb exige los 4 documentos: si falta alguno, esto falla.
  const { error: eR } = await db.from("businesses").update({ estado_kyb: "en_revision" }).eq("id", businessId);
  if (eR) falla(`Enviar a revisión ${n.nombre}`, eR);
  return businessId;
}

// ---------------------------------------------------------------------------
// Historia de cobros (determinista)
// ---------------------------------------------------------------------------
/**
 * Cuántos cobros tiene cada cliente con cuenta y dónde. Mariana llega a VIP (20+ compras),
 * Jorge a confianza (5+) y Sofía se queda en nuevo.
 */
const CLIENTES_FIJOS = [
  { email: cuentaDemo("cliente").email, compras: { "dona-lupita": 16, "tacos-el-guero": 3, "panaderia-la-espiga": 3 }, canjes: 3 },
  { email: CLIENTES_EXTRA_DEMO[0].email, compras: { "dona-lupita": 5, "tortilleria-la-esperanza": 2 }, canjes: 0 },
  { email: CLIENTES_EXTRA_DEMO[1].email, compras: { "dona-lupita": 2 }, canjes: 0 },
];

/** Fecha local: hace `dias` días, a la hora y minuto dados. */
function fecha(ahora, dias, hora, minuto) {
  const d = new Date(ahora);
  d.setDate(d.getDate() - dias);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

/** Plan completo de cobros (sin tocar la base). */
function planDeCobros(ahora = new Date(), cajeros = { "dona-lupita": [] }) {
  const plan = [];
  for (const n of NEGOCIOS) {
    const azar = prng(`cobros:${n.slug}`);
    const [min, max] = n.cobrosPorDia;
    let i = 0;
    for (let dias = DIAS_HISTORIA - 1; dias >= 0; dias--) {
      // Negocios chicos: un cobro cada tercer día, en promedio.
      const cuantos = max <= 1 ? (azar() < 0.35 ? 1 : 0) : min + Math.floor(azar() * (max - min + 1));
      for (let k = 0; k < cuantos; k++) {
        let cuando = fecha(ahora, dias, 8 + Math.floor(azar() * 13), Math.floor(azar() * 60));
        if (cuando > ahora) {
          // Hoy: solo lo que ya pasó (repartido en las últimas horas).
          cuando = new Date(ahora.getTime() - (k + 1) * (25 + Math.floor(azar() * 40)) * 60_000);
        }
        const monto = redondear(Math.max(18, Math.round((20 + azar() * 360) * 2) / 2));
        const lista = cajeros[n.slug] ?? [];
        plan.push({
          llave: `demo:${n.slug}:${i++}`,
          negocio: n.slug,
          cuando,
          monto,
          cliente: null,
          canje: 0,
          cajero: lista.length ? lista[Math.floor(azar() * lista.length)] : null,
        });
      }
    }
    // Dueña: siempre algunos cobros hoy para que "Ventas de hoy" tenga datos.
    if (n.slug === "dona-lupita") {
      const hoy = plan.filter((c) => c.negocio === n.slug && c.cuando.toDateString() === ahora.toDateString());
      for (let k = hoy.length; k < 4; k++) {
        plan.push({
          llave: `demo:${n.slug}:hoy-${k}`,
          negocio: n.slug,
          cuando: new Date(ahora.getTime() - (k + 1) * 47 * 60_000),
          monto: redondear(45 + k * 37.5),
          cliente: null,
          canje: 0,
          cajero: (cajeros[n.slug] ?? [])[k % Math.max(1, (cajeros[n.slug] ?? []).length)] ?? null,
        });
      }
    }
  }

  // Asigna clientes: los fijos primero (repartidos en el mes), luego vecinos en la tienda de la dueña.
  const azar = prng("clientes");
  const libres = (slug) =>
    plan.filter((c) => c.negocio === slug && !c.cliente).sort((a, b) => a.cuando - b.cuando);
  for (const cf of CLIENTES_FIJOS) {
    for (const [slug, cuantas] of Object.entries(cf.compras)) {
      let disponibles = libres(slug);
      // Si un negocio chico no tiene suficientes cobros, se agregan los que falten.
      for (let k = disponibles.length; k < cuantas; k++) {
        plan.push({
          llave: `demo:${slug}:extra-${cf.email.split("@")[0]}-${k}`,
          negocio: slug,
          cuando: fecha(ahora, 3 + k * 6, 12 + k, 15),
          monto: redondear(60 + k * 22.5),
          cliente: null,
          canje: 0,
          cajero: null,
        });
      }
      disponibles = libres(slug);
      const paso = disponibles.length / cuantas;
      for (let k = 0; k < cuantas; k++) {
        disponibles[Math.min(disponibles.length - 1, Math.floor(k * paso + azar() * paso * 0.8))].cliente = cf.email;
      }
    }
    // Canjes: en sus últimas compras en la tienda de la dueña (ya tiene saldo para entonces).
    const suyas = plan
      .filter((c) => c.cliente === cf.email && c.negocio === "dona-lupita")
      .sort((a, b) => a.cuando - b.cuando);
    for (let k = 0; k < cf.canjes; k++) {
      const c = suyas[suyas.length - 3 - k * 3];
      if (c) {
        c.monto = Math.max(c.monto, 120);
        c.canje = 10;
      }
    }
  }
  for (const c of libres("dona-lupita")) {
    if (azar() < 0.4) c.cliente = VECINOS[Math.floor(azar() * VECINOS.length)];
  }
  return plan.sort((a, b) => a.cuando - b.cuando);
}

async function ejecutarCobro(c, ids) {
  const businessId = ids.negocios[c.negocio];
  const customerId = c.cliente ? ids.clientes[c.cliente] : null;
  const { data: cobro, error } = await db
    .from("charges")
    .insert({
      business_id: businessId,
      org_id: ids.orgs[c.negocio],
      cajero_id: c.cajero,
      customer_id: customerId,
      monto: c.monto,
      tipo: "qr",
      idempotency_key: c.llave,
    })
    .select("id")
    .single();
  if (error) falla(`Cobro ${c.llave}`, error);

  let descuento = 0;
  if (c.canje > 0 && customerId) {
    const { error: e } = await db.rpc("aplicar_canje", { _charge_id: cobro.id, _puntos: c.canje });
    if (!e) descuento = c.canje; // Si no le alcanza el saldo, se cobra completo.
  }
  await pagarYFechar(cobro.id, redondear(c.monto - descuento), c.cuando, c.llave);
}

/** Paga el cobro (como el webhook de Pey en modo simulado) y lo lleva a su fecha real. */
async function pagarYFechar(chargeId, monto, cuando, llave) {
  const { error } = await db.rpc("registrar_pago_pey", {
    _charge_id: chargeId,
    _monto: monto,
    _fecha_pago: cuando.toISOString(),
    _pey_referencia: `sim_${llave.replace(/[^a-z0-9]+/gi, "_")}`,
  });
  if (error) falla(`Pago de ${llave}`, error);
  // Se crea "ahora" (así el job de vencimiento no lo toca) y ya pagado se fecha en el pasado.
  const creado = new Date(cuando.getTime() - 60_000).toISOString();
  const { error: e2 } = await db.from("charges").update({ created_at: creado }).eq("id", chargeId);
  if (e2) falla(`Fecha de ${llave}`, e2);
}

// ---------------------------------------------------------------------------
// Conteos
// ---------------------------------------------------------------------------
/**
 * Organizaciones de la demo (misma regla que SQL_ORGS_DEMO y que esOrgDemo de src/lib/demo.ts):
 * al menos un miembro y todos @demo.handle-prueba.mx, o el nombre con la marca anterior a T23
 * sin miembros ajenos.
 */
async function orgsDemo() {
  const { data: miembrosDemo, error } = await db
    .from("profiles")
    .select("org_id")
    .like("email", `%@${DOMINIO_DEMO}`)
    .not("org_id", "is", null);
  if (error) falla("Leer perfiles de demo", error);
  const { data: anteriores, error: e2 } = await db
    .from("organizations")
    .select("id")
    .like("name", `${PREFIJO_ORG_DEMO_ANTERIOR}%`);
  if (e2) falla("Leer organizaciones de demo", e2);
  const candidatas = [...new Set([...miembrosDemo.map((p) => p.org_id), ...anteriores.map((o) => o.id)])];
  if (!candidatas.length) return [];
  const { data: orgs, error: e3 } = await db.from("organizations").select("id, name").in("id", candidatas);
  if (e3) falla("Leer organizaciones candidatas", e3);
  const { data: miembros, error: e4 } = await db.from("profiles").select("org_id, email").in("org_id", candidatas);
  if (e4) falla("Leer miembros de organizaciones candidatas", e4);
  return orgs
    .filter((o) =>
      esOrgDemo({ nombre: o.name, correosMiembros: miembros.filter((m) => m.org_id === o.id).map((m) => m.email) }),
    )
    .map((o) => o.id);
}

async function conteos() {
  const orgIds = await orgsDemo();
  const contar = async (tabla, filtro) => {
    const q = db.from(tabla).select("*", { count: "exact", head: true });
    const { count, error } = await filtro(q);
    if (error) falla(`Contar ${tabla}`, error);
    return count ?? 0;
  };
  const enOrgs = (q) => (orgIds.length ? q.in("org_id", orgIds) : q.eq("org_id", "00000000-0000-0000-0000-000000000000"));
  const { data: mapa } = await db.rpc("negocios_publicos");
  const nombres = new Set(NEGOCIOS.map((n) => n.nombre));
  return {
    organizaciones: orgIds.length,
    perfiles: await contar("profiles", (q) => q.like("email", `%@${DOMINIO_DEMO}`)),
    clientes: await contar("customers", (q) => q.like("email", `%@${DOMINIO_DEMO}`)),
    negocios: await contar("businesses", enOrgs),
    enRevision: await contar("businesses", (q) => enOrgs(q).eq("estado_kyb", "en_revision")),
    documentosKyb: await contar("kyb_documents", enOrgs),
    enMapa: (mapa ?? []).filter((n) => nombres.has(n.nombre_comercial)).length,
    recomendados: (mapa ?? []).filter((n) => nombres.has(n.nombre_comercial) && n.recomendado).length,
    reglas: await contar("point_rules", enOrgs),
    cobrosPagados: await contar("charges", (q) => enOrgs(q).eq("estado", "pagado")),
    cobrosPendientes: await contar("charges", (q) => enOrgs(q).eq("estado", "pendiente")),
    movimientosPuntos: await contar("point_transactions", enOrgs),
  };
}

// ---------------------------------------------------------------------------
// Crear / completar
// ---------------------------------------------------------------------------
async function sembrar() {
  // Datos sembrados antes de T23 (organizaciones "Demo · …"): mezclarlos con los nuevos
  // duplicaría los changarros. Se piden limpiar primero.
  const { data: anteriores } = await db
    .from("organizations")
    .select("id")
    .like("name", `${PREFIJO_ORG_DEMO_ANTERIOR}%`)
    .limit(1);
  if (anteriores?.length) {
    throw new Error(
      `Hay datos de demo con la marca anterior ("${PREFIJO_ORG_DEMO_ANTERIOR}…"). Corre primero: npx bun run demo:limpiar`,
    );
  }

  console.log("Cuentas de la demo…");
  const duena = cuentaDemo("duena");
  const pDuena = await asegurarUsuario(duena.email, {
    full_name: duena.nombre,
    tipo_cuenta: "negocio",
    org_name: ORG_DUENA,
  });
  if (!pDuena.org_id) throw new Error("La dueña quedó sin organización.");

  const cajero = cuentaDemo("cajero");
  const pCajero = await asegurarUsuario(cajero.email, { full_name: cajero.nombre }, { invitacionCajero: pDuena.org_id });
  if (pCajero.role !== "cajero" || pCajero.org_id !== pDuena.org_id) {
    throw new Error(`${cajero.email} existe pero no es cajero de ${ORG_DUENA}; revisa a mano.`);
  }

  const red = cuentaDemo("red");
  const pRed = await asegurarUsuario(red.email, { full_name: red.nombre, tipo_cuenta: "negocio", org_name: ORG_RED });
  if (pRed.role !== "admin_red") {
    // El rol solo lo escribe service_role: la red se da de alta como dueña de su org y se promueve.
    const { error } = await db.from("profiles").update({ role: "admin_red" }).eq("id", pRed.id);
    if (error) falla("Dar rol admin_red", error);
  }

  const ids = { negocios: {}, orgs: {}, clientes: {} };
  for (const c of [cuentaDemo("cliente"), ...CLIENTES_EXTRA_DEMO]) {
    await asegurarUsuario(c.email, { full_name: c.nombre, tipo_cuenta: "cliente" });
  }
  for (const email of [cuentaDemo("cliente").email, ...CLIENTES_EXTRA_DEMO.map((c) => c.email), ...VECINOS]) {
    const { data, error } = await db.rpc("cliente_por_email", { _email: email });
    if (error) falla(`Cliente ${email}`, error);
    ids.clientes[email] = data;
  }
  // Nombres de los vecinos (fichas sin cuenta) para que la caja y el dashboard se lean bien.
  const NOMBRES_VECINOS = ["Rosa Jiménez", "Don Pepe Sánchez", "Carmen Ruiz", "Luis Ortega", "Ana Flores", "Toño Vázquez"];
  for (const [k, email] of VECINOS.entries()) {
    await db.from("customers").update({ nombre: NOMBRES_VECINOS[k] }).eq("id", ids.clientes[email]).is("nombre", null);
  }

  console.log("Changarros…");
  for (const n of NEGOCIOS) {
    const orgId = n.slug === "dona-lupita" ? pDuena.org_id : await asegurarDueno(n);
    ids.orgs[n.slug] = orgId;
    ids.negocios[n.slug] = await asegurarNegocio(orgId, n);
  }

  console.log("Expedientes en revisión (con documentos de ejemplo)…");
  for (const n of NEGOCIOS_EN_REVISION) {
    await asegurarNegocioEnRevision(await asegurarDueno(n), n);
  }

  console.log("Cobros de los últimos 30 días…");
  const plan = planDeCobros(new Date(), { "dona-lupita": [pCajero.id, pCajero.id, pDuena.id] });
  const { data: existentes, error } = await db
    .from("charges")
    .select("id, idempotency_key, estado, monto, descuento_puntos")
    .like("idempotency_key", "demo:%")
    .in("business_id", Object.values(ids.negocios));
  if (error) falla("Leer cobros existentes", error);
  const porLlave = new Map(existentes.map((c) => [c.idempotency_key, c]));

  // Un cobro que se quedó pendiente en una corrida interrumpida se termina de pagar.
  for (const c of plan) {
    const previo = porLlave.get(c.llave);
    if (previo?.estado === "pendiente") {
      await pagarYFechar(previo.id, redondear(Number(previo.monto) - Number(previo.descuento_puntos)), c.cuando, c.llave);
    }
  }
  const faltan = plan.filter((c) => !porLlave.has(c.llave));

  // Los cobros de un mismo cliente van en orden (su nivel sube con cada compra);
  // los de mostrador sin cliente van en paralelo.
  const grupos = new Map();
  for (const c of faltan) {
    const clave = c.cliente ?? c.llave;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(c);
  }
  let hechos = 0;
  await enParalelo([...grupos.values()], 8, async (grupo) => {
    for (const c of grupo) {
      await ejecutarCobro(c, ids);
      hechos++;
      if (hechos % 50 === 0) console.log(`  ${hechos}/${faltan.length}`);
    }
  });
  console.log(`  ${faltan.length} cobros nuevos (${plan.length - faltan.length} ya existían).`);

  if (await sqlAdmin(SQL_FECHAR_PUNTOS, "Fechar los movimientos de puntos")) {
    console.log("  Movimientos de puntos fechados como sus cobros.");
  } else {
    console.log(
      "  Aviso: sin SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_ID los movimientos de puntos quedan con la fecha de hoy.",
    );
  }
}

// ---------------------------------------------------------------------------
// SQL con el Management API (solo para lo que el ledger inmutable no deja hacer)
// ---------------------------------------------------------------------------
/** Corre SQL con SUPABASE_ACCESS_TOKEN. Devuelve false si no hay token (no hace nada). */
async function sqlAdmin(query, contexto) {
  const ref = process.env.SUPABASE_PROJECT_ID?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!ref || !token) return false;
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${contexto} falló (HTTP ${r.status}): ${ocultar(await r.text()).slice(0, 500)}`);
  return true;
}

/**
 * Organizaciones de la demo (SQL; misma regla que orgsDemo()): con algún miembro de la demo
 * (o con el nombre de la marca anterior "Demo · …") y SIN ningún miembro ajeno.
 */
const SQL_ORGS_DEMO = `
  select o.id from public.organizations o
   where (
       o.name like '${PREFIJO_ORG_DEMO_ANTERIOR}%'
       or exists (
         select 1 from public.profiles p
          where p.org_id = o.id and lower(p.email) like '%@${DOMINIO_DEMO}'
       )
     )
     and not exists (
       select 1 from public.profiles p
        where p.org_id = o.id and (p.email is null or lower(p.email) not like '%@${DOMINIO_DEMO}')
     )`;

/**
 * El trigger del ledger fecha cada movimiento con now(): sin esto el monedero mostraría toda
 * la historia con la fecha de hoy. Lleva cada movimiento de un cobro de demo ("demo:%") a la
 * fecha de su pago (el canje un minuto antes que la acumulación). Solo datos de demo y solo
 * movimientos que aún no se han fechado: es idempotente. Los cobros hechos en vivo durante la
 * demo no tienen llave "demo:%" y conservan su fecha real.
 */
const SQL_FECHAR_PUNTOS = `
begin;
set local session_replication_role = replica;
update public.point_transactions pt
   set created_at = c.paid_at - case when pt.tipo = 'canje' then interval '1 minute' else interval '0' end
  from public.charges c
 where pt.charge_id = c.id
   and c.idempotency_key like 'demo:%'
   and c.paid_at is not null
   and pt.created_at > c.paid_at + interval '1 minute'
   and pt.org_id in (${SQL_ORGS_DEMO})
   and pt.customer_id in (select id from public.customers where lower(email) like '%@${DOMINIO_DEMO}');
commit;
`;

// ---------------------------------------------------------------------------
// Limpiar
// ---------------------------------------------------------------------------
const SQL_LIMPIEZA = `
begin;
-- Solo organizaciones de la demo (ver SQL_ORGS_DEMO): ningún miembro ajeno.
create temp table _orgs_demo on commit drop as ${SQL_ORGS_DEMO};
create temp table _clientes_demo on commit drop as
  select id from public.customers where lower(email) like '%@${DOMINIO_DEMO}';
create temp table _perfiles_demo on commit drop as
  select id from public.profiles where lower(email) like '%@${DOMINIO_DEMO}';

-- El ledger de puntos y las revisiones KYB son inmutables por trigger. Solo para estos
-- dos borrados (y solo en esta transacción) se apagan los triggers.
set local session_replication_role = replica;
delete from public.point_transactions
 where org_id in (select id from _orgs_demo) or customer_id in (select id from _clientes_demo);
delete from public.kyb_reviews
 where org_id in (select id from _orgs_demo) or reviewer_id in (select id from _perfiles_demo);
set local session_replication_role = origin;

-- Con triggers y llaves foráneas normales: cobros, luego organizaciones (en cascada:
-- perfiles, negocios, cuentas, reglas, movimientos…) y las fichas de clientes.
delete from public.charges where org_id in (select id from _orgs_demo);
delete from public.team_invites where lower(email) like '%@${DOMINIO_DEMO}';
delete from public.organizations where id in (select id from _orgs_demo);
delete from public.customers where id in (select id from _clientes_demo);
commit;
`;

async function limpiar() {
  // 1) Lo mínimo, con service role: que nada de la demo quede en el mapa.
  const orgIds = await orgsDemo();
  if (orgIds.length) {
    const { error } = await db.from("businesses").update({ activo: false, recomendado: false }).in("org_id", orgIds);
    if (error) falla("Retirar negocios del mapa", error);
  }
  console.log(`Negocios de demo retirados del mapa (${orgIds.length} organizaciones).`);

  // 2) Borrado completo con el Management API (el ledger es inmutable para service role).
  if (!(await sqlAdmin(SQL_LIMPIEZA, "La limpieza en la base"))) {
    console.log(
      "Sin SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_ID no se puede borrar el ledger de puntos: los datos quedan retirados, no borrados.",
    );
    return;
  }
  console.log("Datos de demo borrados de la base.");

  // 2b) Documentos KYB de esas organizaciones en Storage (carpeta = org_id).
  let archivos = 0;
  for (const orgId of orgIds) {
    const { data: lista, error } = await db.storage.from("kyb").list(orgId, { limit: 1000 });
    if (error) falla("Listar documentos KYB de demo", error);
    const rutas = (lista ?? []).filter((f) => f.id).map((f) => `${orgId}/${f.name}`);
    if (!rutas.length) continue;
    const { error: e2 } = await db.storage.from("kyb").remove(rutas);
    if (e2) falla("Borrar documentos KYB de demo", e2);
    archivos += rutas.length;
  }
  console.log(`${archivos} documentos KYB de demo borrados de Storage.`);

  // 3) Usuarios de Auth con correo de demo (sus perfiles ya no existen).
  const usuarios = await usuariosAuthDemo();
  for (const u of usuarios) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) falla(`Borrar usuario ${u.email}`, error);
  }
  console.log(`${usuarios.length} usuarios de demo borrados de Auth.`);
}

// ---------------------------------------------------------------------------
async function main() {
  if (SOLO_CONTEOS) {
    console.table(await conteos());
    return;
  }
  if (LIMPIAR) {
    await limpiar();
  } else {
    await sembrar();
    console.log("\nListo. Cuentas para entrar (página /demo con DEMO_MODE=true):");
    for (const c of CUENTAS_DEMO) console.log(`  ${c.etiqueta.padEnd(11)} ${c.email}`);
  }
  console.log("");
  console.table(await conteos());
}

main().catch((e) => {
  console.error(ocultar(e?.message ?? e));
  process.exit(1);
});
