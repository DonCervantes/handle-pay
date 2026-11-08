// Proveedor simulado para desarrollar sin Pey (no hay sandbox) y sin mover dinero.
// - La cuenta queda "en registro" al darla de alta y se activa al consultarla.
// - Los cobros devuelven referencias de prueba; el pago se simula desde la caja,
//   que envía un webhook firmado a /api/webhooks/pey (el mismo camino que Pey real).
import type { CuentaProveedor, DatosCobro, PagoConsultado, ProveedorPagos } from "./proveedor";

const idPrueba = (prefijo: string) =>
  `${prefijo}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export class ProveedorSimulado implements ProveedorPagos {
  readonly nombre = "simulador" as const;

  async registrarCuenta(): Promise<CuentaProveedor> {
    return { id: idPrueba("sim_cuenta"), estado: "PROCESSING" };
  }

  async consultarCuenta(cuentaId: string): Promise<CuentaProveedor> {
    return { id: cuentaId, estado: "ACTIVE" };
  }

  async crearCobroQr(d: DatosCobro) {
    const referencia = idPrueba("sim_qr");
    // Contenido de prueba: NO es un QR CoDi válido para una app bancaria.
    const qr = JSON.stringify({
      simulacion: "Handle",
      referencia,
      monto: d.monto,
      concepto: d.concepto,
    });
    return { referencia, qr };
  }

  async crearCobroPush() {
    return { referencia: idPrueba("sim_pn") };
  }

  /** En el simulador el pago se dispara con el botón de la caja (webhook firmado). */
  async consultarPago(): Promise<PagoConsultado> {
    return { pagado: false };
  }
}
