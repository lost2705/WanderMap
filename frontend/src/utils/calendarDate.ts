const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return value
  }

  const [, year, month, day] = match
  const monthName = MONTH_NAMES[Number(month) - 1]
  if (!monthName) {
    return value
  }

  return `${monthName} ${Number(day)}, ${year}`
}

export function formatCalendarDateRange(startDate: string | null, endDate: string | null): string | null {
  if (startDate && endDate) {
    if (startDate === endDate) {
      return formatCalendarDate(startDate)
    }
    return `${formatCalendarDate(startDate)} – ${formatCalendarDate(endDate)}`
  }
  if (startDate) {
    return `From ${formatCalendarDate(startDate)}`
  }
  if (endDate) {
    return `Until ${formatCalendarDate(endDate)}`
  }
  return null
}

export function formatStopDateRange(arrivalDate: string | null, departureDate: string | null): string | null {
  if (arrivalDate && departureDate) {
    if (arrivalDate === departureDate) {
      return formatCalendarDate(arrivalDate)
    }
    return `${formatCalendarDate(arrivalDate)} – ${formatCalendarDate(departureDate)}`
  }
  if (arrivalDate) {
    return `Arrive ${formatCalendarDate(arrivalDate)}`
  }
  if (departureDate) {
    return `Depart ${formatCalendarDate(departureDate)}`
  }
  return null
}
