import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ApiError } from '../api/client'
import { searchCities } from '../api/cities'
import type { CitySearchResult } from '../types/travel'

const SEARCH_DEBOUNCE_MILLIS = 300
const MINIMUM_QUERY_LENGTH = 2

type SearchStatus = 'idle' | 'typing' | 'loading' | 'results' | 'no-results' | 'error'

export type SearchCitiesFunction = (query: string, signal?: AbortSignal) => Promise<CitySearchResult[]>

interface CitySearchProps {
  query: string
  selectedResult: CitySearchResult | null
  disabled?: boolean
  search?: SearchCitiesFunction
  onQueryChange: (query: string) => void
  onSelect: (result: CitySearchResult) => void
}

export function CitySearch({
  query,
  selectedResult,
  disabled = false,
  search = searchCities,
  onQueryChange,
  onSelect,
}: CitySearchProps) {
  const listId = useId()
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [results, setResults] = useState<CitySearchResult[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    const normalizedQuery = query.trim()
    if (selectedResult) {
      setStatus('idle')
      setResults([])
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }
    if (normalizedQuery.length < MINIMUM_QUERY_LENGTH) {
      setStatus(normalizedQuery.length === 0 ? 'idle' : 'typing')
      setResults([])
      setErrorMessage('')
      setIsOpen(normalizedQuery.length > 0)
      setActiveIndex(-1)
      return
    }

    const controller = new AbortController()
    let disposed = false
    setStatus('typing')
    setResults([])
    setErrorMessage('')
    setIsOpen(true)
    setActiveIndex(-1)

    const timeoutId = window.setTimeout(() => {
      setStatus('loading')
      void search(normalizedQuery, controller.signal)
        .then((nextResults) => {
          if (disposed) {
            return
          }
          setResults(nextResults)
          setStatus(nextResults.length > 0 ? 'results' : 'no-results')
          setActiveIndex(-1)
        })
        .catch((reason: unknown) => {
          if (disposed || isAbortError(reason)) {
            return
          }
          setResults([])
          setStatus('error')
          setErrorMessage(toSearchErrorMessage(reason))
          setActiveIndex(-1)
        })
    }, SEARCH_DEBOUNCE_MILLIS)

    return () => {
      disposed = true
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query, retryVersion, search, selectedResult])

  function selectResult(result: CitySearchResult) {
    onSelect(result)
    setIsOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!isOpen || status !== 'results') {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      const result = results[activeIndex]
      if (result) {
        selectResult(result)
      }
    }
  }

  return (
    <div className="city-search">
      <label htmlFor={`${listId}-input`}>Where did you go?</label>
      <div className="city-search-control">
        <input
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
          autoComplete="off"
          disabled={disabled}
          id={`${listId}-input`}
          maxLength={160}
          placeholder="Start typing a city..."
          role="combobox"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => {
            if (!selectedResult && query.trim().length > 0) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
        />
        {isOpen ? (
          <div
            className="city-search-dropdown"
            id={listId}
            role={status === 'results' ? 'listbox' : undefined}
          >
            {status === 'typing' ? (
              <p>{query.trim().length < MINIMUM_QUERY_LENGTH
                ? 'Type at least 2 characters to search.'
                : 'Pause typing to search…'}</p>
            ) : null}
            {status === 'loading' ? <p role="status">Searching cities…</p> : null}
            {status === 'no-results' ? <p role="status">No matching cities found.</p> : null}
            {status === 'error' ? (
              <div className="city-search-feedback">
                <p className="city-search-error" role="alert">{errorMessage}</p>
                <button type="button" onClick={() => setRetryVersion((current) => current + 1)}>
                  Try again
                </button>
              </div>
            ) : null}
            {status === 'results' ? (
              <ul>
                {results.map((result, index) => (
                  <li key={resultKey(result)}>
                    <button
                      aria-selected={activeIndex === index}
                      className={activeIndex === index ? 'is-active' : undefined}
                      id={`${listId}-option-${index}`}
                      role="option"
                      type="button"
                      onClick={() => selectResult(result)}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <strong>{result.name}</strong>
                      <span>{locationLabel(result)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {selectedResult ? (
        <div className="selected-city" role="status">
          <span>Selected city</span>
          <strong>{selectedResult.name}</strong>
          <small>{locationLabel(selectedResult)}</small>
        </div>
      ) : null}
      <p className="geocoding-attribution">
        Search by <a href="https://photon.komoot.io" rel="noreferrer" target="_blank">Photon</a>. Data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap contributors</a>.
      </p>
    </div>
  )
}

function resultKey(result: CitySearchResult): string {
  return `${result.countryCode}:${result.name}:${result.latitude}:${result.longitude}`
}

function locationLabel(result: CitySearchResult): string {
  return result.regionName ? `${result.regionName}, ${result.countryName}` : result.countryName
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

function toSearchErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.message) {
    return reason.message
  }
  return 'City search is unavailable. Please try again.'
}
