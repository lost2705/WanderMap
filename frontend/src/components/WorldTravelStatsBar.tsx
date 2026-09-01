import type { TravelProfile } from '../types/travel'

interface WorldTravelStatsBarProps {
  profile: TravelProfile | null
}

export function WorldTravelStatsBar({ profile }: WorldTravelStatsBarProps) {
  if (!profile || (profile.journeyCount === 0 && profile.visitCount === 0)) {
    return null
  }

  return (
    <section className="world-travel-stats" aria-labelledby="world-travel-stats-heading">
      <h2 className="visually-hidden" id="world-travel-stats-heading">Travel statistics</h2>
      <dl aria-label="World travel statistics">
        <TravelMetric label="Countries" value={profile.countryCount} />
        <TravelMetric label="Places" value={profile.uniqueCityCount} />
        <TravelMetric className="is-secondary" label="Journeys" value={profile.journeyCount} />
        <TravelMetric label="Travel days" value={profile.travelDayCount} />
        <TravelMetric className="is-secondary" label="Memories" value={profile.memoryCount} />
      </dl>
    </section>
  )
}

function TravelMetric({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: number
}) {
  return (
    <div className={`world-travel-stat${className ? ` ${className}` : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
