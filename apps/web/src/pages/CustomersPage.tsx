import { Pencil, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Modal, Textarea } from "../components/ui";
import { supabase } from "../lib/supabase";
import type { Cliente } from "../types";

const emptyForm = { nombre: "", identidad: "", telefono: "", direccion: "", notas: "" };

export function CustomersPage() {
  const [list, setList] = useState<Cliente[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState("");
  const [listErr, setListErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListErr("");
    try {
      const { data, error } = await supabase.from("clientes").select("*").order("nombre");
      if (error) throw error;
      setListErr("");
      setList(data as Cliente[]);
    } catch {
      setListErr("No pudimos cargar los clientes. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErr("");
    setOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditing(c);
    setForm({
      nombre: c.nombre,
      identidad: c.identidad ?? "",
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      notas: c.notas ?? "",
    });
    setErr("");
    setOpen(true);
  }

  async function save() {
    setErr("");
    if (!form.nombre.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const row = {
        nombre: form.nombre.trim(),
        identidad: form.identidad.trim() || null,
        telefono: form.telefono.trim() || null,
        direccion: form.direccion.trim() || null,
        notas: form.notas.trim() || null,
      };
      const { error } = editing
        ? await supabase.from("clientes").update(row).eq("id", editing.id)
        : await supabase.from("clientes").insert(row);
      if (error) throw error;
      setOpen(false);
      await load();
    } catch {
      setErr("No pudimos guardar el cliente. Revise la conexión e intente de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pf-safe-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero title={"Clientes"} constrained>
          <p className="pf-page-lead max-w-2xl">
            Qué es: las personas a quienes presta; sus datos van en el préstamo y en el recibo de pago.
          </p>
          <p className="pf-page-lead-muted">
            Registre nombre, identidad (DNI) y teléfono antes de crear el préstamo.
          </p>
        </PageHero>
        <Button
          type="button"
          onClick={openCreate}
          className="min-h-[52px] w-full shrink-0 shadow-lg sm:w-auto sm:min-h-[48px]"
        >
          <UserPlus className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
          Nuevo cliente
        </Button>
      </div>
      <Card className="divide-y divide-pf-border-soft border-white/50 shadow-lg shadow-stone-900/[0.04]">
        {loading ? (
          <p className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">
            Cargando clientes…
          </p>
        ) : listErr ? (
          <EmptyState
            title="No se pudieron cargar los clientes"
            description={listErr}
            icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState
            title="Aún no hay clientes"
            description="Registre el primer cliente para comenzar su cartera de préstamos."
            icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />}
            action={
              <Button type="button" onClick={openCreate}>
                <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
                Nuevo cliente
              </Button>
            }
          />
        ) : (
          list.map((c) => (
            <div
              key={c.id}
              className="pf-list-row-hover flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-bold text-pf-text">{c.nombre}</p>
                <p className="text-sm font-medium text-pf-text-tertiary">
                  {[c.telefono, c.identidad].filter(Boolean).join(" · ") || "Sin teléfono / identidad"}
                </p>
                {c.direccion ? <p className="mt-0.5 text-xs text-pf-muted">{c.direccion}</p> : null}
              </div>
              <Button type="button" variant="secondary" className="min-h-10 shrink-0" onClick={() => openEdit(c)}>
                <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                Editar
              </Button>
            </div>
          ))
        )}
      </Card>

      <Modal
        open={open}
        title={editing ? `Editar: ${editing.nombre}` : "Nuevo cliente"}
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Nombre *" htmlFor="cliente-nombre">
            <Input id="cliente-nombre" data-autofocus="true" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} required />
          </Field>
          <Field label="Identidad (DNI)" htmlFor="cliente-identidad">
            <Input
              id="cliente-identidad"
              value={form.identidad}
              onChange={(e) => setForm((f) => ({ ...f, identidad: e.target.value }))}
              placeholder="0801-1990-12345"
            />
          </Field>
          <Field label="Teléfono" htmlFor="cliente-telefono">
            <Input id="cliente-telefono" inputMode="tel" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
          </Field>
          <Field label="Dirección" htmlFor="cliente-direccion">
            <Input id="cliente-direccion" value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
          </Field>
          <Field label="Notas" htmlFor="cliente-notas">
            <Textarea id="cliente-notas" rows={2} value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          </Field>
          {err ? (
            <p className="text-sm text-pf-danger" role="alert">
              {err}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !form.nombre.trim()}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
