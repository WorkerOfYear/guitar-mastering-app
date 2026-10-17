// The app's API on the owner's server (server/api). On the test stand it shares the site's address;
// the site on Vercel is built with VITE_API_URL pointing at the server.
import { tg } from "@/app/telegram";
import { useAuth } from "@/store/auth";

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

/** The password token on a website, Telegram's signed launch data inside the Mini App. */
export function authHeaders(): Record<string, string> {
  const token = useAuth.getState().token;
  if (token) return { Authorization: `Bearer ${token}` };
  return tg?.initData ? { "X-Telegram-Init-Data": tg.initData } : {};
}

export async function failure(r: Response) {
  const text = await r.text().catch(() => "");
  try {
    return (JSON.parse(text) as { error?: string }).error ?? `Ошибка сервера ${r.status}`;
  } catch {
    return `Ошибка сервера ${r.status}`;
  }
}

/** fetch() to the API with auth. A rejected token signs this device out (the login screen comes up). */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${API_URL}${path}`, { ...init, headers: { ...authHeaders(), ...(init.headers as Record<string, string>) } });
  } catch {
    throw Object.assign(new Error("Сервер не отвечает — проверь интернет"), { status: 0 });
  }
  if (r.status === 401 && useAuth.getState().token) useAuth.getState().logout();
  return r;
}

/** JSON request; a non-2xx answer throws with the server's message and `status`. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string>) } });
  if (!r.ok) throw Object.assign(new Error(await failure(r)), { status: r.status });
  return (await r.json()) as T;
}
