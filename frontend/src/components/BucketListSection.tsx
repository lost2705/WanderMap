import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import type { BucketListItem, CitySearchResult } from '../types/travel'
import { CitySearch } from './CitySearch'
import type { SearchCitiesFunction } from './CitySearch'

interface BucketListSectionProps {
  items: BucketListItem[]
  isMutating: boolean
  loadError?: string | null
  citySearch?: SearchCitiesFunction
  onAdd: (city: CitySearchResult) => Promise<BucketListItem>
  onSelectPlace: (cityId: string) => void
}

export function BucketListSection({
  items,
  isMutating,
  loadError = null,
  citySearch,
  onAdd,
  onSelectPlace,
}: BucketListSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState<CitySearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusItemId, setFocusItemId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const regionId = 'bucket-list-content'

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus()
    }
  }, [isAdding])

  useEffect(() => {
    if (!focusItemId) {
      return
    }
    const item = itemRefs.current.get(focusItemId)
    if (item) {
      item.focus()
      setFocusItemId(null)
    }
  }, [focusItemId, items])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCity || isMutating) {
      return
    }
    setError(null)
    try {
      const created = await onAdd(selectedCity)
      setQuery('')
      setSelectedCity(null)
      setIsAdding(false)
      setFocusItemId(created.id)
    } catch (reason) {
      setError(bucketListErrorMessage(reason))
    }
  }

  function cancelAdd() {
    setQuery('')
    setSelectedCity(null)
    setError(null)
    setIsAdding(false)
    window.setTimeout(() => addButtonRef.current?.focus(), 0)
  }

  return (
    <section className="bucket-list-section" aria-labelledby="bucket-list-heading">
      <div className="bucket-list-heading">
        <button
          aria-controls={regionId}
          aria-expanded={isExpanded}
          className="bucket-list-toggle"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span>
            <span className="eyebrow">Future places</span>
            <span aria-level={3} id="bucket-list-heading" role="heading">Want to visit</span>
          </span>
          <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
        </button>
        <button
          aria-label="Add a place to Want to visit"
          className="button button-quiet button-compact bucket-list-add"
          disabled={isMutating}
          ref={addButtonRef}
          type="button"
          onClick={() => {
            setIsExpanded(true)
            setIsAdding(true)
            setError(null)
          }}
        >
          ＋ Add place
        </button>
      </div>
      {isExpanded ? (
        <div id={regionId}>
          {loadError ? (
            <p className="bucket-list-load-error" role="status">{loadError}</p>
          ) : null}
          {items.length === 0 && !isAdding && !loadError ? (
            <p className="bucket-list-empty">Save places that are still calling you.</p>
          ) : null}
          {items.length > 0 ? (
            <ul className="bucket-list-items">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    className="bucket-list-place"
                    ref={(element) => {
                      if (element) {
                        itemRefs.current.set(item.id, element)
                      } else {
                        itemRefs.current.delete(item.id)
                      }
                    }}
                    type="button"
                    onClick={() => onSelectPlace(item.city.id)}
                  >
                    <span>
                      <strong>{item.city.name}</strong>
                      <small>{item.city.country.name}</small>
                    </span>
                    <span className="bucket-list-status">
                      {item.visited ? 'Visited too' : 'Want to visit'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {isAdding ? (
            <form className="bucket-list-form" onSubmit={(event) => void handleSubmit(event)}>
              <CitySearch
                disabled={isMutating}
                inputRef={inputRef}
                label="Where would you like to go?"
                placeholder="Search for a city..."
                query={query}
                search={citySearch}
                selectedResult={selectedCity}
                onQueryChange={(nextQuery) => {
                  setQuery(nextQuery)
                  setSelectedCity(null)
                  setError(null)
                }}
                onSelect={(result) => {
                  setQuery(result.name)
                  setSelectedCity(result)
                  setError(null)
                }}
              />
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <div className="bucket-list-form-actions">
                <button className="button button-secondary button-compact" disabled={isMutating || !selectedCity} type="submit">
                  {isMutating ? 'Saving…' : 'Save place'}
                </button>
                <button className="button button-quiet button-compact" disabled={isMutating} type="button" onClick={cancelAdd}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function bucketListErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.code === 'BUCKET_LIST_DUPLICATE') {
    return 'This place is already in Want to visit.'
  }
  if (reason instanceof Error && reason.message) {
    return reason.message
  }
  return 'Couldn’t save this place. Please try again.'
}
