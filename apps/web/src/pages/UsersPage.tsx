import { ArrowRightLeft, CheckCircle2, Mail, Pencil, Phone, ShieldCheck, TriangleAlert, UserCog, UserPlus, UserRoundX, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useProfile } from "../auth/ProfileContext";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { PageHero } from "../components/PageHero";
import { Button, Card, EmptyState, Field, Input, Modal, Select } from "../components/ui";
import { useOffline } from "../offline/OfflineContext";
import {
  inviteUser,
  listUsers,
  MasterTransferError,
  setUserActive,
  transferMasterAccount,
  updateUser,
  type InviteUserInput,
  type UpdateUserInput,
} from "../lib/userService";
import type { Profile, Rol } from "../types";

const ROL_LABELS: Record<Rol, string> = {
  admin: "Cuenta maestra",
  prestamista: "Prestamista",
  gerente: "Gerente",
  cobrador: "Cobrador",
  supervisor: "Supervisor",
};

const EMPTY_INVITE: InviteUserInput = { nombre: "", apellido: "", email: "", telefono: "", rol: "prestamista" };
const EMPTY_EDIT: UpdateUserInput = { nombre: "", apellido: "", telefono: "", rol: "prestamista" };
const TRANSFER_NOTICE_KEY = "multiprestamos.master-transfer-notice";

function saveTransferNotice(message: string) {
  try {
    window.sessionStorage.setItem(TRANSFER_NOTICE_KEY, message);
  } catch {
    // El bloqueo de permisos sigue siendo seguro aunque no pueda persistir el aviso.
  }
}

function takeTransferNotice() {
  try {
    const message = window.sessionStorage.getItem(TRANSFER_NOTICE_KEY) ?? "";
    window.sessionStorage.removeItem(TRANSFER_NOTICE_KEY);
    return message;
  } catch {
    return "";
  }
}

