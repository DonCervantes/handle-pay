import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyRow, FormField, NativeSelect } from "@/components/form-bits";
import { clientsQuery } from "@/lib/data";
import { formatMXN } from "@/lib/format";
import { matchesDirectory } from "@/lib/directory";
import { pageMeta } from "@/lib/metadata";
import { DirectoryLoading, DirectoryError } from "@/components/directory-feedback";

export const Route = createFileRoute("/_authenticated/clientes/")({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search["q"] === "string" ? search["q"] : "", status: typeof search["status"] === "string" ? search["status"] : "" }),
  loader: async ({ context }) => { await context.queryClient.ensureQueryData(clientsQuery); },
  head: () => pageMeta("Clientes", "Directorio de clientes, contactos y saldos por cobrar en Handle."),
  pendingComponent: DirectoryLoading,
  errorComponent: DirectoryError,
  notFoundComponent: () => <p>Cliente no encontrado.</p>,
  component: Clientes,
});

function Clientes() {
  const { data: clients } = useSuspenseQuery(clientsQuery);
  const { q, status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const rows = clients.filter((c) => matchesDirectory({ name: c.name, secondary: c.email, status: c.status }, q, status));
  const total = clients.reduce((a, c) => a + Number(c.balance_due), 0);
  const clear = () => navigate({ search: { q: "", status: "" }, replace: true });
  return <>
    <PageHeader title="Clientes" description={`Por cobrar: ${formatMXN(total)} · ${clients.length} clientes`} actions={<NewClient />} />
    <Card className="shadow-card">
      <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <div className="relative min-w-0"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar clientes" placeholder="Buscar por nombre o correo" className="pl-9" value={q} onChange={(e) => navigate({ search: (prev) => ({ ...prev, q: e.target.value }), replace: true })} /></div>
        <NativeSelect aria-label="Filtrar clientes por estado" value={status} onChange={(e) => navigate({ search: (prev) => ({ ...prev, status: e.target.value }), replace: true })}><option value="">Todos los estados</option><option value="activo">Activo</option><option value="prospecto">Prospecto</option><option value="inactivo">Inactivo</option></NativeSelect>
        {(q || status) && <Button variant="ghost" onClick={clear}>Limpiar</Button>}
      </div>
      <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Correo</TableHead><TableHead>Teléfono</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Saldo por cobrar</TableHead></TableRow></TableHeader><TableBody>
        {!rows.length && <EmptyRow cols={5} text={clients.length ? "No encontramos clientes con estos filtros." : "Tu cartera empieza aquí. Agrega tu primer cliente."} action={clients.length ? <Button variant="outline" onClick={clear}>Limpiar filtros</Button> : <NewClient />} />}
        {rows.map((c) => <TableRow key={c.id}><TableCell><Link to="/clientes/$id" params={{ id: c.id }} className="font-semibold hover:text-gold">{c.name}</Link></TableCell><TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{c.phone ?? "—"}</TableCell><TableCell><StatusBadge status={c.status} /></TableCell><TableCell className="tabular whitespace-nowrap text-right font-medium">{formatMXN(c.balance_due)}</TableCell></TableRow>)}
      </TableBody></Table>
    </Card>
  </>;
}

function NewClient() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (f: FormData) => {
      const { error } = await supabase.from("clients").insert({ name: String(f.get("name")).trim(), email: String(f.get("email")).trim() || null, phone: String(f.get("phone")).trim() || null, status: String(f.get("status")) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("Cliente agregado"); setOpen(false); },
    onError: () => toast.error("No pudimos guardar el cliente. Intenta de nuevo."),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); m.mutate(new FormData(e.currentTarget)); };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus /> Nuevo cliente</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4">
    <FormField label="Nombre o razón social" htmlFor="name"><Input id="name" name="name" required pattern=".*\S.*" /></FormField><FormField label="Correo" htmlFor="email"><Input id="email" name="email" type="email" /></FormField><FormField label="Teléfono" htmlFor="phone"><Input id="phone" name="phone" /></FormField><FormField label="Estado" htmlFor="status"><NativeSelect id="status" name="status"><option value="activo">Activo</option><option value="prospecto">Prospecto</option><option value="inactivo">Inactivo</option></NativeSelect></FormField>
    <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={m.isPending}>{m.isPending ? "Guardando…" : "Guardar"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
