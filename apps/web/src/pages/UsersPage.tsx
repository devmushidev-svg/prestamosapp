import { CheckCircle2, Mail, Pencil, Phone, ShieldCheck, UserCog, UserPlus, UserRoundX, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useProfile } from "../auth/ProfileContext";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Modal, Select } from "../components/ui";
import {
  inviteUser,
  listUsers,
  setUserActive,
  updateUser,
  type InviteUserInput,
  type UpdateUserInput,
} from "../lib/userService";
import type { Profile, Rol } from "../types";

const ROL_LABELS: Record<Rol, string> = {
  admin: "Administrador",
  prestamista: "Prestamista",
  gerente: "Gerente",
  cobrador: "Cobrador",
  supervisor: "Supervisor",
};

const EMPTY_INVITE: InviteUserInput = { nombre: "", apellido: "", email: "", telefono: "", rol: "prestamista" };
const EMPTY_EDIT: UpdateUserInput = { nombre: "", apellido: "", telefono: "", rol: "prestamista" };

function RoleBadge({ rol }: { rol: Rol }) {
  const isAdminRole = rol === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
        isAdminRole ? "bg-pf-primary-soft text-pf-primary-hover" : "bg-pf-info-soft text-pf-info"
      }`}
    >
      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {ROL_LABELS[rol] ?? rol}
    </span>
  );
}

function StatusBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
        activo ? "bg-pf-success-soft text-pf-success" : "bg-pf-danger-soft text-pf-danger"
      }`}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

