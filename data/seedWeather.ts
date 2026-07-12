import { WeatherEvent } from "@/domain/types";

/**
 * Source: Architecture Section 6 — rain, wind, heat, forecast windows.
 * `weather_rain_today` drives the Tier 2 weather-alert demo scenario
 * (SoT Section 19 — "Rain alert enters system and creates Tier 2 weather
 * risk").
 */
export const seedWeather: WeatherEvent[] = [
  {
    id: "weather_rain_today",
    timestamp: "2026-07-08T09:00:00.000Z",
    condition: "rain",
    severity: "moderate",
    affectedTaskTypes: ["concrete_pour", "steel_erection", "site_exterior"],
    startTime: "2026-07-08T11:00:00.000Z",
    endTime: "2026-07-08T18:00:00.000Z",
  },
  {
    id: "weather_heat_forecast",
    timestamp: "2026-07-08T09:00:00.000Z",
    condition: "heat",
    severity: "low",
    affectedTaskTypes: ["site_exterior"],
    startTime: "2026-07-12T12:00:00.000Z",
    endTime: "2026-07-12T18:00:00.000Z",
  },
];
