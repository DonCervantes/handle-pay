// Fase 5 · Mapa (HND-050 a 053) en navegador: mapa público sin sesión, filtros,
// perfil del negocio y "recomendado" marcado por la red desde /red.
// Las pruebas con negocios necesitan la migración 20261108030000_mapa_publico.sql
// (negocios_publicos()); sin ella se marcan como omitidas, no como fallidas.
import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  correoE2E,
  entrarConMagicLink,
  mapaPublicoDisponible,
  prepararNegocioAprobado,
  retirarNegocio,
  usuarioPorCorreo,
} from "./soporte/supabase";

test.describe.configure({ mode: "serial" });

const DUENA = correoE2E("duena-mapa", true);
const NEGOCIO = "E2E Taquería Mapa";

/** Sin teselas reales de OSM en las pruebas (su política no admite uso automatizado). */
async function sinTeselas(page: Page) {
  await page.route(/tile\.openstreetmap\.org/, (ruta) => ruta.abort());
}

/** /mapa llega renderizado del servidor: se espera a que React lo hidrate antes de hacer clic. */
async function abrirMapa(page: Page, ruta = "/mapa") {
  await page.goto(ruta);
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async ({ page }) => {
  await sinTeselas(page);
});

test("/mapa es público: abre sin sesión y los filtros viven en la URL", async ({ page }) => {
  await abrirMapa(page);
  await expect(page).toHaveURL(/\/mapa$/);
  await expect(page.getByRole("heading", { name: "Changarros Handle cerca de ti" })).toBeVisible();
  const filtros = page.getByRole("toolbar", { name: "Filtrar por tipo de negocio" });
  await filtros.getByRole("button", { name: /Recomendados/ }).click();
  await expect(page).toHaveURL(/recomendados=true/);
  await filtros.getByRole("button", { name: /Todos/ }).click();
  await expect(page).not.toHaveURL(/categoria=/);
});

test.describe("con negocios publicados", () => {
  let businessId = "";
  let correoRed = "";

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await mapaPublicoDisponible()), "Falta aplicar la migración del mapa (negocios_publicos).");
    const pagina = await browser.newPage();
    await entrarConMagicLink(pagina, DUENA, {
      full_name: "E2E Dueña Mapa",
      tipo_cuenta: "negocio",
      org_name: NEGOCIO,
    });
    await pagina.close();
    const perfil = await usuarioPorCorreo(DUENA);
    if (!perfil?.org_id) throw new Error("La dueña de prueba no quedó con organización.");
    businessId = await prepararNegocioAprobado(perfil.org_id, NEGOCIO, { categoria: "taqueria" });
    await admin().from("businesses").update({ recomendado: false }).eq("id", businessId);
  });

  test.afterAll(async () => {
    if (businessId) await retirarNegocio(businessId);
    // La cuenta admin_red de prueba no se queda en la base compartida.
    if (correoRed) {
      const red = await usuarioPorCorreo(correoRed);
      if (red) {
        await admin().auth.admin.deleteUser(red.id);
        // Su organización vacía, creada al registrarse (solo si es de prueba).
        if (red.org_id) {
          await admin().from("organizations").delete().eq("id", red.org_id).like("name", "E2E%");
        }
      }
    }
  });

  test("el negocio aprobado aparece en el mapa y en la lista, también filtrado", async ({ page }) => {
    await abrirMapa(page);
    await expect(page.getByRole("button", { name: `Ver ${NEGOCIO} en el mapa` })).toBeVisible();
    // Pin en el mapa (MapLibre en el navegador).
    await expect(page.locator(`button[aria-label="${NEGOCIO}"]`)).toBeAttached();

    const filtros = page.getByRole("toolbar", { name: "Filtrar por tipo de negocio" });
    await filtros.getByRole("button", { name: /Taquería/ }).click();
    await expect(page).toHaveURL(/categoria=taqueria/);
    await expect(page.getByRole("button", { name: `Ver ${NEGOCIO} en el mapa` })).toBeVisible();

    await abrirMapa(page, "/mapa?categoria=carniceria");
    await expect(page.getByRole("button", { name: `Ver ${NEGOCIO} en el mapa` })).toHaveCount(0);
  });

  test("perfil público: datos de contacto útiles y nada fiscal", async ({ page }) => {
    await abrirMapa(page);
    await page.getByRole("button", { name: `Ver ${NEGOCIO} en el mapa` }).click();
    await page.getByRole("link", { name: "Ver perfil del negocio" }).click();
    await expect(page).toHaveURL(new RegExp(`/mapa/${businessId}$`));
    await expect(page.getByRole("heading", { name: NEGOCIO })).toBeVisible();
    await expect(page.getByText("Calle de Prueba 123, Col. Centro, CDMX")).toBeVisible();
    await expect(page.getByRole("link", { name: "Cómo llegar" })).toBeVisible();
    await expect(page.getByText("El negocio aún no publica su horario.")).toBeVisible();
    // Nunca RFC, razón social ni CP.
    await expect(page.getByText("XAXX010101000")).toHaveCount(0);
    await expect(page.getByText("prueba automatizada")).toHaveCount(0);
  });

  test("la red lo marca recomendado en /red y el mapa lo destaca", async ({ page, browser }) => {
    // Cuenta admin_red de prueba: el rol solo lo puede asignar la service role.
    // Se da de alta y se le asigna el rol ANTES de entrar, para que su sesión ya lo traiga.
    correoRed = correoE2E("red");
    const { data: alta, error } = await admin().auth.admin.generateLink({
      type: "magiclink",
      email: correoRed,
      options: { data: { full_name: "E2E Red", tipo_cuenta: "negocio", org_name: "E2E Red Handle" } },
    });
    if (error) throw new Error(`No se pudo registrar la cuenta de la red: ${error.message}`);
    await admin().from("profiles").update({ role: "admin_red" }).eq("id", alta.user.id);
    await entrarConMagicLink(page, correoRed);
    await page.waitForURL(/\/red/);

    await page.goto(`/red/${businessId}`);
    await page.getByRole("switch", { name: "Negocio recomendado" }).click();
    await expect(page.getByText("Negocio recomendado: se destaca en el mapa.")).toBeVisible();

    // Visitante sin sesión.
    const visitante = await browser.newPage();
    await sinTeselas(visitante);
    await abrirMapa(visitante, "/mapa?recomendados=true");
    const fila = visitante.getByRole("button", { name: `Ver ${NEGOCIO} en el mapa` });
    await expect(fila).toBeVisible();
    await expect(fila.getByText("Recomendado")).toBeVisible();
    await expect(visitante.locator(`button[aria-label="${NEGOCIO} (recomendado)"]`)).toBeAttached();
    await visitante.goto(`/mapa/${businessId}`);
    await expect(visitante.getByText("Recomendado por la red Handle")).toBeVisible();
    await visitante.close();
  });
});
