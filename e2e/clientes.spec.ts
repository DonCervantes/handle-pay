// T21 · /clientes muestra a los clientes reales del changarro (los de la caja y los puntos).
// Solo LEE con las cuentas de la demo (@demo.handle-prueba.mx). Si la demo no está
// sembrada, se salta: node --env-file=.env scripts/demo-datos.mjs
import { test, expect, type Page } from "@playwright/test";
import { cuentaDemo } from "../src/lib/demo";
import { admin, entrarConMagicLink, usuarioPorCorreo } from "./soporte/supabase";

const CAPTURAS = process.env["E2E_CAPTURAS"];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const sembrada = await usuarioPorCorreo(cuentaDemo("duena").email);
  test.skip(!sembrada, "La demo no está sembrada (scripts/demo-datos.mjs).");
});

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

/** Un cliente con cobros en OTRA org y ninguno en la de la dueña (para probar el aislamiento). */
async function clienteAjeno() {
  const db = admin();
  const duena = await usuarioPorCorreo(cuentaDemo("duena").email);
  const org = { id: duena!.org_id! };
  const { data: propios } = await db
    .from("charges")
    .select("customer_id")
    .eq("org_id", org!.id)
    .not("customer_id", "is", null);
  const { data: otros } = await db
    .from("point_transactions")
    .select("customer_id")
    .eq("org_id", org!.id);
  const ligados = new Set([...(propios ?? []), ...(otros ?? [])].map((f) => f.customer_id));
  const { data: ajenos } = await db
    .from("charges")
    .select("customer_id")
    .neq("org_id", org!.id)
    .not("customer_id", "is", null)
    .limit(500);
  return (ajenos ?? []).map((f) => f.customer_id!).find((id) => !ligados.has(id)) ?? null;
}

test("la dueña ve a sus clientes reales, filtra y abre la ficha", async ({ page }) => {
  const errores = vigilarConsola(page);
  const mariana = cuentaDemo("cliente");
  await entrarConMagicLink(page, cuentaDemo("duena").email);
  await page.waitForURL(/\/dashboard/);
  await page.goto("/clientes");
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  await expect(page.getByRole("link", { name: mariana.nombre })).toBeVisible();
  // Del directorio viejo del ERP ya no queda nada.
  await expect(page.getByText("Por cobrar:")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nuevo cliente" })).toHaveCount(0);
  // T22: puntos enteros (hacia abajo) en el encabezado y en la columna de puntos.
  await expect(page.getByText(/· [\d,]+ puntos por usar$/)).toBeVisible();
  const puntos = await page.locator("tbody tr td:nth-child(5)").allInnerTexts();
  expect(puntos.length).toBeGreaterThan(0);
  for (const p of puntos) expect(p.trim()).toMatch(/^[\d,]+$/);
  await capturar(page, "clientes-lista");

  // Filtros en la URL.
  await page.getByLabel("Filtrar por nivel").selectOption("vip");
  await expect(page).toHaveURL(/nivel=vip/);
  await expect(page.getByRole("link", { name: mariana.nombre })).toBeVisible();
  await page.getByLabel("Buscar clientes").fill("mariana");
  await expect(page).toHaveURL(/q=mariana/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel("Buscar clientes")).toHaveValue("mariana");
  await page.getByLabel("Buscar clientes").fill("no-existe-nadie");
  await expect(page.getByText("No encontramos clientes con estos filtros.")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByRole("link", { name: mariana.nombre })).toBeVisible();

  // Ficha con historial de cobros y de puntos.
  await page.getByRole("link", { name: mariana.nombre }).click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: mariana.nombre })).toBeVisible();
  await expect(page.getByText("VIP", { exact: true })).toBeVisible();
  await expect(page.getByText(mariana.email)).toBeVisible();
  await expect(page.getByText("Puntos por usar aquí")).toBeVisible();
  await expect(page.getByText("Pagado").first()).toBeVisible();
  await expect(page.getByText("Ganaste").first()).toBeVisible();
  const movimientos = await page
    .getByRole("table")
    .last()
    .locator("tbody tr td:nth-child(3)")
    .allInnerTexts();
  for (const p of movimientos) expect(p.trim()).toMatch(/^[+−][\d,]+$/);
  await capturar(page, "clientes-ficha");

  // En celular se ve sin desbordarse.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clientes");
  await expect(page.getByRole("link", { name: mariana.nombre })).toBeVisible();
  const anchoPagina = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(anchoPagina).toBeLessThanOrEqual(390);
  await capturar(page, "clientes-celular");
  expect(errores).toEqual([]);
});

test("la dueña no puede ver la ficha de un cliente de otro negocio", async ({ page }) => {
  const ajeno = await clienteAjeno();
  test.skip(!ajeno, "No hay clientes de otros negocios en la base.");
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, cuentaDemo("duena").email);
  await page.waitForURL(/\/dashboard/);
  await page.goto(`/clientes/${ajeno}`);
  await expect(page.getByText("Cliente no encontrado.", { exact: false })).toBeVisible();
  await capturar(page, "clientes-ajeno");
  expect(errores).toEqual([]);
});
