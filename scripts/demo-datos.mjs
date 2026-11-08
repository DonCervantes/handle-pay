#!/usr/bin/env node
// T13 · Datos de demostración en la base compartida de Supabase (service role).
//
//   node --env-file=.env scripts/demo-datos.mjs            # crea o completa la demo (idempotente)
//   node --env-file=.env scripts/demo-datos.mjs --limpiar  # borra TODO lo de la demo y nada más
//   node --env-file=.env scripts/demo-datos.mjs --conteos  # solo muestra cuántos datos de demo hay
//   (atajos: bun run demo:datos, bun run demo:limpiar)
//
// Qué crea (todo marcado: correos @demo.handle-prueba.mx y organizaciones "Demo · …"):
//   * 12 changarros en Santa María la Ribera (CDMX), aprobados y activos (salen en /mapa),
//     con pin, categorías variadas, horario, regla de puntos y 3 recomendados.
//   * Cuentas: dueña (Abarrotes Doña Lupita), cajero, 3 clientes con cuenta, red (admin_red).
//     Los correos y nombres están en src/lib/demo.ts (los usa también /demo).
//   * ~30 días de cobros CoDi pagados (simulados) con clientes identificados: puntos,
//     algunos canjes y niveles distintos (VIP, confianza, nuevo).
//
// Idempotente: cada cobro tiene una llave fija ("demo:<negocio>:<n>"); lo que ya existe no
// se vuelve a crear. Volver a correrlo otro día solo completa lo que falte.
//
// Limpieza: el ledger de puntos es inmutable (trigger), así que el borrado completo usa el
// Management API (SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_ID) en UNA transacción que solo
// toca organizaciones "Demo · …" cuyos miembros son todos @demo.handle-prueba.mx y clientes
// @demo.handle-prueba.mx. Sin ese token, --limpiar al menos retira los negocios del mapa.
//
// Nunca imprime llaves. Solo corre con PAYMENTS_PROVIDER=mock (o sin definir).
import { createClient } from "@supabase/supabase-js";
import {
  CLIENTES_EXTRA_DEMO,
  CUENTAS_DEMO,
  DOMINIO_DEMO,
  NEGOCIO_DUENA,
  ORG_DUENA,
  ORG_RED,
  PREFIJO_ORG_DEMO,
  cuentaDemo,
  esCorreoDemo,
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
    user_metadata: { ...metadatos, ...LEGAL },
  });
  if (error) falla(`Crear ${email}`, error);
  const nuevo = await perfilPorCorreo(email);
  if (!nuevo) throw new Error(`El alta de ${email} no creó perfil.`);
  return { ...nuevo, creado: true };
}

// ---------------------------------------------------------------------------
// Organizaciones y negocios
// ---------------------------------------------------------------------------
async function asegurarOrg(nombre) {
  const { data: existentes, error } = await db.from("organizations").select("id").eq("name", nombre);
  if (error) falla(`Leer organización ${nombre}`, error);
  if (existentes.length) return existentes[0].id;
  const { data, error: e2 } = await db.from("organizations").insert({ name: nombre }).select("id").single();
  if (e2) falla(`Crear organización ${nombre}`, e2);
  // Lo mismo que seed_demo_data() le da a una org nueva: los cobros se ligan a "Cuenta CoDi".
  const { error: e3 } = await db.from("accounts").insert([
    { org_id: data.id, name: "Caja", type: "efectivo" },
    { org_id: data.id, name: "Cuenta CoDi", type: "banco" },
  ]);
  if (e3) falla(`Cuentas de ${nombre}`, e3);
  return data.id;
}

async function asegurarNegocio(orgId, n) {
  const fila = {
    org_id: orgId,
    nombre_comercial: n.nombre,
    razon_social: `${n.nombre} (demostración)`,
    tipo_persona: "fisica",
    rfc: "XAXX010101000",
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
async function conteos() {
  const { data: orgs } = await db.from("organizations").select("id").like("name", `${PREFIJO_ORG_DEMO}%`);
  const orgIds = (orgs ?? []).map((o) => o.id);
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
    const orgId = n.slug === "dona-lupita" ? pDuena.org_id : await asegurarOrg(`${PREFIJO_ORG_DEMO}${n.nombre}`);
    ids.orgs[n.slug] = orgId;
    ids.negocios[n.slug] = await asegurarNegocio(orgId, n);
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
}

// ---------------------------------------------------------------------------
// Limpiar
// ---------------------------------------------------------------------------
const SQL_LIMPIEZA = `
begin;
-- Solo organizaciones "Demo · …" en las que TODOS sus miembros son de la demo.
create temp table _orgs_demo on commit drop as
  select o.id from public.organizations o
   where o.name like '${PREFIJO_ORG_DEMO}%'
     and not exists (
       select 1 from public.profiles p
        where p.org_id = o.id and (p.email is null or lower(p.email) not like '%@${DOMINIO_DEMO}')
     );
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
  const { data: orgs } = await db.from("organizations").select("id").like("name", `${PREFIJO_ORG_DEMO}%`);
  const orgIds = (orgs ?? []).map((o) => o.id);
  if (orgIds.length) {
    const { error } = await db.from("businesses").update({ activo: false, recomendado: false }).in("org_id", orgIds);
    if (error) falla("Retirar negocios del mapa", error);
  }
  console.log(`Negocios de demo retirados del mapa (${orgIds.length} organizaciones).`);

  // 2) Borrado completo con el Management API (el ledger es inmutable para service role).
  const ref = process.env.SUPABASE_PROJECT_ID?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!ref || !token) {
    console.log(
      "Sin SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_ID no se puede borrar el ledger de puntos: los datos quedan retirados, no borrados.",
    );
    return;
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: SQL_LIMPIEZA }),
  });
  if (!r.ok) throw new Error(`La limpieza en la base falló (HTTP ${r.status}): ${ocultar(await r.text()).slice(0, 500)}`);
  console.log("Datos de demo borrados de la base.");

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
