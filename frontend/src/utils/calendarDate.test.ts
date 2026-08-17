import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatCalendarDateRange, formatStopDateRange } from './calendarDate'

describe('calendar date formatting', () => {
  it('formats an ISO calendar date without parsing it in the local timezone', () => {
    expect(formatCalendarDate('2026-04-01')).toBe('Apr 1, 2026')
    expect(formatCalendarDate('2026-12-31')).toBe('Dec 31, 2026')
  })

  it('formats complete and partial trip ranges', () => {
    expect(formatCalendarDateRange('2026-04-01', '2026-04-12')).toBe('Apr 1, 2026 – Apr 12, 2026')
    expect(formatCalendarDateRange('2026-04-01', null)).toBe('From Apr 1, 2026')
    expect(formatCalendarDateRange(null, '2026-04-12')).toBe('Until Apr 12, 2026')
    expect(formatCalendarDateRange(null, null)).toBeNull()
  })

  it('labels partial stop ranges clearly', () => {
    expect(formatStopDateRange('2026-04-02', null)).toBe('Arrive Apr 2, 2026')
    expect(formatStopDateRange(null, '2026-04-05')).toBe('Depart Apr 5, 2026')
    expect(formatStopDateRange('2026-04-02', '2026-04-05')).toBe('Apr 2, 2026 – Apr 5, 2026')
  })
})
