import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseApiError, request } from './client'

afterEach(() => {
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const body = new FormData()
    body.append('file', new Blob(['photo'], { type: 'image/jpeg' }), 'photo.jpg')

    await request('/api/photos', { method: 'POST', body })

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.Accept).toBe('application/json')
    expect(headers['Content-Type']).toBeUndefined()
  })
})
