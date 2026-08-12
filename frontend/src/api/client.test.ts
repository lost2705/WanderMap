import { describe, expect, it } from 'vitest'
import { parseApiError } from './client'

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
})
