import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ComingSoon, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyRow, FormField, NativeSelect } from "@/components/form-bits";
import { employeesQuery } from "@/lib/data";
import { formatDate, formatMXN } from "@/lib/format";
import { matchesDirectory, employeeStatuses } from "@/lib/directory";
import { pageMeta } from "@/lib/metadata";
import { DirectoryLoading, DirectoryError } from "@/components/directory-feedback";
import { DeleteConfirmation } from "@/components/delete-confirmation";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search["q"] === "string" ? search["q"] : "", status: typeof search["status"] === "string" ? search["status"] : "" }),
  loader: async ({ context }) => { await context.queryClient.ensureQueryData(employeesQuery); },
  head: () => pageMeta("Colaboradores", "Directorio de colaboradores y datos de tu equipo en Handle."),
  pendingComponent: DirectoryLoading,
  errorComponent: DirectoryError,
  notFoundComponent: () => <p>Colaborador no encontrado.</p>,
  component: Colaboradores,
});

type Employee = Tables<"employees">;

function Colaboradores() {
  const { data: employees } = useSuspenseQuery(employeesQuery);
  const { q, status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const rows = employees.filter((e) => matchesDirectory({ name: e.full_name, secondary: e.position, status: e.status }, q, status));
  const clear = () => navigate({ search: { q: "", status: "" }, replace: true });
  const [editing, setEditing] = useState<Employee | null | "new">(null);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Colaborador eliminado"); },
    onError: () => toast.error("No pudimos guardar el cambio. Intenta de nuevo."),
  });

  return (
    <>
      <PageHeader
        title="Colaboradores"
        description={`${employees.length} personas en tu equipo`}
        actions={<Button onClick={() => setEditing("new")}><Plus /> Nuevo colaborador</Button>}
      />
      <Card className="shadow-card">
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <div className="relative min-w-0"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar colaboradores" placeholder="Buscar por nombre o puesto" className="pl-9" value={q} onChange={(e) => navigate({ search: (prev) => ({ ...prev, q: e.target.value }), replace: true })} /></div>
          <NativeSelect aria-label="Filtrar colaboradores por estado" value={status} onChange={(e) => navigate({ search: (prev) => ({ ...prev, status: e.target.value }), replace: true })}><option value="">Todos los estados</option>{employeeStatuses.map((value) => <option key={value} value={value}>{value === "activo" ? "Activo" : "Inactivo"}</option>)}<option value="vacaciones">Vacaciones (anterior)</option><option value="baja">Baja (anterior)</option></NativeSelect>
          {(q || status) && <Button variant="ghost" onClick={clear}>Limpiar</Button>}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Puesto</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Salario mensual</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <EmptyRow cols={6} text={employees.length ? "No encontramos colaboradores con estos filtros." : "Agrega a la primera persona de tu equipo."} action={employees.length ? <Button variant="outline" onClick={clear}>Limpiar filtros</Button> : <Button onClick={() => setEditing("new")}><Plus /> Nuevo colaborador</Button>} />}
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.full_name}</TableCell>
                <TableCell className="text-muted-foreground">{e.position ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(e.hire_date + "T12:00:00")}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell className="tabular text-right">{formatMXN(e.salary)}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" aria-label={`Editar a ${e.full_name}`} title="Editar colaborador" onClick={() => setEditing(e)}><Pencil /></Button>
                  <DeleteConfirmation name={e.full_name} pending={del.isPending} onDelete={() => del.mutateAsync(e.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ComingSoon title="Nómina" description="Cálculo de nómina, ISR e IMSS con timbrado de recibos." />
        <ComingSoon title="Vacaciones" description="Solicitudes, aprobaciones y saldo de días por colaborador." />
      </div>
      {editing && <EmployeeDialog employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EmployeeDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (f: FormData) => {
      const row = {
        full_name: String(f.get("full_name")),
        position: String(f.get("position")) || null,
        salary: Number(f.get("salary")),
        hire_date: String(f.get("hire_date")),
        status: String(f.get("status")),
      };
      const { error } = employee
        ? await supabase.from("employees").update(row).eq("id", employee.id)
        : await supabase.from("employees").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Colaborador guardado"); onClose(); },
    onError: () => toast.error("No pudimos guardar el cambio. Intenta de nuevo."),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); m.mutate(new FormData(e.currentTarget)); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{employee ? "Editar colaborador" : "Nuevo colaborador"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Nombre completo" htmlFor="full_name"><Input id="full_name" name="full_name" required defaultValue={employee?.full_name} /></FormField>
          </div>
          <FormField label="Puesto" htmlFor="position"><Input id="position" name="position" defaultValue={employee?.position ?? ""} /></FormField>
          <FormField label="Salario mensual (MXN)" htmlFor="salary"><Input id="salary" name="salary" type="number" step="0.01" min="0" required defaultValue={employee?.salary ?? ""} /></FormField>
          <FormField label="Fecha de ingreso" htmlFor="hire_date"><Input id="hire_date" name="hire_date" type="date" required defaultValue={employee?.hire_date ?? new Date().toISOString().slice(0, 10)} /></FormField>
          <FormField label="Estado" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={employee?.status ?? "activo"}>
              {employeeStatuses.map((value) => <option key={value} value={value}>{value === "activo" ? "Activo" : "Inactivo"}</option>)}
              {employee && !employeeStatuses.some((value) => value === employee.status) && <option value={employee.status}>{employee.status === "vacaciones" ? "Vacaciones (anterior)" : "Baja (anterior)"}</option>}
            </NativeSelect>
          </FormField>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={m.isPending}>{m.isPending ? "Guardando…" : "Guardar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
