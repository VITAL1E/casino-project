// One fetch wrapper shared by every feature that talks to the server
// (auth, wallet, slither, sports): same base URL, same cookie-session
// convention, same error shape. Each feature module still owns its own
// endpoint functions — this just stops every one of them from
// re-implementing "fetch with credentials, throw on !res.ok".
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787'

export class ApiError extends Error {}

export const apiCall = async <T>(path: string, body?: unknown): Promise<T> => {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Run `npm run server` and try again.')
  }
  let json: unknown
  try { json = await res.json() } catch { json = null }
  if (!res.ok) throw new ApiError((json as { error?: string })?.error ?? `Server error (${res.status})`)
  return json as T
}
