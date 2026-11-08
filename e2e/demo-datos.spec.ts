// T13 · Los datos de demo (scripts/demo-datos.mjs) se ven en la app con cada rol.
// Solo LEE: entra con las cuentas @demo.handle-prueba.mx y no cobra ni cambia nada.
// Si la demo no está sembrada, se salta: node --env-file=.env scripts/demo-datos.mjs
import { test, expect, type Page } from "@playwright/test";
import { NEGOCIOS_EN_REVISION_DEMO, NEGOCIO_DUENA, cuentaDemo } from "../src/lib/demo";
import { entrarConMagicLink, usuarioPorCorreo } from "./soporte/supabase";

const CAPTURAS = process.env["E2E_CAPTURAS"];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const sembrada = await usuarioPorCorreo(cuentaDemo("duena").email);
  test.skip(!sembrada, "La demo no está sembrada (scripts/demo-datos.mjs).");
});

/** Junta errores de consola y de página; al final de cada prueba deben ser cero. */
function vigilarConsola(page: Page) {
  const errores: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });
  page.on("pageerror", (e) => errores.push(e.message));
  return errores;
}

async function capturar(page: Page, nombre: string) {
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true });
}

test("el mapa público muestra los changarros de la demo", async ({ page }) => {
  const errores = vigilarConsola(page);
  await page.goto("/mapa");
  await expect(page.getByText(NEGOCIO_DUENA).first()).toBeVisible();
  await expect(page.getByText("Tacos El Güero").first()).toBeVisible();
  await expect(page.getByText("Panadería La Espiga").first()).toBeVisible();
  await capturar(page, "mapa");
  expect(errores).toEqual([]);
});

test("la dueña ve las ventas de hoy y su programa de puntos", async ({ page }) => {
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, cuentaDemo("duena").email);
  await page.waitForURL(/\/dashboard/);
  // T15 convirtió el Dashboard en "Resumen": la tarjeta ahora dice "Ventas de hoy".
  await expect(page.getByText("Ventas de hoy", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin cobros todavía")).toHaveCount(0);
  await capturar(page, "duena-dashboard");
  await page.goto("/negocio");
  await expect(page.getByText("Programa de puntos")).toBeVisible();
  await expect(page.getByLabel("Puntos por cada $100 (%)")).toHaveValue("5");
  await capturar(page, "duena-negocio");
  expect(errores).toEqual([]);
});

test("el cajero encuentra a la clienta VIP con saldo", async ({ page }) => {
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, cuentaDemo("cajero").email);
  await page.waitForURL(/\/caja/);
  await page.getByLabel("¿Cuánto vas a cobrar?").fill("150");
  await page.getByLabel("Correo del cliente").fill(cuentaDemo("cliente").email);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText(cuentaDemo("cliente").nombre)).toBeVisible();
  await expect(page.getByText(/Saldo aquí: \d+(\.\d+)? puntos/)).toBeVisible();
  await capturar(page, "cajero-caja");
  expect(errores).toEqual([]);
});

test("la clienta ve su monedero con nivel VIP", async ({ page }) => {
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, cuentaDemo("cliente").email);
  await page.waitForURL(/\/monedero/);
  await expect(page.getByRole("heading", { name: "Mis puntos" })).toBeVisible();
  await expect(page.getByText("VIP", { exact: true })).toBeVisible();
  await expect(page.getByText(NEGOCIO_DUENA).first()).toBeVisible();
  await capturar(page, "cliente-monedero");
  expect(errores).toEqual([]);
});

test("la red ve los negocios de la colonia", async ({ page }) => {
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, cuentaDemo("red").email);
  await page.waitForURL(/\/red/);
  await page.goto("/red?estado=aprobado");
  await expect(page.getByText(NEGOCIO_DUENA).first()).toBeVisible();
  // T23: los aprobados inactivos se ocultan por defecto; el interruptor los muestra.
  const interruptor = page.getByRole("switch", { name: /Mostrar negocios inactivos/ });
  await expect(interruptor).not.toBeChecked();
  await capturar(page, "red");
  await interruptor.click();
  await expect(page).toHaveURL(/inactivos=true/);
  await expect(interruptor).toBeChecked();
  expect(errores).toEqual([]);
});

test("la marca de la demo no se ve en la app", async ({ page }) => {
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, cuentaDemo("duena").email);
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText(NEGOCIO_DUENA).first()).toBeVisible();
  await expect(page.getByText(/Demo ·/)).toHaveCount(0);
  await expect(page.getByText(/demostración/i)).toHaveCount(0);
  expect(errores).toEqual([]);
});

test("la red tiene expedientes en revisión con sus documentos (solo lectura)", async ({ page }) => {
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, cuentaDemo("red").email);
  await page.waitForURL(/\/red/);
  await page.goto("/red?estado=en_revision");
  const fila = page.getByRole("row").filter({ hasText: NEGOCIOS_EN_REVISION_DEMO[0] });
  // Si alguien ya lo aprobó en un ensayo, el expediente ya no está en revisión.
  const vacia = page.getByText("No hay expedientes esperando revisión.");
  const otras = page.getByRole("link", { name: "Revisar" });
  await expect(fila.or(vacia).or(otras).first()).toBeVisible();
  test.skip(
    (await fila.count()) === 0,
    "El expediente de demo ya se revisó: demo:limpiar && demo:datos para restablecerlo.",
  );
  await expect(fila).toBeVisible();
  await capturar(page, "red-en-revision");
  await fila.getByRole("link", { name: "Revisar" }).click();
  await expect(page.getByText("Tu decisión")).toBeVisible();
  const ver = page.getByRole("button", { name: "Ver" });
  await expect(ver).toHaveCount(4);
  // El documento abre en otra pestaña con una URL firmada del bucket privado "kyb" (Chromium
  // headless descarga los PDF en vez de mostrarlos: se revisa la URL y que sirva un PDF).
  const [firmada] = await Promise.all([
    page
      .context()
      .waitForEvent("request", (r) => /\/storage\/v1\/object\/sign\/kyb\/.*[?&]token=/.test(r.url())),
    ver.first().click(),
  ]);
  const archivo = await page.request.get(firmada.url());
  expect(archivo.status()).toBe(200);
  expect(archivo.headers()["content-type"]).toContain("application/pdf");
  expect((await archivo.body()).subarray(0, 5).toString()).toBe("%PDF-");
  for (const p of page.context().pages()) if (p !== page) await p.close();
  await capturar(page, "red-expediente");
  expect(errores).toEqual([]);
});
