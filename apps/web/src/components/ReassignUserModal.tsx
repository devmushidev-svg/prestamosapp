import { useEffect, useState } from "react";
import { Button, Field, Modal, Select } from "./ui";
import type { Profile } from "../types";

export function ReassignUserModal({
  open,
  title,
  users,
  currentUserId,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  users: Profile[];
  currentUserId: string | null;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState(currentUserId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(currentUserId ?? "");
      setError("");
    }
  }, [open, currentUserId]);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm(selected);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo reasignar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Prestamista asignado" htmlFor="reassign-user">
          <Select id="reassign-user" value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="" disabled>Seleccione un usuario…</option>
            {users.map((userProfile) => (
              <option key={userProfile.id} value={userProfile.id}>
                {userProfile.nombre} {userProfile.apellido ?? ""}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <p className="text-sm font-medium text-pf-danger" role="alert">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-pf-border-soft pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={() => void confirm()} disabled={saving || !selected}>
            {saving ? "Guardando…" : "Reasignar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
