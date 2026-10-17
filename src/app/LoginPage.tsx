import { useState, type FormEvent } from "react";
import { Guitar, LoaderCircle, LogIn } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { API_URL, failure } from "@/lib/api";
import { useAuth } from "@/store/auth";

/** The password, once per device: after that the device stays signed in for a year. */
export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_URL}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!r.ok) throw new Error(await failure(r));
      useAuth.getState().setToken(((await r.json()) as { token: string }).token);
    } catch (e) {
      setError(e instanceof TypeError ? "Сервер не отвечает — проверь интернет" : (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Guitar className="size-6" />
          </span>
          <div>
            <div className="text-lg font-bold">Гитара</div>
            <div className="text-sm text-muted">Вход нужен один раз на этом устройстве</div>
          </div>
        </div>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <Input autoFocus type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" />
          {error && <p className="px-1 text-sm text-guide">{error}</p>}
          <Button type="submit" size="lg" disabled={!password || busy} className="w-full">
            {busy ? <LoaderCircle className="animate-spin" /> : <LogIn />} Войти
          </Button>
        </form>
      </Card>
    </main>
  );
}
