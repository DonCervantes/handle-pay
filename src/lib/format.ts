export function formatMXN(value: number | string | null | undefined, currency = "MXN") {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export const roleLabels: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  finance: "Finanzas",
  hr: "Recursos Humanos",
  sales: "Ventas",
  cajero: "Cajero",
  admin_red: "Admin de red",
  cliente: "Cliente",
};
