import type { RefObject } from 'react'
import type { CurrentUser } from '../api/auth'
import type { Achievement, TravelHighlights, TravelProfile } from '../types/travel'

interface TravelProfileViewProps {
  backButtonRef?: RefObject<HTMLButtonElement | null>
  error: string | null
  isLoading: boolean
  profile: TravelProfile | null
  user: CurrentUser
  onBack: () => void
  onRetry: () => void
}

export function TravelProfileView({
  backButtonRef,
  error,
  isLoading,
  profile,
  user,
  onBack,
  onRetry,
}: TravelProfileViewProps) {
  return (
    <section className="travel-profile-view" aria-labelledby="travel-profile-title">
      <header className="travel-profile-toolbar">
        <span className="profile-brand" aria-label="WanderMap">
          <span aria-hidden="true" className="brand-mark">W</span>
          <strong>WanderMap</strong>
        </span>
        <button className="button button-quiet profile-back" ref={backButtonRef} type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          Back to map
        </button>
      </header>

      <div className="travel-profile-scroll">
        <article className="travel-profile-page">
          <header className="travel-profile-header">
            <div>
              <p className="eyebrow">Your personal atlas</p>
              <h1 id="travel-profile-title">Travel Profile</h1>
              <p className="profile-heading">The places and stories that have shaped your map.</p>
            </div>
            <div className="profile-identity">
              <strong>{user.displayName}</strong>
              <span>{user.email}</span>
            </div>
          </header>

          {isLoading && !profile ? (
            <div className="profile-message" role="status">Opening your travel story…</div>
          ) : null}

          {error && !profile ? (
            <div className="profile-message is-error" role="alert">
              <p>{error}</p>
              <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
            </div>
          ) : null}

          {profile ? <ProfileContent profile={profile} /> : null}
        </article>
      </div>
    </section>
  )
}

function ProfileContent({ profile }: { profile: TravelProfile }) {
  return (
    <>
      <section className="profile-hero-section" aria-labelledby="profile-overview-heading">
        <h2 className="visually-hidden" id="profile-overview-heading">Travel overview</h2>
        <dl className="profile-hero-metrics">
          <ProfileMetric label="Countries" value={profile.countryCount} />
          <ProfileMetric label="Places" value={profile.uniqueCityCount} />
          <ProfileMetric label="Travel days" value={profile.travelDayCount} />
          <ProfileMetric label="Journeys" value={profile.journeyCount} />
        </dl>
      </section>

      <section className="profile-section" aria-labelledby="travel-highlights-heading">
        <div className="profile-section-heading">
          <p className="eyebrow">From your atlas</p>
          <h2 id="travel-highlights-heading">Travel highlights</h2>
        </div>
        <Highlights highlights={profile.highlights} />
      </section>

      <section className="profile-section" aria-labelledby="achievements-heading">
        <div className="profile-section-heading">
          <p className="eyebrow">Milestones</p>
          <h2 id="achievements-heading">Achievements</h2>
        </div>
        <ul className="achievement-list">
          {profile.achievements.map((achievement) => (
            <AchievementCard achievement={achievement} key={achievement.code} />
          ))}
        </ul>
      </section>

      <section className="profile-section profile-secondary-section" aria-labelledby="profile-details-heading">
        <div className="profile-section-heading">
          <p className="eyebrow">The details</p>
          <h2 id="profile-details-heading">Your journal in numbers</h2>
        </div>
        <dl className="profile-secondary-metrics">
          <ProfileMetric label="Visits" value={profile.visitCount} />
          <ProfileMetric label="Memories" value={profile.memoryCount} />
          <ProfileMetric label="Photos" value={profile.photoCount} />
          <ProfileMetric label="Revisited cities" value={profile.revisitedCityCount} />
          <ProfileMetric label="Revisited countries" value={profile.revisitedCountryCount} />
        </dl>
      </section>
    </>
  )
}

function Highlights({ highlights }: { highlights: TravelHighlights }) {
  const items = [
    highlights.mostVisitedCity ? {
      label: 'Most visited city',
      title: `${highlights.mostVisitedCity.cityName}, ${highlights.mostVisitedCity.countryName}`,
      detail: pluralize(highlights.mostVisitedCity.visitCount, 'visit'),
    } : null,
    highlights.mostVisitedCountry ? {
      label: 'Most visited country',
      title: highlights.mostVisitedCountry.countryName,
      detail: pluralize(highlights.mostVisitedCountry.visitCount, 'visit'),
    } : null,
    highlights.longestJourney ? {
      label: 'Longest Journey',
      title: highlights.longestJourney.journeyName,
      detail: pluralize(highlights.longestJourney.dayCount, 'day'),
    } : null,
    highlights.mostRecentJourney ? {
      label: 'Most recent Journey',
      title: highlights.mostRecentJourney.journeyName,
      detail: formatDate(highlights.mostRecentJourney.startDate),
    } : null,
    highlights.mostMemoryRichJourney ? {
      label: 'Most memory-rich Journey',
      title: highlights.mostMemoryRichJourney.journeyName,
      detail: pluralize(highlights.mostMemoryRichJourney.memoryCount, 'memory', 'memories'),
    } : null,
  ].filter((item): item is { label: string; title: string; detail: string } => item !== null)

  if (items.length === 0) {
    return <p className="profile-empty">Your travel highlights will appear after your first Journey.</p>
  }

  return (
    <dl className="profile-highlights">
      {items.map((item) => (
        <div className="profile-highlight" key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const status = achievement.unlocked ? 'Unlocked' : 'In progress'
  return (
    <li className={`achievement-card${achievement.unlocked ? ' is-unlocked' : ''}`}>
      <div className="achievement-card-heading">
        <span className="achievement-mark" aria-hidden="true">{achievement.unlocked ? '✓' : '○'}</span>
        <div>
          <p>{achievement.category}</p>
          <h3>{achievement.title}</h3>
        </div>
        <strong className="achievement-status">{status}</strong>
      </div>
      <p className="achievement-description">{achievement.description}</p>
      <div
        aria-label={`${achievement.title} progress`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={achievement.progressPercent}
        className="achievement-progress"
        role="progressbar"
      >
        <span style={{ width: `${achievement.progressPercent}%` }} />
      </div>
      <p className="achievement-count">
        <span>{achievement.currentValue} / {achievement.targetValue}</span>
        <span>{achievement.progressPercent}%</span>
      </p>
    </li>
  )
}

function ProfileMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
