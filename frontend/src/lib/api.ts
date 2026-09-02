/**
 * Typed API client that automatically attaches the app's own session access
 * token to every request to the C# backend. Replaces the Supabase session
 * token this used to read from `@supabase/supabase-js`.
 *
 * Empty-string default: in Docker the frontend Dockerfile deliberately bakes
 * no NEXT_PUBLIC_API_URL, so requests go to a same-origin relative path and
 * Caddy's `/api/*` route (see Caddyfile) forwards them to the backend. Local
 * `npm run dev` (outside Docker) sets NEXT_PUBLIC_API_URL=http://localhost:5000
 * in frontend/.env.local instead, since there's no Caddy in front of it there.
 */
import { getAccessToken } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

function getAuthHeaders(): HeadersInit {
  const token = getAccessToken()
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
