import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getClientSessionGeneration,
  parseApiError,
  request,
  resetClientSession,
  setUnauthorizedHandler,
} from './client'

afterEach(() => {
  resetClientSession()
  setUnauthorizedHandler(null)
  vi.unstubAllGlobals()
})

describe('parseApiError', () => {
  it('uses the API problem detail and code when available', () => {
    const error = parseApiError(400, {
      title: 'Validation failed',
      detail: 'A trip name is required.',
      code: 'VALIDATION_FAILED',
    })

    expect(error.status).toBe(400)
    expect(error.code).toBe('VALIDATION_FAILED')
    expect(error.message).toBe('A trip name is required.')
  })

  it('falls back to a useful status message for an invalid response', () => {
    expect(parseApiError(503, '<html>unavailable</html>').message).toBe('Request failed (503).')
  })

  it('leaves the multipart content type boundary to the browser', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        '{"headerName":"X-XSRF-TOKEN","token":"csrf-token"}',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const body = new FormData()
    body.append('file', new Blob(['photo'], { type: 'image/jpeg' }), 'photo.jpg')

    await request('/api/photos', { method: 'POST', body })

    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>
    expect(headers.Accept).toBe('application/json')
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers['X-XSRF-TOKEN']).toBe('csrf-token')
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe('same-origin')
  })

  it('notifies the auth boundary only for a protected 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"code":"AUTH_REQUIRED"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"code":"INVALID_CREDENTIALS"}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/api/trips')).rejects.toMatchObject({ status: 401 })
    await expect(request('/api/auth/login')).rejects.toMatchObject({ status: 401 })

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('ignores a protected 401 from an older client session generation', async () => {
    let resolveOldRequest: ((response: Response) => void) | undefined
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOldRequest = resolve
    })
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(new Response('{"code":"AUTH_REQUIRED"}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const oldRequest = request('/api/trips')
    resetClientSession()
    resolveOldRequest?.(new Response('{"code":"AUTH_REQUIRED"}', { status: 401 }))

    await expect(oldRequest).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).not.toHaveBeenCalled()

    const currentGeneration = getClientSessionGeneration()
    await expect(request('/api/trips')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledWith(currentGeneration)
  })
})
