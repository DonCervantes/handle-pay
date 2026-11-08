// Suite E2E en navegador (Playwright) contra la app local en modo mock.
// Uso: set -a; source .env; set +a; bun run test:e2e
// Comparte la base de Supabase: solo crea datos @e2e.handle-prueba.mx y negocios "E2E …".
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PUERTO, exigirModoMock } from "./e2e/soporte/entorno";

// Antes de levantar nada: con PAYMENTS_PROVIDER=pey cada cobro sería dinero real.
exigirModoMock();

export default defineConfig({
  testDir: "./e2e",
  // Los flujos comparten negocio y cliente de prueba: uno a la vez.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx -y bun run dev -- --port ${PUERTO} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    // Sin automatizaciones externas durante las pruebas; siempre con el simulador.
    env: { PAYMENTS_PROVIDER: "mock", N8N_WEBHOOK_URL: "" },
  },
});
