import { AlertTriangle, BriefcaseBusiness, FilePlus2, MapPin, Pencil, Phone, ReceiptText, Search, UserPlus, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { CustomerStatusBadge } from "../components/CustomerStatusBadge";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Modal, PaginationBar, Select, Textarea } from "../components/ui";
import { listCustomers, saveCustomer, type CustomerInput } from "../lib/customerService";
import type { Cliente, EstadoCliente } from "../types";

const EMPTY_FORM: CustomerInput = {
  nombre: "",
  identidad: "",
  telefono: "",
  direccion: "",
  lugar_trabajo: "",
  referencias: "",
  estado: "activo",
  notas: "",
};
const PAGE_SIZE = 12;

export function CustomersPage() {
  const navigate = useNavigate();
  const { status: businessConfigStatus } = useBusinessConfig();
  const [list, setList] = useState<Cliente[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<CustomerInput>(EMPTY_FORM);
  const [err, setErr] = useState("");
  const [listErr, setListErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListErr("");
    try {
      setList(await listCustomers());
    } catch {
      setListErr("No pudimos cargar los clientes. Revise la conexión e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es-HN");
    if (!needle) return list;
    return list.filter((customer) =>
      [customer.nombre, customer.identidad, customer.telefono, customer.direccion, customer.lugar_trabajo]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("es-HN").includes(needle))
    );
  }, [list, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErr("");
    setOpen(true);
  }

  function openEdit(customer: Cliente) {
    setEditing(customer);
    setForm({
      nombre: customer.nombre,
      identidad: customer.identidad ?? "",
      telefono: customer.telefono ?? "",
      direccion: customer.direccion ?? "",
      lugar_trabajo: customer.lugar_trabajo ?? "",
      referencias: customer.referencias ?? "",
      estado: customer.estado ?? "activo",
      notas: customer.notas ?? "",
    });
    setErr("");
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr("");
    if (!form.nombre.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      await saveCustomer(form, editing?.id);
      setOpen(false);
      await load();
    } catch (cause) {
      setErr(cause instanceof Error && cause.message.startsWith("Falta aplicar")
        ? cause.message
        : "No pudimos guardar el cliente. Revise la conexión e intente de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function newLoan(customer: Cliente) {
    navigate(`/prestamos/nuevo?clienteId=${encodeURIComponent(customer.id)}`);
  }

  return (
    <div className="space-y-4 pf-safe-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero title="Clientes" constrained>
          <p className="pf-page-lead max-w-2xl">Administre las personas de su cartera y sus datos de contacto.</p>
          <p className="pf-page-lead-muted">La identidad, el teléfono y las referencias quedan disponibles al crear el préstamo.</p>
        </PageHero>
        <Button type="button" onClick={openCreate} className="min-h-[52px] w-full shrink-0 shadow-lg sm:min-h-[48px] sm:w-auto">
          <UserPlus className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
          Nuevo cliente
        </Button>
      </div>

      {businessConfigStatus === "missing_schema" ? (
        <div className="flex items-start gap-3 rounded-xl border border-pf-warning-soft bg-pf-warning-soft/55 px-4 py-3 text-sm text-pf-text-secondary" role="status">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-pf-warning" strokeWidth={2} aria-hidden />
          <div>
            <p className="font-bold text-pf-text">Actualización de ficha pendiente</p>
            <p className="mt-0.5 text-xs">Nombre, DNI, teléfono, dirección y notas siguen funcionando. Trabajo, referencias y estado se guardarán después de aplicar la actualización consolidada.</p>
          </div>
        </div>
      ) : null}

      <Card className="p-3 sm:p-4">
        <Field label="Buscar cliente" htmlFor="customer-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pf-muted" strokeWidth={2} aria-hidden />
            <Input
              id="customer-search"
              className="pl-10"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, DNI, teléfono, dirección o trabajo…"
            />
          </div>
        </Field>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando clientes…</Card>
      ) : listErr ? (
        <Card><EmptyState title="No se pudieron cargar los clientes" description={listErr} icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>} /></Card>
      ) : list.length === 0 ? (
        <Card><EmptyState title="Aún no hay clientes" description="Registre el primer cliente para comenzar su cartera de préstamos." icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" onClick={openCreate}><UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />Nuevo cliente</Button>} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState title="No encontramos coincidencias" description="Pruebe con otro nombre, identidad o teléfono." icon={<Search className="h-5 w-5" strokeWidth={2} aria-hidden />} /></Card>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {visible.map((customer) => (
              <Card key={customer.id} className="space-y-3 border-white/70 bg-white/90 p-3 shadow-md shadow-stone-900/[0.04]">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
                    <UserRound className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-pf-text">{customer.nombre}</p>
                    <div className="mt-1"><CustomerStatusBadge status={customer.estado} /></div>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-pf-text-secondary">
                  <p className="flex min-w-0 items-center gap-2"><ReceiptText className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{customer.identidad || "Sin DNI"}</span></p>
                  <p className="flex min-w-0 items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{customer.telefono || "Sin teléfono"}</span></p>
                  <p className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{customer.direccion || "Sin dirección"}</span></p>
                  {customer.lugar_trabajo ? <p className="flex min-w-0 items-center gap-2"><BriefcaseBusiness className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{customer.lugar_trabajo}</span></p> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-pf-border-soft pt-3">
                  <Button type="button" className="px-2" aria-label={`Crear préstamo para ${customer.nombre}`} disabled={customer.estado === "cancelado"} onClick={() => newLoan(customer)}>
                    <FilePlus2 className="h-4 w-4" strokeWidth={2} aria-hidden />Préstamo
                  </Button>
                  <Button type="button" variant="secondary" className="px-2" aria-label={`Editar cliente ${customer.nombre}`} onClick={() => openEdit(customer)}>
                    <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />Editar
                  </Button>
                </div>
              </Card>
            ))}
            {filtered.length > PAGE_SIZE ? (
              <Card className="overflow-hidden p-0">
                <PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filtered.length} itemLabel="clientes" onPageChange={setPage} />
              </Card>
            ) : null}
          </div>

          <Card className="pf-table-shell hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="pf-table-thead">
                  <tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Identidad</th><th className="px-4 py-3">Teléfono</th><th className="px-4 py-3">Dirección / trabajo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr>
                </thead>
                <tbody className="pf-table-body">
                  {visible.map((customer) => (
                    <tr key={customer.id} className="pf-table-row">
                      <td className="px-4 py-3 font-bold text-pf-text">{customer.nombre}</td>
                      <td className="px-4 py-3 text-pf-text-secondary">{customer.identidad || "—"}</td>
                      <td className="px-4 py-3 text-pf-text-secondary">{customer.telefono || "—"}</td>
                      <td className="max-w-[260px] px-4 py-3"><p className="truncate text-pf-text-secondary">{customer.direccion || "Sin dirección"}</p>{customer.lugar_trabajo ? <p className="truncate text-xs text-pf-muted">{customer.lugar_trabajo}</p> : null}</td>
                      <td className="px-4 py-3"><CustomerStatusBadge status={customer.estado} /></td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button type="button" className="min-h-9 rounded-lg px-3 py-1.5 text-xs" aria-label={`Crear préstamo para ${customer.nombre}`} disabled={customer.estado === "cancelado"} onClick={() => newLoan(customer)}><FilePlus2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />Préstamo</Button><Button type="button" variant="secondary" className="min-h-9 rounded-lg px-3 py-1.5 text-xs" aria-label={`Editar cliente ${customer.nombre}`} onClick={() => openEdit(customer)}><Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />Editar</Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={safePage} pageSize={PAGE_SIZE} total={filtered.length} itemLabel="clientes" onPageChange={setPage} />
          </Card>
        </>
      )}

      <Modal open={open} title={editing ? "Editar cliente" : "Nuevo cliente"} onClose={() => setOpen(false)} wide maxWidthClass="sm:max-w-3xl">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <Field label="Nombre completo *" htmlFor="customer-name" className="sm:col-span-2"><Input id="customer-name" data-autofocus="true" autoComplete="name" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} required /></Field>
          <Field label="Identidad (DNI)" htmlFor="customer-id"><Input id="customer-id" value={form.identidad} onChange={(event) => setForm((current) => ({ ...current, identidad: event.target.value }))} placeholder="0801-1990-12345" /></Field>
          <Field label="Teléfono" htmlFor="customer-phone"><Input id="customer-phone" inputMode="tel" autoComplete="tel" value={form.telefono} onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))} /></Field>
          <Field label="Dirección" htmlFor="customer-address" className="sm:col-span-2"><Textarea id="customer-address" rows={2} autoComplete="street-address" value={form.direccion} onChange={(event) => setForm((current) => ({ ...current, direccion: event.target.value }))} /></Field>
          <Field label="Lugar de trabajo (opcional)" htmlFor="customer-work"><Input id="customer-work" value={form.lugar_trabajo} onChange={(event) => setForm((current) => ({ ...current, lugar_trabajo: event.target.value }))} /></Field>
          <Field label="Estado" htmlFor="customer-status"><Select id="customer-status" value={form.estado} onChange={(event) => setForm((current) => ({ ...current, estado: event.target.value as EstadoCliente }))}><option value="activo">Activo</option><option value="moroso">Moroso</option><option value="cancelado">Cancelado</option></Select></Field>
          <Field label="Referencias (opcional)" htmlFor="customer-references"><Textarea id="customer-references" rows={3} value={form.referencias} onChange={(event) => setForm((current) => ({ ...current, referencias: event.target.value }))} placeholder="Nombre, relación y teléfono; una referencia por línea" /></Field>
          <Field label="Notas internas" htmlFor="customer-notes"><Textarea id="customer-notes" rows={3} value={form.notas} onChange={(event) => setForm((current) => ({ ...current, notas: event.target.value }))} /><span className="text-xs text-pf-muted">Estas notas no se imprimen en recibos.</span></Field>
          {err ? <p className="text-sm font-medium text-pf-danger sm:col-span-2" role="alert">{err}</p> : null}
          <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:col-span-2 sm:flex-row sm:justify-end"><Button variant="secondary" type="button" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving || !form.nombre.trim()}>{saving ? "Guardando…" : "Guardar cliente"}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