function RoleBadge({ rol }: { rol: Rol }) {
  const isMasterRole = rol === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
        isMasterRole ? "bg-pf-primary-soft text-pf-primary-hover" : "bg-pf-info-soft text-pf-info"
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
  const { profile: myProfile, reload: reloadMyProfile } = useProfile();
  const { config } = useBusinessConfig();
  const { online, syncing, preparing, pending, attention, syncNow } = useOffline();
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
  const [toggleErr, setToggleErr] = useState(takeTransferNotice);

  const [transferOpen, setTransferOpen] = useState(false);
  const [newMasterId, setNewMasterId] = useState("");
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [transferErr, setTransferErr] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [pendingTransferEdits, setPendingTransferEdits] = useState<{
    userId: string;
    input: UpdateUserInput;
  } | null>(null);

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
    if (userProfile.rol === "admin") return;
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
    if (!editing || editing.rol === "admin") return;
    setEditErr("");
    if (!editForm.nombre.trim()) {
      setEditErr("El nombre es obligatorio.");
      return;
    }
    if (editForm.rol === "admin") {
      if (transferBlockedMessage) {
        setEditErr(transferBlockedMessage);
        return;
      }
      if (!editing.activo || editing.rol !== "prestamista") {
        setEditErr("Solo puede transferir la cuenta maestra a un prestamista activo.");
        return;
      }
      setNewMasterId(editing.id);
      setPendingTransferEdits({
        userId: editing.id,
        input: { ...editForm, rol: "prestamista" },
      });
      setTransferConfirmed(false);
      setTransferErr("");
      setEditing(null);
      setTransferOpen(true);
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
    if (userProfile.rol === "admin") return;
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

  function openTransfer() {
    if (transferBlockedMessage) {
      setToggleErr(transferBlockedMessage);
      return;
    }
    setNewMasterId("");
    setPendingTransferEdits(null);
    setTransferConfirmed(false);
    setTransferErr("");
    setTransferOpen(true);
  }

  function closeTransfer() {
    if (transferSaving) return;
    setTransferOpen(false);
    setPendingTransferEdits(null);
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (transferSaving) return;
    if (transferBlockedMessage) {
      setTransferErr(transferBlockedMessage);
      return;
    }
    const selected = list.find((userProfile) => userProfile.id === newMasterId);
    if (!selected || selected.rol !== "prestamista" || !selected.activo || selected.id === myProfile?.id) {
      setTransferErr("Seleccione un prestamista activo de esta empresa.");
      return;
    }
    if (!transferConfirmed) {
      setTransferErr("Confirme que entiende el cambio de permisos antes de continuar.");
      return;
    }
    setTransferErr("");
    setTransferSaving(true);
    try {
      if (pendingTransferEdits?.userId === selected.id) {
        await updateUser(selected.id, pendingTransferEdits.input);
      }
      await transferMasterAccount(selected.id);
      setTransferOpen(false);
      setPendingTransferEdits(null);
      await reloadMyProfile({ recoverInvalidAccess: true });
      void syncNow();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No pudimos transferir la cuenta maestra.";
      if (cause instanceof MasterTransferError) {
        if (cause.requiresAccessRecovery) saveTransferNotice(message);
        await reloadMyProfile({
          silent: !cause.requiresAccessRecovery,
          recoverInvalidAccess: cause.requiresAccessRecovery,
        });
      }
      if (!(cause instanceof MasterTransferError && cause.requiresAccessRecovery)) {
        setTransferErr(message);
      }
      void syncNow();
    } finally {
      setTransferSaving(false);
    }
  }

  const masterProfile = list.find((userProfile) => userProfile.rol === "admin")
    ?? (myProfile?.rol === "admin" ? myProfile : null);
  const transferBlockedMessage = !online
    ? "Conéctese a Internet para transferir la cuenta maestra."
    : syncing || preparing
      ? "Espere a que termine la sincronización antes de transferir la cuenta maestra."
      : pending > 0 || attention > 0
        ? "Sincronice o revise las operaciones pendientes antes de transferir la cuenta maestra."
        : "";
  const transferCandidates = list.filter((userProfile) =>
    userProfile.id !== myProfile?.id && userProfile.rol === "prestamista" && userProfile.activo
  );
  const selectedNewMaster = transferCandidates.find((userProfile) => userProfile.id === newMasterId) ?? null;
  const orderedList = [...list].sort((left, right) => {
    if (left.rol === "admin" && right.rol !== "admin") return -1;
    if (right.rol === "admin" && left.rol !== "admin") return 1;
    return `${left.nombre} ${left.apellido ?? ""}`.localeCompare(`${right.nombre} ${right.apellido ?? ""}`, "es");
  });

  return (
    <div className="space-y-4 pf-safe-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHero title="Usuarios de la empresa" constrained>
          <p className="pf-page-lead max-w-2xl">
            Administre el equipo de {config?.nombre_negocio || "su empresa"} desde su cuenta maestra.
          </p>
          <p className="pf-page-lead-muted">Cada invitación queda vinculada únicamente a esta empresa y el usuario establece su propia contraseña.</p>
        </PageHero>
        <Button type="button" onClick={openInvite} className="min-h-[52px] w-full shrink-0 shadow-lg sm:min-h-[48px] sm:w-auto">
          <UserPlus className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
          Invitar usuario
        </Button>
      </div>

      <Card className="flex flex-col gap-3 border-pf-primary-soft bg-pf-primary-soft/25 p-4 sm:flex-row sm:items-center">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
          <ShieldCheck className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-extrabold text-pf-text">Cuenta maestra</h2>
            <span className="rounded-full bg-pf-success-soft px-2.5 py-1 text-[11px] font-bold text-pf-success">Protegida</span>
          </div>
          <p className="mt-1 text-sm text-pf-text-secondary">
            Es la única cuenta que configura la empresa, invita usuarios y administra todo el equipo.
          </p>
          {masterProfile ? (
            <p className="mt-1 truncate text-xs font-semibold text-pf-muted">
              {masterProfile.nombre} {masterProfile.apellido ?? ""} · {masterProfile.email}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 sm:text-right">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={loading || transferCandidates.length === 0 || Boolean(transferBlockedMessage)}
            onClick={openTransfer}
          >
            <ArrowRightLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Transferir cuenta maestra
          </Button>
          {!loading && transferCandidates.length === 0 ? (
            <p className="mt-1.5 text-xs text-pf-muted">Necesita un prestamista activo para transferirla.</p>
          ) : transferBlockedMessage ? (
            <p className="mt-1.5 max-w-sm text-xs text-pf-muted">{transferBlockedMessage}</p>
          ) : null}
        </div>
      </Card>

      {toggleErr ? <p className="rounded-xl border border-pf-danger-soft bg-pf-danger-soft/40 px-4 py-3 text-sm font-medium text-pf-danger" role="alert">{toggleErr}</p> : null}

      {loading ? (
        <Card className="p-8 text-center text-sm font-medium text-pf-muted" aria-live="polite">Cargando usuarios…</Card>
      ) : listErr ? (
        <Card><EmptyState title="No se pudieron cargar los usuarios" description={listErr} icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" variant="secondary" onClick={() => void load()}>Reintentar</Button>} /></Card>
      ) : list.length === 0 ? (
        <Card><EmptyState title="Todavía no hay usuarios" description="Invite al primer prestamista de su equipo." icon={<Users className="h-5 w-5" strokeWidth={2} aria-hidden />} action={<Button type="button" onClick={openInvite}><UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />Invitar usuario</Button>} /></Card>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {orderedList.map((userProfile) => (
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
                {userProfile.rol === "admin" ? (
                  <p className="border-t border-pf-border-soft pt-3 text-center text-xs font-semibold text-pf-muted">
                    La cuenta maestra se administra desde Mi perfil.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 border-t border-pf-border-soft pt-3">
                    <Button type="button" variant="secondary" className="px-2" aria-label={`Editar ${userProfile.nombre}`} onClick={() => openEdit(userProfile)}>
                      <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />Editar
                    </Button>
                    <Button
                      type="button"
                      variant={userProfile.activo ? "danger" : "secondary"}
                      className="px-2"
                      disabled={togglingId === userProfile.id}
                      aria-label={userProfile.activo ? `Desactivar ${userProfile.nombre}` : `Activar ${userProfile.nombre}`}
                      onClick={() => void toggleActive(userProfile)}
                    >
                      <UserRoundX className="h-4 w-4" strokeWidth={2} aria-hidden />
                      {togglingId === userProfile.id ? "…" : userProfile.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                )}
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
                  {orderedList.map((userProfile) => (
                    <tr key={userProfile.id} className="pf-table-row">
                      <td className="px-4 py-3 font-bold text-pf-text">{userProfile.nombre} {userProfile.apellido ?? ""}</td>
                      <td className="px-4 py-3 text-pf-text-secondary">{userProfile.email}</td>
                      <td className="px-4 py-3"><RoleBadge rol={userProfile.rol} /></td>
                      <td className="px-4 py-3"><StatusBadge activo={userProfile.activo} /></td>
                      <td className="px-4 py-3">
                        {userProfile.rol === "admin" ? (
                          <p className="text-right text-xs font-semibold text-pf-muted">Cuenta protegida</p>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" className="min-h-9 rounded-lg px-3 py-1.5 text-xs" aria-label={`Editar ${userProfile.nombre}`} onClick={() => openEdit(userProfile)}>
                              <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />Editar
                            </Button>
                            <Button
                              type="button"
                              variant={userProfile.activo ? "danger" : "secondary"}
                              className="min-h-9 rounded-lg px-3 py-1.5 text-xs"
                              disabled={togglingId === userProfile.id}
                              aria-label={userProfile.activo ? `Desactivar ${userProfile.nombre}` : `Activar ${userProfile.nombre}`}
                              onClick={() => void toggleActive(userProfile)}
                            >
                              {togglingId === userProfile.id ? "…" : userProfile.activo ? "Desactivar" : "Activar"}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Modal open={inviteOpen} title="Invitar usuario" onClose={() => setInviteOpen(false)}>
        {inviteSent ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-pf-success" strokeWidth={2} aria-hidden />
            <p className="font-bold text-pf-text">Invitación enviada</p>
            <p className="text-sm text-pf-muted">
              {inviteForm.email} recibirá un correo para establecer su contraseña y entrar únicamente a {config?.nombre_negocio || "esta empresa"}.
            </p>
            <Button type="button" className="w-full" onClick={() => setInviteOpen(false)}>Listo</Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void submitInvite(event)}>
            <div className="rounded-xl border border-pf-info-soft bg-pf-info-soft/35 px-3 py-2.5 text-xs leading-relaxed text-pf-text-secondary">
              La cuenta se creará dentro de <strong>{config?.nombre_negocio || "esta empresa"}</strong>. No tendrá acceso a información de otras empresas.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre *" htmlFor="invite-nombre"><Input id="invite-nombre" data-autofocus="true" value={inviteForm.nombre} onChange={(event) => setInviteForm((current) => ({ ...current, nombre: event.target.value }))} required /></Field>
              <Field label="Apellido" htmlFor="invite-apellido"><Input id="invite-apellido" value={inviteForm.apellido} onChange={(event) => setInviteForm((current) => ({ ...current, apellido: event.target.value }))} /></Field>
            </div>
            <Field label="Correo electrónico *" htmlFor="invite-email"><Input id="invite-email" type="email" value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="prestamista@correo.com" required /></Field>
            <Field label="Teléfono" htmlFor="invite-telefono"><Input id="invite-telefono" inputMode="tel" value={inviteForm.telefono} onChange={(event) => setInviteForm((current) => ({ ...current, telefono: event.target.value }))} /></Field>
            <Field label="Rol" htmlFor="invite-rol">
              <Input id="invite-rol" value="Prestamista" readOnly aria-readonly="true" />
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
              disabled={editing?.rol !== "prestamista"}
              onChange={(event) => setEditForm((current) => ({ ...current, rol: event.target.value as Rol }))}
            >
              {editing && editing.rol !== "prestamista" ? (
                <option value={editing.rol}>{ROL_LABELS[editing.rol] ?? editing.rol}</option>
              ) : null}
              <option value="prestamista">Prestamista</option>
              <option value="admin" disabled={!editing?.activo || Boolean(transferBlockedMessage)}>Cuenta maestra</option>
            </Select>
            <span className="text-xs text-pf-muted">
              {editing?.activo
                ? "Elegir Cuenta maestra abrirá una confirmación antes de cambiar los permisos."
                : "Active primero al prestamista para poder transferirle la cuenta maestra."}
            </span>
          </Field>
          {editErr ? <p className="text-sm font-medium text-pf-danger" role="alert">{editErr}</p> : null}
          <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setEditing(null)} disabled={editSaving}>Cancelar</Button>
            <Button type="submit" disabled={editSaving}>
              {editSaving ? "Guardando…" : editForm.rol === "admin" ? "Continuar" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={transferOpen} title="Transferir cuenta maestra" onClose={closeTransfer}>
        <form className="space-y-4" onSubmit={(event) => void submitTransfer(event)}>
          <div className="flex gap-3 rounded-xl border border-pf-warning-soft bg-pf-warning-soft/40 p-3 text-sm text-pf-text-secondary">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-pf-warning" strokeWidth={2} aria-hidden />
            <p>
              Este cambio es inmediato. La nueva cuenta podrá configurar la empresa e invitar usuarios.
            </p>
          </div>

          <Field label="Nueva cuenta maestra *" htmlFor="new-master-id">
            <Select
              id="new-master-id"
              data-autofocus="true"
              value={newMasterId}
              disabled={transferSaving}
              onChange={(event) => {
                setNewMasterId(event.target.value);
                if (pendingTransferEdits?.userId !== event.target.value) setPendingTransferEdits(null);
                setTransferConfirmed(false);
                setTransferErr("");
              }}
              required
            >
              <option value="">Seleccione un prestamista activo</option>
              {transferCandidates.map((userProfile) => (
                <option key={userProfile.id} value={userProfile.id}>
                  {userProfile.nombre} {userProfile.apellido ?? ""} · {userProfile.email}
                </option>
              ))}
            </Select>
          </Field>

          {selectedNewMaster ? (
            <div className="rounded-xl border border-pf-border-soft bg-pf-surface-soft p-3 text-sm">
              <p className="font-bold text-pf-text">
                {selectedNewMaster.nombre} {selectedNewMaster.apellido ?? ""} será la nueva cuenta maestra.
              </p>
              <p className="mt-1 text-pf-text-secondary">
                Su cuenta quedará como Prestamista y perderá el acceso a la configuración y administración del equipo.
              </p>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-pf-border-soft p-3 text-sm text-pf-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-pf-primary"
              checked={transferConfirmed}
              disabled={!selectedNewMaster || transferSaving}
              onChange={(event) => {
                setTransferConfirmed(event.target.checked);
                setTransferErr("");
              }}
            />
            <span>Confirmo que entiendo que dejaré de ser la cuenta maestra de esta empresa.</span>
          </label>

          {transferErr ? <p className="text-sm font-medium text-pf-danger" role="alert">{transferErr}</p> : null}
          <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={closeTransfer} disabled={transferSaving}>Cancelar</Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!selectedNewMaster || !transferConfirmed || transferSaving || Boolean(transferBlockedMessage)}
            >
              {transferSaving ? "Transfiriendo…" : "Confirmar transferencia"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
