import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteConfirmation({ name, pending, onDelete, label = "Eliminar" }: { name: string; pending: boolean; onDelete: () => Promise<unknown>; label?: string }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}><DialogTrigger asChild><Button size="icon" variant="ghost" aria-label={`${label} a ${name}`} title={label}><Trash2 className="size-4" /></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>¿Eliminar a {name}?</DialogTitle><DialogDescription>Esta acción no se puede deshacer.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={pending} onClick={async () => { try { await onDelete(); setOpen(false); } catch { /* Mutation displays its error toast. */ } }}>{pending ? "Eliminando…" : "Eliminar"}</Button></DialogFooter></DialogContent></Dialog>;
}