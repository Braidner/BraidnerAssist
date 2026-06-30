import { config } from "../config.js";

interface WeatherCurrent {
  temp: number;
  code: number;
  wind: number;
}

export interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
}

export interface WeatherResult {
  configured: true;
  current: WeatherCurrent;
  forecast: WeatherDay[];
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    weathercode: number;
    windspeed_10m: number;
  };
  daily: {
    time: string[];
    weathercode: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

let cache: { data: WeatherResult; at: number } | null = null;

export function invalidateWeatherCache(): void {
  cache = null;
}

export async function getWeather(): Promise<WeatherResult | { configured: false }> {
  if (!config.weather.configured) return { configured: false };

  if (cache && Date.now() - cache.at < config.poll.weather) return cache.data;

  const { lat, lon } = config.weather;
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weathercode,windspeed_10m` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
    `&forecast_days=4&timezone=auto`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);

  const json = (await res.json()) as OpenMeteoResponse;

  const data: WeatherResult = {
    configured: true,
    current: {
      temp: Math.round(json.current.temperature_2m),
      code: json.current.weathercode,
      wind: Math.round(json.current.windspeed_10m),
    },
    // slice(1,4) = 3 days ahead (skip today, already in current)
    forecast: json.daily.time.slice(1, 4).map((date, i) => ({
      date,
      code: json.daily.weathercode[i + 1],
      max: Math.round(json.daily.temperature_2m_max[i + 1]),
      min: Math.round(json.daily.temperature_2m_min[i + 1]),
    })),
  };

  cache = { data, at: Date.now() };
  return data;
}
