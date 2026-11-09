import { useState, type FormEvent } from "react";
import { invoke } from "../../core/tauri";
import "./card.css";

interface ConnectField {
  id: string;
  label: string;
  placeholder?: string;
  secret: boolean;
}

export interface ConnectCardProps {
  fields: ConnectField[];
  guide: string;
  /** Checks the account with one real read, and throws a ProviderError if it can't. Secrets aren't passed. */
  onConnect: (values: Record<string, string>) => Promise<void>;
}

export function ConnectCard({ fields, guide, onConnect }: ConnectCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = fields.every((f) => values[f.id]?.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const secrets = fields.filter((f) => f.secret);
    const plain: Record<string, string> = {};
    for (const f of fields) if (!f.secret) plain[f.id] = values[f.id].trim();
    try {
      await Promise.all(secrets.map((f) => invoke("secret_set", { id: f.id, value: values[f.id].trim() })));
      await onConnect(plain);
      setValues({});
    } catch (err) {
      await Promise.all(secrets.map((f) => invoke("secret_delete", { id: f.id }).catch(() => {})));
      setError((err as { message?: string }).message ?? "That didn't work. Check what you entered and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="connect" onSubmit={submit}>
      <p className="connect__guide">{guide}</p>
      {fields.map((f) => (
        <label className="connect__field" key={f.id}>
          <span>{f.label}</span>
          <input
            type={f.secret ? "password" : "text"}
            placeholder={f.placeholder}
            autoComplete="off"
            spellCheck={false}
            value={values[f.id] ?? ""}
            onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
          />
        </label>
      ))}
      {error && <p className="connect__error">{error}</p>}
      <button type="submit" className="card__action connect__submit" disabled={!ready || busy}>
        {busy ? "Checking…" : "Connect"}
      </button>
    </form>
  );
}
