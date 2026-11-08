#!/usr/bin/env node
// T18 · Grabaciones del video de demo: Playwright recorre cada escena de video/escenas.json
// siguiendo DEMO.md y guarda un .webm por escena en MEDIA/grabaciones/ (no versionado).
//
//   node video/grabar/grabar.mjs                    # reinicia los datos de demo y graba todo
//   node video/grabar/grabar.mjs --escena e2-cajero-cobra --sin-reset
//   node video/grabar/grabar.mjs --puerto 8111 --env /ruta/.env --media /ruta/media
//
// Usa la app en modo demo (DEMO_MODE=true, PAYMENTS_PROVIDER=mock, `vite dev`): si ya responde en
// el puerto la reutiliza; si no, la levanta con scripts/demo.mjs y la apaga al terminar.
// Antes de grabar deja los datos limpios (`demo:limpiar` + `demo:datos`), porque las escenas los
// cambian (regla al 10 %, un cobro, un recomendado y un pin). Las escenas dependen unas de otras
// (e2 usa el 10 % de e1, e3 el cobro de e2, e4 la regla de e1): grabar una sola es para ensayar.
//
// Formato (decisión para T20): todos los clips miden 1920×1080. El video de Playwright se captura
// en píxeles CSS (ignora deviceScaleFactor), así que la app corre dentro de un <iframe> con CSS
// `zoom` en una página marco (misma URL de origen, servida con page.route): adentro la app ve su
// ancho real (media queries correctas) y un devicePixelRatio alto, y el texto sale nítido.
//   * Escritorio: iframe de 1536×864 con zoom 1.25 que llena el cuadro (= zoom 125 % de DEMO.md).
//   * e3 (celular): iframe de 390×844 con zoom 1.18 dentro de un marco de teléfono centrado sobre
//     fondo crema de Handle. T20 lo usa tal cual (no hay que recortar ni girar).
//   * Cursor visible inyectado (flecha en escritorio, círculo de dedo en celular) con pulso al clic.
//   * MEDIA/grabaciones/marcas.json: por escena duración, tamaño, `inicio` (primer cuadro útil:
//     antes solo hay pantalla en blanco) y los segundos de los momentos clave.
// Nunca imprime valores del .env.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRATO = JSON.parse(readFileSync(join(RAIZ, "video/escenas.json"), "utf8"));

const CUADRO = { width: 1920, height: 1080 };
/** Tamaño CSS de la app dentro del marco y su zoom. */
const ESCRITORIO = { app: { width: 1536, height: 864 }, zoom: 1.25, movil: false };
const CELULAR = { app: { width: 390, height: 844 }, zoom: 1.18, movil: true };
const RUTA_MARCO = "/__marco-grabacion";

