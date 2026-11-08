// HND-030: contrato entre Handle y quien procesa los cobros CoDi (Pey o el simulador).
// El dominio (caja, cuentas, webhooks) solo conoce esta interfaz.

/** Estados de registro de una cuenta en CoDi, tal como los reporta Pey. */
export type EstadoCodiProveedor = "PENDING" | "PROCESSING" | "ACTIVE" | "ERROR";

export type CuentaProveedor = { id: string; estado: EstadoCodiProveedor; error?: string };

export type DatosCobro = {
  /** Cuenta de Pey (ULID) que recibe el dinero. */
  cuentaId: string;
  monto: number;
  concepto: string;
  vigenciaSeg: number;
  /** Viaja de regreso en el webhook (metadata.externalMetadata) para conciliar el pago. */
  cobroId: string;
};

export interface ProveedorPagos {
  readonly nombre: "pey" | "simulador";
  registrarCuenta(datos: {
    alias: string;
    titular: string;
    clabe: string;
    esEmpresa: boolean;
  }): Promise<CuentaProveedor>;
  consultarCuenta(cuentaId: string): Promise<CuentaProveedor>;
  /** Devuelve el id del QR en el proveedor y el texto que se codifica en la imagen. */
  crearCobroQr(datos: DatosCobro): Promise<{ referencia: string; qr: string }>;
  /** Envía la solicitud de pago al celular; devuelve el id de la transacción. */
  crearCobroPush(datos: DatosCobro & { telefono: string }): Promise<{ referencia: string }>;
  /**
   * Pregunta si un cobro ya se pagó. Respaldo del webhook: sirve en local (Pey no
   * alcanza localhost) y en producción si un webhook se pierde.
   */
  consultarPago(datos: { tipo: "qr" | "push"; referencia: string }): Promise<PagoConsultado>;
}

export type PagoConsultado =
  { pagado: false } | { pagado: true; monto: number; fechaPagoSeg: number; transaccionId: string };

/** Error de un proveedor con un mensaje que se puede mostrar al usuario. */
export class ErrorProveedor extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

/** Traduce el estado de Pey al de la tabla pey_accounts. */
export function estadoCuenta(estado: EstadoCodiProveedor): "en_registro" | "activa" | "error" {
  if (estado === "ACTIVE") return "activa";
  if (estado === "ERROR") return "error";
  return "en_registro";
}
