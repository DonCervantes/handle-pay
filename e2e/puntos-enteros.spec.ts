// T22 · Puntos sin decimales en pantalla. La base guarda el saldo exacto (8.61), pero
// caja, monedero y resumen muestran el piso (8) y el canje solo acepta enteros.
// Regla de 7%: un cobro de $123 da 8.61 puntos a un cliente nuevo.
import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  correoE2E,
  entrarConMagicLink,
  prepararNegocioAprobado,
  retirarNegocio,
  saldoDe,
  usuarioPorCorreo,
} from "./soporte/supabase";

test.describe.configure({ mode: "serial" });

const CAPTURAS = process.env["E2E_CAPTURAS"];
const DUENA = correoE2E("duena-enteros", true);
const NEGOCIO = "E2E Tortas Enteros";
const CLIENTE = correoE2E("cliente-enteros");

let businessId = "";

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

async function abrirCaja(page: Page) {
  await page.goto("/caja");
  await expect(page.getByLabel("¿Cuánto vas a cobrar?")).toBeVisible();
  await expect(page.getByText(/Modo de pruebas: los cobros son simulados/)).toBeVisible();
}

async function identificarCliente(page: Page) {
  await page.getByLabel("Correo del cliente").fill(CLIENTE);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("E2E Cliente Enteros")).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  const pagina = await browser.newPage();
  await entrarConMagicLink(pagina, DUENA, {
    full_name: "E2E Dueña Enteros",
    tipo_cuenta: "negocio",
    org_name: NEGOCIO,
  });
  await pagina.close();
  const perfil = await usuarioPorCorreo(DUENA);
  if (!perfil?.org_id) throw new Error("La dueña de prueba no quedó con organización.");
  businessId = await prepararNegocioAprobado(perfil.org_id, NEGOCIO);

  // Regla con porcentaje que deja decimales: 7% de $123 = 8.61 puntos.
  const db = admin();
  const regla = {
    org_id: perfil.org_id,
    business_id: businessId,
    porcentaje: 7,
    tope_puntos: null,
    vigencia_dias: 365,
    canje_max_porcentaje: 50,
    activo: true,
  };
  const { data: existente } = await db
    .from("point_rules")
    .select("id")
    .eq("business_id", businessId)
    .maybeSingle();
  const { error: errorRegla } = existente
    ? await db.from("point_rules").update(regla).eq("id", existente.id)
    : await db.from("point_rules").insert(regla);
  if (errorRegla) throw new Error(`No se pudo preparar la regla: ${errorRegla.message}`);

  const { error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: CLIENTE,
    options: { data: { full_name: "E2E Cliente Enteros", tipo_cuenta: "cliente" } },
  });
  if (error) throw new Error(`No se pudo registrar al cliente: ${error.message}`);
});

test.afterAll(async () => {
  if (businessId) await retirarNegocio(businessId);
});

test.describe("dueña en caja", () => {
  test.beforeEach(async ({ page }) => {
    await entrarConMagicLink(page, DUENA);
    await page.waitForURL(/\/dashboard/);
  });

  test("gana puntos con decimales, pero la caja muestra el piso", async ({ page }) => {
    const errores = vigilarConsola(page);
    await abrirCaja(page);
    await page.getByLabel("¿Cuánto vas a cobrar?").fill("123");
    await identificarCliente(page);
    await expect(page.getByText("Ganará 8 puntos al pagar.")).toBeVisible();
    await page.getByRole("button", { name: "Cobrar $123.00" }).click();
    await page.getByRole("button", { name: "Simular pago del cliente" }).click();
    await expect(page.getByText("¡Pagado!")).toBeVisible();
    await expect(page.getByText("Ganó 8 puntos")).toBeVisible();
    await capturar(page, "t22-caja-pagado");

    // La base conserva el valor exacto.
    expect(await saldoDe(CLIENTE, businessId)).toBe(8.61);
    expect(errores).toEqual([]);
  });

  test("el canje solo acepta enteros y el máximo usa el piso del saldo", async ({ page }) => {
    const errores = vigilarConsola(page);
    await abrirCaja(page);
    await page.getByLabel("¿Cuánto vas a cobrar?").fill("100");
    await identificarCliente(page);
    await expect(page.getByText("Saldo aquí: 8 puntos")).toBeVisible();
    await expect(page.getByText("Puede usar hasta 8 puntos (1 punto = $1).")).toBeVisible();

    await page.getByLabel("Usar puntos").fill("2.5");
    await expect(
      page.getByText("Escribe los puntos en número entero (sin decimales)."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Cobrar $100.00" })).toBeVisible();

    await page.getByRole("button", { name: "Máximo" }).click();
    await expect(page.getByLabel("Usar puntos")).toHaveValue("8");
    await expect(page.getByText("−$8.00")).toBeVisible();
    await capturar(page, "t22-caja-canje");

    // Cobra con 8 puntos y cancela: el saldo exacto vuelve a 8.61.
    await page.getByRole("button", { name: "Cobrar $92.00" }).click();
    await expect(page.getByText("Total $100.00 − 8 puntos")).toBeVisible();
    await expect.poll(() => saldoDe(CLIENTE, businessId)).toBeCloseTo(0.61, 5);
    await page.getByRole("button", { name: "Cancelar cobro" }).click();
    await expect(page.getByText("Cobro cancelado").first()).toBeVisible();
    await expect.poll(() => saldoDe(CLIENTE, businessId)).toBe(8.61);
    expect(errores).toEqual([]);
  });

  test("el resumen muestra los puntos emitidos sin decimales", async ({ page }) => {
    const errores = vigilarConsola(page);
    // La tarjeta "Puntos entregados" acumula 8.61 por corrida: siempre se ve entera.
    const tarjeta = page.locator("div.p-4").filter({ hasText: "Puntos entregados" });
    await expect(tarjeta.locator("p").first()).toHaveText(/^\d{1,3}(,\d{3})*$/);
    await capturar(page, "t22-resumen");
    expect(errores).toEqual([]);
  });
});

test("el cliente ve su saldo entero en /monedero (celular)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errores = vigilarConsola(page);
  await entrarConMagicLink(page, CLIENTE);
  await page.waitForURL(/\/monedero/);
  await expect(page.getByRole("heading", { name: "Mis puntos" })).toBeVisible();
  const saldo = page
    .locator("div")
    .filter({ hasText: NEGOCIO })
    .filter({ hasText: "8 pts" })
    .last();
  await expect(saldo).toBeVisible();
  await expect(page.getByText("+8", { exact: true }).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("8.61");
  await capturar(page, "t22-monedero");
  expect(errores).toEqual([]);
});
