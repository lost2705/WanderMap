export interface ApiProblem {
  title?: string
  detail?: string
  code?: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    message = 'The request could not be completed.',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function parseApiError(status: number, payload: unknown): ApiError {
  const problem = isProblem(payload) ? payload : {}
  return new ApiError(status, problem.code, problem.detail ?? problem.title ?? `Request failed (${status}).`)
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body = await response.text()
  const payload = body ? parseJson(body) : undefined

  if (!response.ok) {
    throw parseApiError(response.status, payload)
  }

  return payload as T
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function isProblem(value: unknown): value is ApiProblem {
  return typeof value === 'object' && value !== null
}
