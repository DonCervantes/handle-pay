import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Users, UserCog, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceAssistant } from "@/components/finance-assistant";
import { StatusBadge } from "@/components/status-badge";
import { accountsQuery, clientsQuery, employeesQuery, transactionsQuery } from "@/lib/data";
import { formatDate, formatMXN } from "@/lib/format";
import { pageMeta } from "@/lib/metadata";
import { DirectoryLoading, DirectoryError } from "@/components/directory-feedback";
import { AvisoExpediente } from "@/components/aviso-expediente";
import { VentasDelDia } from "@/components/ventas-del-dia";

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(accountsQuery), context.queryClient.ensureQueryData(transactionsQuery), context.queryClient.ensureQueryData(clientsQuery), context.queryClient.ensureQueryData(employeesQuery)]); },
  head: () => pageMeta("Dashboard", "Resumen financiero y actividad de tu empresa en Handle."),
  pendingComponent: DirectoryLoading,
  errorComponent: DirectoryError,
  notFoundComponent: () => <p>No se encontró esta página.</p>,
  component: Dashboard,
});

function Dashboard() {
  const { data: accounts = [] } = useSuspenseQuery(accountsQuery);
  const { data: tx = [] } = useSuspenseQuery(transactionsQuery);
  const { data: clients = [] } = useSuspenseQuery(clientsQuery);
  const { data: employees = [] } = useSuspenseQuery(employeesQuery);

  const now = new Date();
  const thisMonth = tx.filter((t) => {
    const d = new Date(t.occurred_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const sum = (list: typeof tx, type: string) =>
    list.filter((t) => t.type === type).reduce((a, t) => a + Number(t.amount), 0);
  const balance = accounts.reduce((a, x) => a + Number(x.balance), 0);

  const months = [2, 1, 0].map((back) => {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const items = tx.filter((t) => {
      const o = new Date(t.occurred_at);
      return o.getMonth() === d.getMonth() && o.getFullYear() === d.getFullYear();
    });
    return {
      mes: d.toLocaleDateString("es-MX", { month: "short" }),
      Ingresos: sum(items, "income"),
      Egresos: sum(items, "expense"),
    };
  });

  const stats = [
    { label: "Saldo total", value: formatMXN(balance), icon: Wallet },
    { label: "Ingresos del mes", value: formatMXN(sum(thisMonth, "income")), icon: ArrowUpRight, tone: "text-success" },
    { label: "Egresos del mes", value: formatMXN(sum(thisMonth, "expense")), icon: ArrowDownRight, tone: "text-destructive" },
    { label: "Clientes", value: String(clients.length), icon: Users },
    { label: "Colaboradores", value: String(employees.length), icon: UserCog },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="Un vistazo a la salud de tu negocio." />
      <AvisoExpediente />
      <VentasDelDia />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                {s.label}
                <s.icon className={`size-4 ${s.tone ?? ""}`} />
              </div>
              <p className="tabular mt-3 break-words text-xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ingresos vs egresos</CardTitle>
            <p className="text-sm text-muted-foreground">Últimos 3 meses</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={months} margin={{ left: 0, right: 8 }}>
                <defs>
                  <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(v: number) => formatMXN(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                />
                <Area type="monotone" dataKey="Ingresos" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gi)" />
                <Area type="monotone" dataKey="Egresos" stroke="var(--chart-2)" strokeWidth={2} fill="url(#ge)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Movimientos recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tx.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.description ?? t.category}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.occurred_at)}</p>
                </div>
                <div className="text-right">
                  <p className={`tabular font-medium ${t.type === "income" ? "text-success" : ""}`}>
                    {t.type === "income" ? "+" : "−"}
                    {formatMXN(t.amount)}
                  </p>
                  <StatusBadge status={t.type} className="mt-1" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <FinanceAssistant />
      </div>
    </>
  );
}