/** Página marco: la app en un iframe (mismo origen) con zoom. */
function htmlMarco(perfil, src) {
  const { width, height } = perfil.app;
  const iframe = `<iframe id="app" src="${src}" style="display:block;width:${width}px;height:${height}px;border:0;zoom:${perfil.zoom};background:#f4f1ea"></iframe>`;
  const cuerpo = perfil.movil
    ? `<div style="padding:12px;border-radius:52px;background:#1d1b18;box-shadow:0 30px 70px rgba(29,27,24,.35),0 0 0 2px #3a362f inset"><div style="border-radius:40px;overflow:hidden">${iframe}</div></div>`
    : iframe;
  const fondo = perfil.movil
    ? "radial-gradient(circle at 50% 40%,#f4efe3 0,#e6dcc8 75%)"
    : "#f4f1ea";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Handle</title></head><body style="margin:0;width:100vw;height:100vh;overflow:hidden;display:grid;place-items:center;background:${fondo}">${cuerpo}</body></html>`;
}

function leerBanderas(argv) {
  const b = {
    puerto: 8111,
    env: join(RAIZ, ".env"),
    media: process.env.VIDEO_MEDIA ?? CONTRATO.media,
    escenas: [],
    reset: true,
    url: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--puerto") b.puerto = Number(argv[++i]);
    else if (a === "--env") b.env = resolve(argv[++i]);
    else if (a === "--media") b.media = resolve(argv[++i]);
    else if (a === "--escena") b.escenas.push(argv[++i]);
    else if (a === "--url") b.url = argv[++i].replace(/\/+$/, "");
    else if (a === "--sin-reset") b.reset = false;
    else if (a === "--solo-medir") b.soloMedir = true;
    else throw new Error(`Opción desconocida: ${a}`);
  }
  b.url ??= `http://localhost:${b.puerto}`;
  return b;
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// App y datos

async function saludDemo(base) {
  try {
    const r = await fetch(`${base}/api/health`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function asegurarApp(b) {
  const s = await saludDemo(b.url);
  if (s?.demo) return null;
  if (s)
    throw new Error(`Hay una app en ${b.url} pero sin modo demo. Detenla o usa otro --puerto.`);
  console.log(`Levantando la app en modo demo en el puerto ${b.puerto}…`);
  const proc = spawn(
    process.execPath,
    [join(RAIZ, "scripts/demo.mjs"), "--puerto", String(b.puerto), "--env", b.env],
    {
      cwd: RAIZ,
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    if ((await saludDemo(b.url))?.demo) return proc;
    if (proc.exitCode !== null) throw new Error("La app de demo se detuvo al arrancar.");
    await pausa(1000);
  }
  proc.kill();
  throw new Error("La app de demo no respondió en 120 s.");
}

function reiniciarDatos(b) {
  for (const extra of [["--limpiar"], []]) {
    console.log(extra.length ? "Limpiando datos de demo…" : "Sembrando datos de demo…");
    const r = spawnSync(
      process.execPath,
      [`--env-file=${b.env}`, join(RAIZ, "scripts/demo-datos.mjs"), ...extra],
      {
        cwd: RAIZ,
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
    if (r.status !== 0)
      throw new Error(`demo-datos ${extra.join(" ")} falló (código ${r.status}).`);
  }
}

// ---------------------------------------------------------------------------------------------
// Cursor visible

/** Corre en la página: dibuja un cursor que sigue al mouse y un pulso en cada clic. */
function instalarCursor({ movil }) {
  // Solo dentro del iframe de la app: ahí llegan los eventos del mouse.
  if (window.top === window) return;
  const CLAVE = "__cursorGrabacion";
  let pos;
  try {
    pos = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null");
  } catch {
    pos = null;
  }
  pos ??= { x: innerWidth * 0.6, y: innerHeight * 0.55 };
  const cursor = document.createElement("div");
  cursor.id = "__cursor";
  const base =
    "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;transition:none;";
  if (movil) {
    cursor.style.cssText = `${base}width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(17,24,39,.28);border:2px solid rgba(255,255,255,.95);box-shadow:0 1px 6px rgba(0,0,0,.35);`;
  } else {
    cursor.style.cssText = `${base}width:30px;height:30px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));`;
    cursor.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5l15.5 11.2-7.1.9 4 7.6-3 1.6-4-7.7L4 21z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }
  const pintar = () => {
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  };
  pintar();
  const montar = () => {
    if (!document.documentElement.contains(cursor)) document.documentElement.appendChild(cursor);
  };
  if (document.documentElement) montar();
  document.addEventListener("DOMContentLoaded", montar);
  setInterval(montar, 300);
  addEventListener(
    "mousemove",
    (e) => {
      pos = { x: e.clientX, y: e.clientY };
      pintar();
      try {
        sessionStorage.setItem(CLAVE, JSON.stringify(pos));
      } catch {
        // Sin sessionStorage: el cursor arranca al centro en cada página.
      }
    },
    true,
  );
  addEventListener(
    "mousedown",
    (e) => {
      const p = document.createElement("div");
      const t = movil ? 70 : 46;
      p.style.cssText = `position:fixed;left:${e.clientX - t / 2}px;top:${e.clientY - t / 2}px;width:${t}px;height:${t}px;border-radius:50%;border:3px solid #f59e0b;background:rgba(245,158,11,.22);z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out;transform:scale(.4);opacity:1;`;
      document.documentElement.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform = "scale(1.25)";
        p.style.opacity = "0";
      });
      setTimeout(() => p.remove(), 600);
      cursor.style.scale = "0.85";
    },
    true,
  );
  addEventListener("mouseup", () => (cursor.style.scale = "1"), true);
}

// ---------------------------------------------------------------------------------------------
// Acciones lentas y legibles

class Guion {
  constructor(page, app, base, t0, marco) {
    /** Dónde queda el iframe en el cuadro y su zoom: convierte coordenadas de la app a la página. */
    this.marco = marco;
    /** Página marco: el mouse se mueve en sus coordenadas. */
    this.page = page;
    /** Frame de la app (dentro del iframe): ahí se buscan los elementos. */
    this.app = app;
    this.base = base;
    this.t0 = t0;
    this.x = CUADRO.width * 0.6;
    this.y = CUADRO.height * 0.55;
    this.momentos = [];
    this.inicio = null;
  }

  ahora() {
    return Math.round((Date.now() - this.t0) / 10) / 100;
  }

  /** Marca un momento clave (segundos desde el inicio del clip). */
  marca(nombre) {
    const t = this.ahora();
    if (nombre === "inicio") this.inicio = t;
    else this.momentos.push({ nombre, t });
    console.log(`    ${t.toFixed(2).padStart(6)} s  ${nombre}`);
  }

  /** Navega el iframe de la app a una ruta. */
  async ir(ruta) {
    await this.app.goto(`${this.base}${ruta}`);
  }

  async esperar(ms) {
    await this.page.waitForTimeout(ms);
  }

  /** Mueve el cursor con aceleración suave (ease-in-out). */
  async moverA(x, y, ms = 750) {
    const pasos = Math.max(8, Math.round(ms / 16));
    const [x0, y0] = [this.x, this.y];
    for (let i = 1; i <= pasos; i++) {
      const t = i / pasos;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await this.page.waitForTimeout(ms / pasos);
    }
    this.x = x;
    this.y = y;
  }

  /** Desplaza la página con suavidad hasta que el elemento quede a la vista. */
  async mostrar(locator, bloque = "center") {
    await locator.waitFor({ state: "visible" });
    const dentro = await locator.evaluate((el, bloque) => {
      const r = el.getBoundingClientRect();
      const visible = r.top >= 70 && r.bottom <= innerHeight - 30;
      if (!visible) el.scrollIntoView({ behavior: "smooth", block: bloque });
      return visible;
    }, bloque);
    if (!dentro) await this.esperar(1100);
  }

  /** Centro del elemento en coordenadas de la página marco. Playwright no toma en cuenta el
   *  `zoom` del iframe en boundingBox(), así que se calcula a mano. */
  async centro(locator) {
    const r = await locator.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    const { x: ox, y: oy, zoom } = this.marco;
    const caja = {
      x: ox + r.x * zoom,
      y: oy + r.y * zoom,
      width: r.width * zoom,
      height: r.height * zoom,
    };
    return { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2, caja };
  }

  /** Lleva el cursor a un elemento (y lo deja ahí). */
  async señalar(locator, { ms = 800, dx = 0, dy = 0, bloque } = {}) {
    await this.mostrar(locator, bloque);
    const { x, y, caja } = await this.centro(locator);
    const ox = dx === "izq" ? -caja.width / 2 - 16 : dx;
    await this.moverA(x + ox, y + dy, ms);
  }

  async clic(locator, opciones = {}) {
    await this.señalar(locator, opciones);
    await this.esperar(opciones.antes ?? 350);
    await this.page.mouse.down();
    await this.esperar(110);
    await this.page.mouse.up();
    await this.esperar(opciones.despues ?? 500);
  }

  async escribir(locator, texto, { retraso = 140 } = {}) {
    await this.clic(locator, { despues: 250 });
    await locator.selectText().catch(() => {});
    await this.page.keyboard.press("Backspace");
    await this.esperar(250);
    await locator.pressSequentially(texto, { delay: retraso });
    await this.esperar(500);
  }

  /** Desplaza la página n píxeles con suavidad. */
  async desplazar(dy, ms = 1200) {
    await this.app.evaluate((dy) => scrollBy({ top: dy, behavior: "smooth" }), dy);
    await this.esperar(ms);
  }

  async arriba() {
    await this.app.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
    await this.esperar(1100);
  }
}

/** Espera a que la red se calme (mosaicos del mapa), sin fallar si nunca se calma. */
async function calma(app, ms = 8000) {
  await app
    .page()
    .waitForLoadState("networkidle", { timeout: ms })
    .catch(() => {});
  await app.waitForLoadState("networkidle", { timeout: ms }).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// Escenas (DEMO.md)

async function entrarDesdeDemo(g, boton, destino) {
  const { app: page } = g;
  await g.ir("/demo");
  await page.getByRole("button", { name: new RegExp(boton) }).waitFor();
  await calma(page, 4000);
  // Los botones se habilitan al hidratar.
  await page.waitForFunction(() =>
    [...document.querySelectorAll("main button")].some((b) => !b.disabled),
  );
  g.marca("inicio");
  await g.esperar(1500);
  await g.clic(page.getByRole("button", { name: new RegExp(boton) }), { ms: 1000 });
  await page.waitForURL(destino, { timeout: 30_000 });
}

const ESCENAS = {
  /** §0 Gancho: el mapa de Santa María la Ribera, filtros y recomendados. */
  async "e0-gancho"(g) {
    const { app: page } = g;
    await g.ir("/mapa");
    await page.getByText("Abarrotes Doña Lupita").first().waitFor();
    await calma(page);
    await g.esperar(1500);
    g.marca("inicio");
    await g.esperar(1500);
    // "Cada punto es un changarro…": recorre unos pines del mapa.
    const mapa = page.locator(".maplibregl-canvas").first();
    const { caja } = await g.centro(mapa);
    await g.moverA(caja.x + caja.width * 0.35, caja.y + caja.height * 0.4, 1400);
    g.marca("pines");
    await g.moverA(caja.x + caja.width * 0.6, caja.y + caja.height * 0.55, 1600);
    await g.esperar(800);
    const estrellas = page.locator('[aria-label$="(recomendado)"]');
    if ((await estrellas.count()) > 0) {
      g.marca("estrellas");
      for (let i = 0; i < Math.min(2, await estrellas.count()); i++) {
        await g.señalar(estrellas.nth(i), { ms: 1000 });
        await g.esperar(900);
      }
    }
    // Filtros por categoría.
    const barra = page.getByRole("toolbar", { name: "Filtrar por tipo de negocio" });
    g.marca("filtros");
    for (const nombre of ["Abarrotes", "Taquería", "Panadería"]) {
      const chip = barra.getByRole("button", { name: new RegExp(`^${nombre}`) });
      if (await chip.count()) {
        await g.señalar(chip.first(), { ms: 700 });
        await g.esperar(700);
      }
    }
    await g.clic(barra.getByRole("button", { name: /Recomendados/ }), { ms: 900 });
    g.marca("recomendados");
    await g.esperar(3000);
    await g.señalar(page.getByRole("region", { name: "Lista de negocios" }), {
      ms: 1000,
      dy: -120,
    });
    await g.esperar(2500);
  },

  /** §1 La dueña ve su dashboard y sube los puntos al 10 %. */
  async "e1-duena-puntos"(g) {
    const { app: page } = g;
    await entrarDesdeDemo(g, "Entrar como dueña", /\/dashboard/);
    await page.getByText("Ventas de hoy", { exact: true }).waitFor();
    await calma(page, 6000);
    g.marca("dashboard");
    await g.esperar(1500);
    await g.señalar(page.getByText("Ventas de hoy", { exact: true }), { ms: 1000 });
    await g.esperar(2000);
    await g.desplazar(420, 1600);
    g.marca("quienCobro");
    await g.esperar(3000);
    await g.desplazar(450, 1600);
    g.marca("treintaDias");
    await g.esperar(2500);
    await g.arriba();
    await g.esperar(1000);
    await g.clic(page.getByRole("link", { name: "Mi negocio" }).first(), { ms: 1000 });
    await page.waitForURL(/\/negocio/);
    const porcentaje = page.getByLabel("Puntos por cada $100 (%)");
    await porcentaje.waitFor();
    await calma(page, 4000);
    const tarjeta = page.locator("form", { has: porcentaje });
    await g.mostrar(page.getByText("Programa de puntos", { exact: true }), "start");
    await g.desplazar(-80, 600);
    g.marca("programa");
    await g.señalar(porcentaje, { ms: 900 });
    await g.esperar(1500);
    await g.escribir(porcentaje, "10", { retraso: 260 });
    g.marca("regla10");
    await g.esperar(1200);
    await g.señalar(page.getByLabel("Máximo a pagar con puntos (%)"), { ms: 900 });
    await g.esperar(1500);
    const ejemplo = tarjeta.getByText(/Ejemplo: en una compra/);
    await g.señalar(ejemplo, { ms: 900, dx: "izq" });
    g.marca("vistaPrevia");
    await g.esperar(3500);
    await g.clic(tarjeta.getByRole("button", { name: "Guardar cambios" }), { ms: 900 });
    await page.getByText("Programa de puntos guardado").waitFor();
    g.marca("guardado");
    await g.esperar(3500);
  },

  /** §2 Beto cobra $250 a Mariana, ella usa 50 puntos y paga $200 por CoDi (simulado). */
  async "e2-cajero-cobra"(g) {
    const { app: page } = g;
    await entrarDesdeDemo(g, "Entrar como cajero", /\/caja/);
    const monto = page.getByLabel("¿Cuánto vas a cobrar?");
    await monto.waitFor();
    await calma(page, 5000);
    g.marca("caja");
    await g.esperar(800);
    await g.escribir(monto, "250", { retraso: 220 });
    g.marca("monto");
    await g.esperar(400);
    await g.clic(page.getByRole("radio", { name: /Código QR/ }), { ms: 800 });
    await g.esperar(400);
    await g.escribir(page.getByLabel("Correo del cliente"), "mariana@demo.handle-prueba.mx", {
      retraso: 70,
    });
    await g.clic(page.getByRole("button", { name: "Buscar" }), { ms: 700 });
    const saldo = page.getByText(/Saldo aquí:/);
    await saldo.waitFor();
    g.marca("clienta");
    await g.señalar(saldo, { ms: 800 });
    await g.esperar(2200);
    const puntos = page.getByLabel("Usar puntos");
    await g.escribir(puntos, "50", { retraso: 300 });
    const aCobrar = page.getByText("A cobrar", { exact: true });
    await aCobrar.waitFor();
    g.marca("descuento");
    await g.señalar(aCobrar, { ms: 900, bloque: "center" });
    await g.esperar(2200);
    await g.clic(page.getByRole("button", { name: /Cobrar \$200\.00/ }), { ms: 900 });
    const qr = page.getByAltText("Código QR para pagar con CoDi");
    await qr.waitFor({ timeout: 20_000 });
    await g.mostrar(qr);
    g.marca("qr");
    await g.señalar(qr, { ms: 1000 });
    await g.esperar(5500);
    await g.señalar(page.getByText(/Ganará|ganará/).first(), { ms: 900 }).catch(() => {});
    await g.esperar(3500);
    await g.clic(page.getByRole("button", { name: /Simular pago del cliente/ }), { ms: 1000 });
    await page.getByText("¡Pagado!").waitFor({ timeout: 20_000 });
    await g.mostrar(page.getByRole("status").filter({ hasText: "¡Pagado!" }));
    g.marca("pagado");
    await g.esperar(1500);
    await g.señalar(page.getByText(/Ganó|ganó/).first(), { ms: 900 }).catch(() => {});
    await g.esperar(4500);
  },

  /** §3 Mariana ve su monedero en el celular. */
  async "e3-monedero"(g) {
    const { app: page } = g;
    await g.ir("/monedero");
    await page.getByRole("heading", { name: "Mis puntos" }).waitFor();
    await page.getByText("Abarrotes Doña Lupita").first().waitFor();
    await calma(page, 5000);
    await g.esperar(800);
    g.marca("inicio");
    await g.esperar(3500);
    await g.señalar(page.getByText("VIP", { exact: true }).first(), { ms: 900 });
    g.marca("nivel");
    await g.esperar(5000);
    await g.señalar(page.getByText("Abarrotes Doña Lupita").first(), { ms: 900 });
    g.marca("saldos");
    await g.esperar(5000);
    await g.desplazar(260, 1500);
    await g.esperar(3500);
    await g.desplazar(320, 1500);
    await g.esperar(3000);
    const usaste = page.getByText(/Usaste/).first();
    if (await usaste.count()) {
      await g.señalar(usaste, { ms: 900, dx: 140 });
      g.marca("historial");
      await g.esperar(5500);
    } else {
      await g.desplazar(400, 1500);
      g.marca("historial");
      await g.esperar(4500);
    }
    await g.desplazar(300, 1500);
    await g.esperar(3000);
  },

  /** §4 Mapa público: filtro Abarrotes y el perfil de Doña Lupita con la promo del 10 %. */
  async "e4-mapa-perfil"(g) {
    const { app: page } = g;
    await g.ir("/mapa");
    await page.getByText("Abarrotes Doña Lupita").first().waitFor();
    await calma(page);
    await g.esperar(1200);
    g.marca("inicio");
    await g.esperar(2500);
    // "Puedes tocar la estrella de un negocio, o buscarlo en la lista".
    const estrella = page.locator('[aria-label$="(recomendado)"]').first();
    if (await estrella.count()) {
      await g.señalar(estrella, { ms: 1100 });
      g.marca("estrella");
      await g.esperar(1800);
    }
    await g.señalar(page.getByRole("region", { name: "Lista de negocios" }), {
      ms: 1100,
      dy: -120,
    });
    await g.esperar(1800);
    const barra = page.getByRole("toolbar", { name: "Filtrar por tipo de negocio" });
    await g.clic(barra.getByRole("button", { name: /^Abarrotes/ }), { ms: 1000 });
    g.marca("filtro");
    await g.esperar(3000);
    await g.clic(page.getByRole("link", { name: "Ver perfil de Abarrotes Doña Lupita" }), {
      ms: 1100,
    });
    await page.waitForURL(/\/mapa\/[^/?]+/);
    await page
      .getByRole("heading", { name: /Abarrotes Doña Lupita/ })
      .first()
      .waitFor();
    await calma(page, 6000);
    g.marca("perfil");
    await g.esperar(2500);
    const horario = page.getByText("Horario", { exact: true }).first();
    if (await horario.count()) {
      await g.señalar(horario, { ms: 900, dx: "izq" });
      g.marca("horario");
      await g.esperar(6000);
    }
    await page
      .getByText(/Gana 10 puntos/)
      .first()
      .waitFor();
    const promo = page.getByText("Promociones", { exact: true }).first();
    await g.señalar(promo, { ms: 900, dx: "izq" });
    g.marca("promo");
    await g.esperar(6500);
    const pagar = page.getByText("Cómo pagar", { exact: true }).first();
    if (await pagar.count()) {
      await g.señalar(pagar, { ms: 900, dx: "izq" });
      g.marca("comoPagar");
      await g.esperar(6000);
    }
    await g.esperar(4000);
  },

  /** §5 La red recomienda a Frutería Doña Chela y le corrige el pin. */
  async "e5-red"(g) {
    const { app: page } = g;
    await entrarDesdeDemo(g, "Entrar como red", /\/red/);
    await calma(page, 5000);
    const aprobados = page.getByRole("tab", { name: "Aprobados" });
    await g.clic(aprobados, { ms: 1000 });
    const fila = page.getByRole("row", { name: /Frutería Doña Chela/ });
    await fila.waitFor();
    await calma(page, 3000);
    g.marca("aprobados");
    await g.señalar(page.getByRole("row").nth(1), { ms: 900, dx: "izq" });
    await g.esperar(800);
    await g.moverA(g.x, g.y + 220, 1600);
    await g.esperar(1200);
    await g.clic(fila.getByRole("link", { name: "Ver" }), { ms: 1100 });
    await page.waitForURL(/\/red\/[^/?]+/);
    const interruptor = page.getByRole("switch", { name: "Negocio recomendado" });
    await interruptor.waitFor();
    await calma(page, 5000);
    g.marca("expediente");
    await g.esperar(2500);
    await g.clic(interruptor, { ms: 1000 });
    await page.getByText("Negocio recomendado: se destaca en el mapa.").waitFor();
    g.marca("recomendado");
    await g.esperar(1500);
    await g.clic(page.getByRole("button", { name: "Mover pin" }), { ms: 1000 });
    const pin = page.locator('[data-pin-editable="1"]');
    await pin.waitFor();
    await calma(page, 3000);
    await g.mostrar(page.getByTestId("selector-ubicacion"));
    await g.esperar(800);
    // Arrastra el pin a la esquina de enfrente.
    await g.señalar(pin, { ms: 900 });
    await g.esperar(500);
    await g.page.mouse.down();
    await g.esperar(250);
    await g.moverA(g.x + 95, g.y - 70, 1600);
    await g.esperar(250);
    await g.page.mouse.up();
    g.marca("pinMovido");
    await g.esperar(1000);
    await g.clic(page.getByRole("button", { name: "Guardar ubicación" }), { ms: 1000 });
    await page.getByText("Ubicación actualizada en el mapa.").waitFor();
    g.marca("ubicacionGuardada");
    await g.esperar(1000);
    // "Ver perfil público" abre otra pestaña; en el video se abre en la misma.
    const verPerfil = page.getByRole("link", { name: "Ver perfil público" });
    await verPerfil.evaluate((a) => a.removeAttribute("target"));
    await g.clic(verPerfil, { ms: 1000 });
    await page.waitForURL(/\/mapa\/[^/?]+/);
    await page
      .getByRole("heading", { name: /Frutería Doña Chela/ })
      .first()
      .waitFor();
    await calma(page, 6000);
    g.marca("perfilPublico");
    await g.esperar(2500);
    await g.ir("/mapa?recomendados=true");
    await page.getByText("Frutería Doña Chela").first().waitFor();
    await calma(page);
    await g.esperar(800);
    g.marca("mapaConEstrella");
    const estrella = page.locator('[aria-label="Frutería Doña Chela (recomendado)"]');
    if (await estrella.count()) {
      await g.clic(estrella.first(), { ms: 1200 });
      await g.esperar(3500);
    } else {
      await g.esperar(3500);
    }
  },
};

// ---------------------------------------------------------------------------------------------

/** Sesión del celular de Mariana: en DEMO.md el celular ya está en /monedero antes de la escena. */
async function sesionCliente(browser, b) {
  const ctx = await browser.newContext({
    viewport: CELULAR.app,
    baseURL: b.url,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
  });
  const page = await ctx.newPage();
  await page.goto("/demo");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("main button")].some((x) => !x.disabled),
  );
  await page.getByRole("button", { name: /Entrar como cliente/ }).click();
  await page.waitForURL(/\/monedero/, { timeout: 30_000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

/** ffprobe o, si no hay, ffmpeg (variables FFPROBE / FFMPEG o en el PATH). */
function sonda() {
  for (const [tipo, c] of [
    ["ffprobe", process.env.FFPROBE],
    ["ffprobe", "ffprobe"],
    ["ffmpeg", process.env.FFMPEG],
    ["ffmpeg", "ffmpeg"],
  ]) {
    if (!c) continue;
    const r = spawnSync(c, ["-version"], { stdio: "ignore" });
    if (r.status === 0) return { tipo, c };
  }
  return null;
}

/** Duración y tamaño reales del archivo. Cuenta los paquetes de video: el webm de Playwright
 *  no siempre trae la duración en el encabezado. */
function medir(herramienta, archivo) {
  if (!herramienta) return null;
  if (herramienta.tipo === "ffprobe") {
    const r = spawnSync(
      herramienta.c,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:packet=pts_time",
        "-of",
        "json",
        archivo,
      ],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (r.status !== 0) return null;
    const j = JSON.parse(r.stdout);
    const tiempos = (j.packets ?? []).map((p) => Number(p.pts_time)).filter(Number.isFinite);
    return {
      ancho: j.streams?.[0]?.width,
      alto: j.streams?.[0]?.height,
      duracion: tiempos.length ? Math.max(...tiempos) : null,
    };
  }
  // ffmpeg: decodifica sin escribir nada y lee el último "time=" del progreso.
  const r = spawnSync(
    herramienta.c,
    ["-hide_banner", "-i", archivo, "-map", "0:v:0", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const tam = r.stderr.match(/Video:.*?(\d{3,5})x(\d{3,5})/);
  const ts = [...r.stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
  return {
    ancho: tam ? Number(tam[1]) : undefined,
    alto: tam ? Number(tam[2]) : undefined,
    duracion: ts ? Number(ts[1]) * 3600 + Number(ts[2]) * 60 + Number(ts[3]) : null,
  };
}

async function grabar(browser, b, escena, carpeta, estadoCliente) {
  const movil = escena.dispositivo === "celular";
  const perfil = movil ? CELULAR : ESCRITORIO;
  const marco = `${b.url}${RUTA_MARCO}`;
  const tmp = join(carpeta, `.tmp-${escena.id}`);
  rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: CUADRO,
    recordVideo: { dir: tmp, size: CUADRO },
    baseURL: b.url,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    ...(movil && estadoCliente ? { storageState: estadoCliente } : {}),
  });
  await ctx.addInitScript(instalarCursor, { movil });
  ctx.setDefaultTimeout(30_000);
  await ctx.route(marco, (r) =>
    r.fulfill({ contentType: "text/html; charset=utf-8", body: htmlMarco(perfil, "about:blank") }),
  );
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(marco);
  const app =
    page.frame({ url: "about:blank" }) ?? page.frames().find((f) => f !== page.mainFrame());
  const ifr = await page.locator("#app").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  const g = new Guion(page, app, b.url, t0, { ...ifr, zoom: perfil.zoom });
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  try {
    // Tope por escena: una espera colgada no debe dejar el navegador grabando para siempre.
    let tope;
    await Promise.race([
      ESCENAS[escena.id](g),
      new Promise(
        (_, no) =>
          (tope = setTimeout(() => no(new Error(`${escena.id}: pasó de 4 minutos`)), 240_000)),
      ),
    ]).finally(() => clearTimeout(tope));
  } finally {
    const video = page.video();
    await ctx.close();
    const origen = await video.path();
    renameSync(origen, join(carpeta, `${escena.id}.webm`));
    rmSync(tmp, { recursive: true, force: true });
  }
  if (errores.length) console.log(`    Avisos de la página: ${errores.slice(0, 3).join(" | ")}`);
  return { inicio: g.inicio ?? 0, duracionGuion: g.ahora(), momentos: g.momentos, movil, perfil };
}

async function main() {
  const b = leerBanderas(process.argv.slice(2));
  if (!existsSync(b.env)) throw new Error(`No existe el archivo de variables ${b.env}.`);
  const todas = CONTRATO.escenas.filter((e) => e.grabacion);
  const elegidas = b.escenas.length ? todas.filter((e) => b.escenas.includes(e.id)) : todas;
  if (!elegidas.length)
    throw new Error(`Escena desconocida. Opciones: ${todas.map((e) => e.id).join(", ")}`);
  const carpeta = join(b.media, "grabaciones");
  mkdirSync(carpeta, { recursive: true });

  const rutaMarcas = join(carpeta, "marcas.json");
  const marcas = existsSync(rutaMarcas)
    ? JSON.parse(readFileSync(rutaMarcas, "utf8"))
    : { escenas: {} };
  const ffprobe = sonda();
  if (!ffprobe)
    console.log("Aviso: sin ffprobe/ffmpeg (usa FFPROBE o FFMPEG); la duración será la del guion.");
  if (b.soloMedir) {
    // Vuelve a medir los clips ya grabados (sin grabar ni tocar datos).
    for (const escena of elegidas) {
      const m = marcas.escenas[escena.id];
      const medida = m && medir(ffprobe, join(carpeta, `${escena.id}.webm`));
      if (!medida?.duracion) throw new Error(`No pude medir ${escena.id}.`);
      Object.assign(m, {
        ancho: medida.ancho,
        alto: medida.alto,
        duracion: Math.round(medida.duracion * 100) / 100,
      });
      console.log(
        `${escena.id}: ${m.duracion} s, ${m.ancho}×${m.alto}, útil ${(m.duracion - m.inicio).toFixed(1)} s, audio ${m.audio ?? "?"} s`,
      );
    }
    writeFileSync(rutaMarcas, `${JSON.stringify(marcas, null, 2)}\n`);
    return;
  }
  const app = await asegurarApp(b);
  const browser = await chromium.launch();
  // Duraciones de la narración (T19), si ya existen: para comparar cada clip con su audio.
  const rutaDuraciones = join(b.media, "narracion/duraciones.json");
  const duraciones = existsSync(rutaDuraciones)
    ? JSON.parse(readFileSync(rutaDuraciones, "utf8"))
    : null;
  try {
    if (b.reset) reiniciarDatos(b);
    const necesitaCliente = elegidas.some((e) => e.dispositivo === "celular");
    for (const escena of elegidas) {
      console.log(`Grabando ${escena.id}…`);
      // La sesión del celular se abre justo antes de su escena (DEMO.md: ya estaba en /monedero).
      const estado =
        escena.dispositivo === "celular" && necesitaCliente
          ? await sesionCliente(browser, b)
          : null;
      const r = await grabar(browser, b, escena, carpeta, estado);
      const archivo = join(carpeta, `${escena.id}.webm`);
      const medida = medir(ffprobe, archivo);
      marcas.escenas[escena.id] = {
        archivo: `grabaciones/${escena.id}.webm`,
        dispositivo: r.movil ? "celular" : "escritorio",
        ancho: medida?.ancho ?? CUADRO.width,
        alto: medida?.alto ?? CUADRO.height,
        appCss: { ...r.perfil.app, zoom: r.perfil.zoom },
        duracion: Math.round((medida?.duracion ?? r.duracionGuion) * 100) / 100,
        inicio: r.inicio,
        momentos: r.momentos,
        grabadoEl: new Date().toISOString(),
      };
      const audio = duraciones?.escenas?.[escena.id]?.segundos;
      if (audio) {
        const util = marcas.escenas[escena.id].duracion - r.inicio;
        marcas.escenas[escena.id].audio = audio;
        console.log(
          `  Útil ${util.toFixed(1)} s vs narración ${audio.toFixed(1)} s (${Math.round((util / audio - 1) * 100)} %)`,
        );
      }
      console.log(
        `  → ${archivo} (${marcas.escenas[escena.id].duracion} s, ${marcas.escenas[escena.id].ancho}×${marcas.escenas[escena.id].alto})`,
      );
    }
  } finally {
    await browser.close();
    app?.kill();
  }
  marcas._doc =
    "T18 · Generado por video/grabar/grabar.mjs. Tiempos en segundos desde el primer cuadro del clip. " +
    "`inicio` = primer cuadro útil (antes solo hay página en blanco o cargando). Todos los clips son 1920×1080. " +
    "Escritorio: la app a 1536×864 CSS con zoom 1.25 (llena el cuadro). e3 (celular): la app a 390×844 CSS con zoom 1.18 dentro de un " +
    "marco de teléfono centrado sobre fondo crema; T20 lo usa tal cual.";
  marcas.escenas = Object.fromEntries(
    CONTRATO.escenas.filter((e) => marcas.escenas[e.id]).map((e) => [e.id, marcas.escenas[e.id]]),
  );
  writeFileSync(rutaMarcas, `${JSON.stringify(marcas, null, 2)}\n`);
  console.log(`Marcas: ${rutaMarcas}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
