// Thin fetch wrapper for the admin API.
export type Issue = { path: string; message: string }

export class ApiError extends Error {
  status: number
  issues: Issue[]
  constructor(status: number, message: string, issues: Issue[] = []) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init
  const res = await fetch(`/admin/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text()
  if (!res.ok) {
    if (typeof body === 'string') throw new ApiError(res.status, body)
    throw new ApiError(
      res.status,
      body.error ?? res.statusText,
      Array.isArray(body.issues) ? body.issues : [],
    )
  }
  return body as T
}
