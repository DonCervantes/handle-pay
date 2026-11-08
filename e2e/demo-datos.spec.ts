// T13 · Los datos de demo (scripts/demo-datos.mjs) se ven en la app con cada rol.
// Solo LEE: entra con las cuentas @demo.handle-prueba.mx y no cobra ni cambia nada.
// Si la demo no está sembrada, se salta: node --env-file=.env scripts/demo-datos.mjs
import { test, expect, type Page } from "@playwright/test";
import { NEGOCIO_DUENA, cuentaDemo } from "../src/lib/demo";
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
  await expect(page.getByText("Ventas CoDi de hoy")).toBeVisible();
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
  await capturar(page, "red");
  expect(errores).toEqual([]);
});
