package io.github.lost2705.wandermap.travel.application;

enum AchievementMetric {
    JOURNEYS {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.journeyCount();
        }
    },
    COUNTRIES {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.countryCount();
        }
    },
    PLACES {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.uniqueCityCount();
        }
    },
    MEMORIES {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.memoryCount();
        }
    },
    TRAVEL_DAYS {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.travelDayCount();
        }
    },
    REVISITED_CITIES {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.revisitedCityCount();
        }
    },
    REVISITED_COUNTRIES {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.revisitedCountryCount();
        }
    },
    PHOTOS {
        @Override
        long value(TravelProfileMetrics metrics) {
            return metrics.photoCount();
        }
    };

    abstract long value(TravelProfileMetrics metrics);
}
