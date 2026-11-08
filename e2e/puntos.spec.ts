// Fase 4 · Puntos (HND-040 a 045) en navegador, modo mock:
//   regla en /negocio → cobro con cliente en /caja → pago simulado → puntos;
//   cobro con canje → cancelar → devolución; monedero del cliente.
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

// Dueña fija (se reutiliza entre corridas: un solo negocio de prueba) y cliente nuevo
// por corrida, para que nivel y saldo empiecen siempre en cero.
const DUENA = correoE2E("duena-puntos", true);
const NEGOCIO = "E2E Taquería Puntos";
const CLIENTE = correoE2E("cliente-puntos");

let businessId = "";

async function abrirCaja(page: Page) {
  await page.goto("/caja");
  await expect(page.getByLabel("¿Cuánto vas a cobrar?")).toBeVisible();
  // Candado: si el servidor no estuviera en modo simulador, se detiene antes de cobrar.
  await expect(page.getByText(/Modo de pruebas: los cobros son simulados/)).toBeVisible();
}

/** Busca al cliente (ya registrado) por correo y verifica su saldo en este negocio. */
async function identificarCliente(page: Page, saldoEsperado: string) {
  await page.getByLabel("Correo del cliente").fill(CLIENTE);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("E2E Cliente Puntos")).toBeVisible();
  await expect(page.getByText(`Saldo aquí: ${saldoEsperado} puntos`)).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  // Alta de la dueña por magic link (si ya existe, solo entra) y negocio listo para cobrar.
  const pagina = await browser.newPage();
  await entrarConMagicLink(pagina, DUENA, {
    full_name: "E2E Dueña Puntos",
    tipo_cuenta: "negocio",
    org_name: NEGOCIO,
  });
  await pagina.close();
  const perfil = await usuarioPorCorreo(DUENA);
  if (!perfil?.org_id) throw new Error("La dueña de prueba no quedó con organización.");
  businessId = await prepararNegocioAprobado(perfil.org_id, NEGOCIO);

  // El cliente se registra antes de comprar (cuenta de cliente, sin organización).
  const { error } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: CLIENTE,
    options: { data: { full_name: "E2E Cliente Puntos", tipo_cuenta: "cliente" } },
  });
  if (error) throw new Error(`No se pudo registrar al cliente: ${error.message}`);
});

test.afterAll(async () => {
  // El negocio de prueba no debe quedarse visible en el mapa público.
  if (businessId) await retirarNegocio(businessId);
});

test.describe("dueña del negocio", () => {
  test.beforeEach(async ({ page }) => {
    await entrarConMagicLink(page, DUENA);
    await page.waitForURL(/\/dashboard/);
  });

  test("define la regla de puntos en /negocio", async ({ page }) => {
    await page.goto("/negocio");
    await expect(page.getByText("Programa de puntos")).toBeVisible();
    await page.getByLabel("Puntos por cada $100 (%)").fill("10");
    await page.getByLabel("Tope de puntos por compra").fill("");
    await page.getByLabel("Vencen tras días sin comprar").fill("365");
    await page.getByLabel("Máximo a pagar con puntos (%)").fill("50");
    // /negocio también tiene los interruptores del horario (T7): se apunta al del programa.
    const activo = page.locator("#regla-activo");
    if ((await activo.getAttribute("aria-checked")) !== "true") await activo.click();
    // Vista previa con la regla: $200 a un cliente nuevo = 20 puntos.
    await expect(page.getByText("20 puntos", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Crear programa|Guardar cambios/ }).click();
    await expect(page.getByText("Programa de puntos guardado")).toBeVisible();

    const { data: regla } = await admin()
      .from("point_rules")
      .select("porcentaje, canje_max_porcentaje, vigencia_dias, activo")
      .eq("business_id", businessId)
      .single();
    expect(regla).toMatchObject({ vigencia_dias: 365, activo: true });
    expect(Number(regla?.porcentaje)).toBe(10);
    expect(Number(regla?.canje_max_porcentaje)).toBe(50);
  });

  test("cobra a un cliente identificado, simula el pago y acumula puntos", async ({ page }) => {
    await abrirCaja(page);
    await page.getByLabel("¿Cuánto vas a cobrar?").fill("200");
    await identificarCliente(page, "0");
    await expect(page.getByText("Ganará 20 puntos al pagar.")).toBeVisible();
    await page.getByRole("button", { name: "Cobrar $200.00" }).click();

    await expect(page.getByAltText("Código QR para pagar con CoDi")).toBeVisible();
    await expect(page.getByText("Ganará 20 puntos")).toBeVisible();
    await page.getByRole("button", { name: "Simular pago del cliente" }).click();
    await expect(page.getByText("¡Pagado!")).toBeVisible();
    await expect(page.getByText("Ganó 20 puntos")).toBeVisible();

    expect(await saldoDe(CLIENTE, businessId)).toBe(20);
  });

  test("canjea puntos, cancela el cobro y los puntos regresan", async ({ page }) => {
    await abrirCaja(page);
    await page.getByLabel("¿Cuánto vas a cobrar?").fill("100");
    await identificarCliente(page, "20");
    await page.getByLabel("Usar puntos").fill("10");
    await expect(page.getByText("−$10.00")).toBeVisible();
    await page.getByRole("button", { name: "Cobrar $90.00" }).click();

    await expect(page.getByText("Total $100.00 − 10 puntos")).toBeVisible();
    // Reservados al crear el cobro.
    await expect.poll(() => saldoDe(CLIENTE, businessId)).toBe(10);

    await page.getByRole("button", { name: "Cancelar cobro" }).click();
    await expect(page.getByText("Cobro cancelado").first()).toBeVisible();
    await expect.poll(() => saldoDe(CLIENTE, businessId)).toBe(20);
  });
});

test("el cliente ve su saldo, nivel e historial en /monedero", async ({ page }) => {
  await entrarConMagicLink(page, CLIENTE);
  await page.waitForURL(/\/monedero/);
  await expect(page.getByRole("heading", { name: "Mis puntos" })).toBeVisible();
  await expect(page.getByText("Nuevo", { exact: true })).toBeVisible();
  await expect(page.getByText("Te faltan 4 compras")).toBeVisible();

  const saldo = page.locator("div").filter({ hasText: NEGOCIO }).filter({ hasText: "20 pts" }).last();
  await expect(saldo).toBeVisible();
  await expect(page.getByText("Vencen el")).toBeVisible();

  // Historial: ganó 20, usó 10 en el cobro cancelado y se le devolvieron.
  await expect(page.getByText("Ganaste", { exact: true })).toBeVisible();
  await expect(page.getByText("+20", { exact: true })).toBeVisible();
  await expect(page.getByText("Usaste", { exact: true })).toBeVisible();
  await expect(page.getByText("−10", { exact: true })).toBeVisible();
  await expect(page.getByText("Te devolvimos", { exact: true })).toBeVisible();
  await expect(page.getByText("+10", { exact: true })).toBeVisible();
});
