export const employeeStatuses = ["activo", "inactivo"] as const;

export function matchesDirectory(row: { name: string; secondary?: string | null; status: string }, search: string, status: string) {
  const query = search.trim().toLocaleLowerCase("es-MX");
  return (!status || row.status === status) && `${row.name} ${row.secondary ?? ""}`.toLocaleLowerCase("es-MX").includes(query);
}

export function clientIncome<T extends { client_id: string | null; type: string }>(transactions: T[], clientId: string): T[] {
  return transactions.filter((transaction) => transaction.client_id === clientId && transaction.type === "income");
}