export function UsersPage() {
  const { profile: myProfile } = useProfile();
  const [list, setList] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteUserInput>(EMPTY_INVITE);
  const [inviteErr, setInviteErr] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  const [editing, setEditing] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<UpdateUserInput>(EMPTY_EDIT);
  const [editErr, setEditErr] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleErr, setToggleErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setListErr("");
    try {
      setList(await listUsers());
    } catch (cause) {
      setListErr(cause instanceof Error ? cause.message : "No pudimos cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openInvite() {
    setInviteForm(EMPTY_INVITE);
    setInviteErr("");
    setInviteSent(false);
    setInviteOpen(true);
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteSending) return;
    setInviteErr("");
    if (!inviteForm.nombre.trim()) {
      setInviteErr("El nombre es obligatorio.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email.trim())) {
      setInviteErr("Ingrese un correo electrónico válido.");
      return;
    }
    setInviteSending(true);
    try {
      await inviteUser(inviteForm);
      setInviteSent(true);
      await load();
    } catch (cause) {
      setInviteErr(cause instanceof Error ? cause.message : "No se pudo enviar la invitación.");
    } finally {
      setInviteSending(false);
    }
  }

  function openEdit(userProfile: Profile) {
    setEditing(userProfile);
    setEditForm({
      nombre: userProfile.nombre,
      apellido: userProfile.apellido ?? "",
      telefono: userProfile.telefono ?? "",
      rol: userProfile.rol,
    });
    setEditErr("");
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setEditErr("");
    if (!editForm.nombre.trim()) {
      setEditErr("El nombre es obligatorio.");
      return;
    }
    setEditSaving(true);
    try {
      await updateUser(editing.id, editForm);
      setEditing(null);
      await load();
    } catch (cause) {
      setEditErr(cause instanceof Error ? cause.message : "No pudimos guardar los cambios.");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(userProfile: Profile) {
    setToggleErr("");
    setTogglingId(userProfile.id);
    try {
      await setUserActive(userProfile.id, !userProfile.activo);
      await load();
    } catch (cause) {
      setToggleErr(cause instanceof Error ? cause.message : "No pudimos cambiar el estado del usuario.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4 pf-safe-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero title="Usuarios" constrained>
          <p className="pf-page-lead max-w-2xl">Invite prestamistas y controle quién puede entrar a su empresa.</p>
          <p className="pf-page-lead-muted">Cada usuario establece su propia contraseña al aceptar la invitación.</p>
        </PageHero>
        <Button type="button" onClick={openInvite} className="min-h-[52px] w-full shrink-0 shadow-lg sm:min-h-[48px] sm:w-auto">
          <UserPlus className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
          Agregar usuario
        </Button>
      </div>

      {toggleErr ? <p className="rounded-xl border border-pf-danger-soft bg-pf-danger-soft/40 px-4 py-3 text-sm font-medium text-pf-danger" role="alert">{toggleErr}</p> : null}

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando usuarios…</Card>
      ) : listErr ? (
        <Card><EmptyState title="No se pudieron cargar los usuarios" description={listErr} icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>} /></Card>
      ) : list.length === 0 ? (
        <Card><EmptyState title="Todavía no hay usuarios" description="Agregue al primer prestamista de su equipo." icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" onClick={openInvite}><UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />Agregar usuario</Button>} /></Card>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {list.map((userProfile) => (
              <Card key={userProfile.id} className="space-y-3 border-white/70 bg-white/90 p-3 shadow-md shadow-stone-900/[0.04]">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
                    <UserCog className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-pf-text">{userProfile.nombre} {userProfile.apellido ?? ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5"><RoleBadge rol={userProfile.rol} /><StatusBadge activo={userProfile.activo} /></div>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-pf-text-secondary">
                  <p className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{userProfile.email}</span></p>
                  {userProfile.telefono ? <p className="flex min-w-0 items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden /><span className="min-w-0 break-words">{userProfile.telefono}</span></p> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-pf-border-soft pt-3">
                  <Button type="button" variant="secondary" className="px-2" aria-label={`Editar ${userProfile.nombre}`} onClick={() => openEdit(userProfile)}>
                    <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />Editar
                  </Button>
                  <Button
                    type="button"
                    variant={userProfile.activo ? "danger" : "secondary"}
                    className="px-2"
                    disabled={userProfile.id === myProfile?.id || togglingId === userProfile.id}
                    aria-label={userProfile.activo ? `Desactivar ${userProfile.nombre}` : `Activar ${userProfile.nombre}`}
                    onClick={() => void toggleActive(userProfile)}
                  >
                    <UserRoundX className="h-4 w-4" strokeWidth={2} aria-hidden />
                    {togglingId === userProfile.id ? "…" : userProfile.activo ? "Desactivar" : "Activar"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="pf-table-shell hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="pf-table-thead">
                  <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr>
                </thead>
                <tbody className="pf-table-body">
                  {list.map((userProfile) => (
                    <tr key={userProfile.id} className="pf-table-row">
                      <td className="px-4 py-3 font-bold text-pf-text">{userProfile.nombre} {userProfile.apellido ?? ""}</td>
                      <td className="px-4 py-3 text-pf-text-secondary">{userProfile.email}</td>
                      <td className="px-4 py-3"><RoleBadge rol={userProfile.rol} /></td>
                      <td className="px-4 py-3"><StatusBadge activo={userProfile.activo} /></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="secondary" className="min-h-9 rounded-lg px-3 py-1.5 text-xs" aria-label={`Editar ${userProfile.nombre}`} onClick={() => openEdit(userProfile)}>
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />Editar
                          </Button>
                          <Button
                            type="button"
                            variant={userProfile.activo ? "danger" : "secondary"}
                            className="min-h-9 rounded-lg px-3 py-1.5 text-xs"
                            disabled={userProfile.id === myProfile?.id || togglingId === userProfile.id}
                            aria-label={userProfile.activo ? `Desactivar ${userProfile.nombre}` : `Activar ${userProfile.nombre}`}
                            onClick={() => void toggleActive(userProfile)}
                          >
                            {togglingId === userProfile.id ? "…" : userProfile.activo ? "Desactivar" : "Activar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Modal open={inviteOpen} title="Agregar usuario" onClose={() => setInviteOpen(false)}>
        {inviteSent ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-pf-success" strokeWidth={2} aria-hidden />
            <p className="font-bold text-pf-text">Invitación enviada</p>
            <p className="text-sm text-pf-muted">{inviteForm.email} recibirá un correo para establecer su contraseña.</p>
            <Button type="button" className="w-full" onClick={() => setInviteOpen(false)}>Listo</Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void submitInvite(event)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre *" htmlFor="invite-nombre"><Input id="invite-nombre" data-autofocus="true" value={inviteForm.nombre} onChange={(event) => setInviteForm((current) => ({ ...current, nombre: event.target.value }))} required /></Field>
              <Field label="Apellido" htmlFor="invite-apellido"><Input id="invite-apellido" value={inviteForm.apellido} onChange={(event) => setInviteForm((current) => ({ ...current, apellido: event.target.value }))} /></Field>
            </div>
            <Field label="Correo electrónico *" htmlFor="invite-email"><Input id="invite-email" type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="prestamista@correo.com" required /></Field>
            <Field label="Teléfono" htmlFor="invite-telefono"><Input id="invite-telefono" inputMode="tel" value={inviteForm.telefono} onChange={(event) => setInviteForm((current) => ({ ...current, telefono: event.target.value }))} /></Field>
            <Field label="Rol" htmlFor="invite-rol">
              <Select id="invite-rol" value={inviteForm.rol} onChange={(event) => setInviteForm((current) => ({ ...current, rol: event.target.value as Rol }))}>
                <option value="prestamista">Prestamista</option>
              </Select>
            </Field>
            {inviteErr ? <p className="text-sm font-medium text-pf-danger" role="alert">{inviteErr}</p> : null}
            <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:flex-row sm:justify-end">
              <Button variant="secondary" type="button" onClick={() => setInviteOpen(false)} disabled={inviteSending}>Cancelar</Button>
              <Button type="submit" disabled={inviteSending}>{inviteSending ? "Enviando…" : "Enviar invitación"}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(editing)} title="Editar usuario" onClose={() => setEditing(null)}>
        <form className="space-y-4" onSubmit={(event) => void submitEdit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre *" htmlFor="edit-nombre"><Input id="edit-nombre" data-autofocus="true" value={editForm.nombre} onChange={(event) => setEditForm((current) => ({ ...current, nombre: event.target.value }))} required /></Field>
            <Field label="Apellido" htmlFor="edit-apellido"><Input id="edit-apellido" value={editForm.apellido} onChange={(event) => setEditForm((current) => ({ ...current, apellido: event.target.value }))} /></Field>
          </div>
          <Field label="Teléfono" htmlFor="edit-telefono"><Input id="edit-telefono" inputMode="tel" value={editForm.telefono} onChange={(event) => setEditForm((current) => ({ ...current, telefono: event.target.value }))} /></Field>
          <Field label="Rol" htmlFor="edit-rol">
            <Select
              id="edit-rol"
              value={editForm.rol}
              disabled={editing?.id === myProfile?.id}
              onChange={(event) => setEditForm((current) => ({ ...current, rol: event.target.value as Rol }))}
            >
              <option value="prestamista">Prestamista</option>
              <option value="admin">Administrador</option>
            </Select>
            {editing?.id === myProfile?.id ? <span className="text-xs text-pf-muted">No puede cambiar su propio rol.</span> : null}
          </Field>
          {editErr ? <p className="text-sm font-medium text-pf-danger" role="alert">{editErr}</p> : null}
          <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setEditing(null)} disabled={editSaving}>Cancelar</Button>
            <Button type="submit" disabled={editSaving}>{editSaving ? "Guardando…" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
