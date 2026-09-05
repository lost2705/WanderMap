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

interface CsrfDetails {
  headerName: string
  token: string
}

let csrfRequest: Promise<CsrfDetails> | null = null
let clientSessionGeneration = 0
let unauthorizedHandler: ((requestGeneration: number) => void) | null = null

export function setUnauthorizedHandler(handler: ((requestGeneration: number) => void) | null): void {
  unauthorizedHandler = handler
}

export function resetClientSession(): void {
  csrfRequest = null
  clientSessionGeneration += 1
}

export function getClientSessionGeneration(): number {
  return clientSessionGeneration
}

export function parseApiError(status: number, payload: unknown): ApiError {
  const problem = isProblem(payload) ? payload : {}
  return new ApiError(status, problem.code, problem.detail ?? problem.title ?? `Request failed (${status}).`)
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const requestGeneration = clientSessionGeneration
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const csrf = isUnsafeMethod(init?.method) ? await csrfDetails() : null
  if (requestGeneration !== clientSessionGeneration) {
    throw new ApiError(409, 'SESSION_CHANGED', 'The session changed before the request was sent.')
  }
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { [csrf.headerName]: csrf.token } : {}),
      ...init?.headers,
    },
  })
  const body = await response.text()
  const payload = body ? parseJson(body) : undefined

  if (!response.ok) {
    if (response.status === 401
      && path !== '/api/auth/login'
      && path !== '/api/auth/logout'
      && requestGeneration === clientSessionGeneration) {
      csrfRequest = null
      unauthorizedHandler?.(requestGeneration)
    }
    throw parseApiError(response.status, payload)
  }

  return payload as T
}

async function csrfDetails(): Promise<CsrfDetails> {
  csrfRequest ??= fetch('/api/auth/csrf', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    const body = await response.text()
    const payload = body ? parseJson(body) : undefined
    if (!response.ok || !isCsrfDetails(payload)) {
      csrfRequest = null
      throw parseApiError(response.status, payload)
    }
    const cookieToken = readCookie('XSRF-TOKEN')
    return cookieToken ? { ...payload, token: cookieToken } : payload
  })
  return csrfRequest
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null
  }
  const prefix = `${encodeURIComponent(name)}=`
  const cookie = document.cookie.split('; ').find((entry) => entry.startsWith(prefix))
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null
}

function isUnsafeMethod(method: string | undefined): boolean {
  return !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes((method ?? 'GET').toUpperCase())
}

function isCsrfDetails(value: unknown): value is CsrfDetails {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<CsrfDetails>
  return typeof candidate.headerName === 'string' && typeof candidate.token === 'string'
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
