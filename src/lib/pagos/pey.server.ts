// Proveedor real: API pública de Pey (https://api.pey.mx).
// Implementado según la documentación y su OpenAPI (docs.pey.mx/openapi.json).
// IMPORTANTE: aún no se ha probado contra Pey (no hay sandbox ni API key en este entorno).
// Antes de producción: probar con la cuenta de prueba de Pey y montos de $0.01.
import {
  ErrorProveedor,
  type CuentaProveedor,
  type DatosCobro,
  type EstadoCodiProveedor,
  type PagoConsultado,
  type ProveedorPagos,
} from "./proveedor";

const MENSAJES: Record<string, string> = {
  INVALID_CLABE: "Pey rechazó la CLABE. Revisa que esté bien escrita.",
  BANK_ACCOUNT_NOT_FOUND: "Pey no encontró la cuenta de cobro.",
  SERVICE_UNAVAILABLE:
    "El servicio de cobros no está disponible en este momento. Intenta en unos minutos.",
  FLAGS_UNAVAILABLE:
    "El servicio de cobros no está disponible en este momento. Intenta en unos minutos.",
};

export class ProveedorPey implements ProveedorPagos {
  readonly nombre = "pey" as const;

  constructor(
    private readonly apiKey: string,
    private readonly url = "https://api.pey.mx",
  ) {}

  private async llamar<T>(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await fetch(`${this.url}${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ErrorProveedor(
        "No pudimos comunicarnos con el servicio de cobros. Intenta de nuevo.",
      );
    }
    const datos = (await r.json().catch(() => ({}))) as {
      error?: { type?: string; message?: string };
    } & T;
    if (!r.ok) {
      const tipo = datos.error?.type;
      console.error("Pey", metodo, ruta, r.status, datos.error);
      throw new ErrorProveedor(
        (tipo && MENSAJES[tipo]) ?? "El servicio de cobros rechazó la operación.",
        tipo,
      );
    }
    return datos;
  }

  async registrarCuenta(d: {
    alias: string;
    titular: string;
    clabe: string;
    esEmpresa: boolean;
  }): Promise<CuentaProveedor> {
    const r = await this.llamar<{ id: string; codiStatus: EstadoCodiProveedor }>(
      "POST",
      "/bank-account",
      {
        alias: d.alias.slice(0, 255),
        name: d.titular.slice(0, 255),
        clabe: d.clabe,
        entity: d.esEmpresa ? "BUSINESS" : "PERSON",
      },
    );
    return { id: r.id, estado: r.codiStatus };
  }

  async consultarCuenta(cuentaId: string): Promise<CuentaProveedor> {
    const r = await this.llamar<{
      id: string;
      codiStatus: EstadoCodiProveedor;
      errorMessage?: string;
    }>("GET", `/bank-account/${encodeURIComponent(cuentaId)}`);
    return { id: r.id, estado: r.codiStatus, ...(r.errorMessage ? { error: r.errorMessage } : {}) };
  }

  async crearCobroQr(d: DatosCobro) {
    const r = await this.llamar<{ id: string; qrString: string }>("POST", "/codi/qr", {
      amount: d.monto,
      concept: d.concepto,
      expiration: d.vigenciaSeg,
      bankAccountId: d.cuentaId,
      metadata: { cobroId: d.cobroId },
    });
    return { referencia: r.id, qr: r.qrString };
  }

  async crearCobroPush(d: DatosCobro & { telefono: string }) {
    const r = await this.llamar<{ transactionId: string }>("POST", "/codi/pn", {
      amount: d.monto,
      phoneNumber: d.telefono,
      concept: d.concepto,
      expiration: d.vigenciaSeg,
      bankAccountId: d.cuentaId,
      metadata: { cobroId: d.cobroId },
    });
    return { referencia: r.transactionId };
  }

  async consultarPago(d: { tipo: "qr" | "push"; referencia: string }): Promise<PagoConsultado> {
    type Transaccion = {
      id: string;
      status: "PENDING" | "PAID";
      amount: number;
      datePaid?: number;
    };
    try {
      if (d.tipo === "qr") {
        // Transacciones recibidas por ese QR (la más reciente primero).
        const r = await this.llamar<{ items: Transaccion[] }>(
          "GET",
          `/transaction/codi/qr/${encodeURIComponent(d.referencia)}`,
        );
        const pagada = r.items.find((t) => t.status === "PAID");
        return pagada ? aPagado(pagada) : { pagado: false };
      }
      const t = await this.llamar<Transaccion>(
        "GET",
        `/transaction/${encodeURIComponent(d.referencia)}`,
      );
      return t.status === "PAID" ? aPagado(t) : { pagado: false };
    } catch (e) {
      // Sin transacciones todavía: Pey responde 404.
      if (
        e instanceof ErrorProveedor &&
        (e.codigo === "NOT_FOUND" || e.codigo === "TRANSACTION_NOT_FOUND")
      ) {
        return { pagado: false };
      }
      throw e;
    }
  }
}

function aPagado(t: { id: string; amount: number; datePaid?: number }): PagoConsultado {
  return {
    pagado: true,
    monto: t.amount,
    fechaPagoSeg: t.datePaid ?? Math.floor(Date.now() / 1000),
    transaccionId: t.id,
  };
}
