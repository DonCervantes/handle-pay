import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Mail, Phone, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyRow, FormField } from "@/components/form-bits";
import { EmptyState } from "@/components/table-feedback";
import { DeleteConfirmation } from "@/components/delete-confirmation";
import { DirectoryLoading, DirectoryError } from "@/components/directory-feedback";
import { clientQuery, transactionsQuery } from "@/lib/data";
import { formatDate, formatMXN } from "@/lib/format";
import { clientIncome } from "@/lib/directory";
import { pageMeta } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  loader: async ({ context, params }) => { await Promise.all([context.queryClient.ensureQueryData(clientQuery(params.id)), context.queryClient.ensureQueryData(transactionsQuery)]); },
  head: () => pageMeta("Ficha de cliente", "Datos, contactos y estado de cuenta del cliente en Handle."),
  pendingComponent: DirectoryLoading,
  errorComponent: DirectoryError,
  notFoundComponent: () => <p>Cliente no encontrado.</p>,
  component: ClienteDetalle,
});

function ClienteDetalle() {
  const { id } = Route.useParams();
  const { data: c } = useSuspenseQuery(clientQuery(id));
  const { data: tx } = useSuspenseQuery(transactionsQuery);
  const movs = clientIncome(tx, id);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (contactId: string) => { const { error } = await supabase.from("client_contacts").delete().eq("id", contactId).eq("client_id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients", id] }); toast.success("Contacto eliminado"); },
    onError: () => toast.error("No pudimos eliminar el contacto. Intenta de nuevo."),
  });
  return <>
    <Button asChild variant="ghost" className="mb-6"><Link to="/clientes" search={{ q: "", status: "" }}><ArrowLeft /> Clientes</Link></Button>
    <div className="mb-8 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-bold">{c.name}</h1><StatusBadge status={c.status} /></div><div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">{c.email && <a href={`mailto:${c.email}`} className="flex min-w-0 items-center gap-2 break-all"><Mail className="size-4 shrink-0" />{c.email}</a>}{c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2"><Phone className="size-4" />{c.phone}</a>}</div></div>
      <div className="sm:text-right"><p className="text-sm text-muted-foreground">Saldo por cobrar</p><p className="tabular text-2xl font-bold">{formatMXN(c.balance_due)}</p></div>
    </div>
    <Card className="mb-6 shadow-card"><CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center"><CardTitle className="text-base">Contactos</CardTitle><ContactDialog clientId={id} /></CardHeader><CardContent>
      {!c.client_contacts.length && <EmptyState text="Agrega a la persona con quien coordinas cobros y seguimiento."><ContactDialog clientId={id} /></EmptyState>}
      <div className="grid gap-4 md:grid-cols-2">{c.client_contacts.map((ct) => <div key={ct.id} className="border-b py-4"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><p className="break-words font-semibold">{ct.name}</p>{ct.role && <p className="text-xs text-muted-foreground">{ct.role}</p>}</div><div className="flex shrink-0"><ContactDialog clientId={id} contact={ct} /><DeleteConfirmation name={ct.name} pending={del.isPending} onDelete={() => del.mutateAsync(ct.id)} /></div></div><div className="mt-2 space-y-2 text-sm text-muted-foreground">{ct.email && <a href={`mailto:${ct.email}`} className="flex items-center gap-2 break-all"><Mail className="size-3.5 shrink-0" />{ct.email}</a>}{ct.phone && <a href={`tel:${ct.phone}`} className="flex items-center gap-2"><Phone className="size-3.5 shrink-0" />{ct.phone}</a>}</div></div>)}</div>
    </CardContent></Card>
    <Card className="shadow-card"><CardHeader><CardTitle className="text-base">Estado de cuenta</CardTitle><p className="text-sm text-muted-foreground">Ingresos registrados: {formatMXN(movs.reduce((sum, t) => sum + Number(t.amount), 0))}</p></CardHeader><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead><TableHead>Cuenta</TableHead><TableHead className="text-right">Ingreso (MXN)</TableHead></TableRow></TableHeader><TableBody>
      {!movs.length && <EmptyRow cols={4} text="Aún no hay ingresos registrados para este cliente." action={<Button asChild variant="outline"><Link to="/finanzas" search={{ from: "", to: "", cat: "" }}>Ir a Finanzas</Link></Button>} />}
      {movs.map((t) => <TableRow key={t.id}><TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(t.occurred_at)}</TableCell><TableCell className="font-medium">{t.description || "Ingreso"}</TableCell><TableCell>{t.accounts?.name ?? "—"}</TableCell><TableCell className="tabular whitespace-nowrap text-right font-semibold text-success">+{formatMXN(t.amount)}</TableCell></TableRow>)}
    </TableBody></Table></Card>
  </>;
}

function ContactDialog({ clientId, contact }: { clientId: string; contact?: Tables<"client_contacts"> }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (f: FormData) => {
      const row = { name: String(f.get("name")).trim(), email: String(f.get("email")).trim() || null, phone: String(f.get("phone")).trim() || null, role: String(f.get("role")).trim() || null };
      const { error } = contact ? await supabase.from("client_contacts").update(row).eq("id", contact.id).eq("client_id", clientId) : await supabase.from("client_contacts").insert({ ...row, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients", clientId] }); toast.success(contact ? "Contacto actualizado" : "Contacto agregado"); setOpen(false); },
    onError: () => toast.error("No pudimos guardar el contacto. Intenta de nuevo."),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); m.mutate(new FormData(e.currentTarget)); };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild>{contact ? <Button size="icon" variant="ghost" aria-label={`Editar a ${contact.name}`} title="Editar contacto"><Pencil /></Button> : <Button size="sm" variant="outline"><Plus /> Contacto</Button>}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{contact ? "Editar contacto" : "Nuevo contacto"}</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4">
    <FormField label="Nombre" htmlFor="cname"><Input id="cname" name="name" required pattern=".*\S.*" defaultValue={contact?.name} /></FormField><FormField label="Puesto" htmlFor="crole"><Input id="crole" name="role" defaultValue={contact?.role ?? ""} /></FormField><FormField label="Correo" htmlFor="cemail"><Input id="cemail" name="email" type="email" defaultValue={contact?.email ?? ""} /></FormField><FormField label="Teléfono" htmlFor="cphone"><Input id="cphone" name="phone" defaultValue={contact?.phone ?? ""} /></FormField><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={m.isPending}>{m.isPending ? "Guardando…" : "Guardar"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
