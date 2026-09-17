export const WEATHER_CONDITIONS = Object.freeze({
  CLEAR: 'CLEAR', PARTLY_CLOUDY: 'PARTLY_CLOUDY', CLOUDY: 'CLOUDY', RAIN: 'RAIN',
  HEAVY_RAIN: 'HEAVY_RAIN', FOG: 'FOG', SNOW: 'SNOW', HEAVY_SNOW: 'HEAVY_SNOW',
  THUNDERSTORM: 'THUNDERSTORM', STRONG_WIND: 'STRONG_WIND',
});

export const WEATHER_PROFILE = Object.freeze([
  { time: '00:00', condition: 'CLEAR', probability: 0.70, temperatureRange: [-2, 12], visibilityRange: [8, 15], windRange: [1, 8], precipitationRange: [0, 0] },
  { time: '06:00', condition: 'PARTLY_CLOUDY', probability: 0.65, temperatureRange: [0, 16], visibilityRange: [7, 14], windRange: [2, 10], precipitationRange: [0, 0.2] },
  { time: '08:00', condition: 'CLOUDY', probability: 0.55, temperatureRange: [2, 18], visibilityRange: [5, 12], windRange: [2, 12], precipitationRange: [0, 0.4] },
  { time: '10:00', condition: 'RAIN', probability: 0.35, temperatureRange: [3, 19], visibilityRange: [3, 10], windRange: [3, 14], precipitationRange: [1, 8] },
  { time: '12:00', condition: 'HEAVY_RAIN', probability: 0.18, temperatureRange: [4, 20], visibilityRange: [1, 6], windRange: [5, 20], precipitationRange: [8, 30] },
  { time: '14:00', condition: 'RAIN', probability: 0.35, temperatureRange: [4, 20], visibilityRange: [3, 10], windRange: [3, 15], precipitationRange: [1, 8] },
  { time: '18:00', condition: 'CLOUDY', probability: 0.55, temperatureRange: [2, 17], visibilityRange: [5, 12], windRange: [2, 13], precipitationRange: [0, 0.4] },
  { time: '22:00', condition: 'CLEAR', probability: 0.72, temperatureRange: [-1, 14], visibilityRange: [8, 15], windRange: [1, 9], precipitationRange: [0, 0] },
]);

export const WEATHER_IMPACTS = Object.freeze({
  CLEAR: { runwayCapacityMultiplier: 1, groundDurationMultiplier: 1, flightDelayMultiplier: 0, visibilityImpact: 0, windImpact: 0 },
  PARTLY_CLOUDY: { runwayCapacityMultiplier: 1, groundDurationMultiplier: 1, flightDelayMultiplier: 0, visibilityImpact: 0.02, windImpact: 0 },
  CLOUDY: { runwayCapacityMultiplier: 0.98, groundDurationMultiplier: 1, flightDelayMultiplier: 0.02, visibilityImpact: 0.05, windImpact: 0.02 },
  RAIN: { runwayCapacityMultiplier: 0.9, groundDurationMultiplier: 1.1, flightDelayMultiplier: 0.05, visibilityImpact: 0.2, windImpact: 0.05 },
  HEAVY_RAIN: { runwayCapacityMultiplier: 0.7, groundDurationMultiplier: 1.25, flightDelayMultiplier: 0.15, visibilityImpact: 0.45, windImpact: 0.12 },
  FOG: { runwayCapacityMultiplier: 0.8, groundDurationMultiplier: 1.05, flightDelayMultiplier: 0.12, visibilityImpact: 0.6, windImpact: 0 },
  SNOW: { runwayCapacityMultiplier: 0.75, groundDurationMultiplier: 1.35, flightDelayMultiplier: 0.12, visibilityImpact: 0.4, windImpact: 0.08 },
  HEAVY_SNOW: { runwayCapacityMultiplier: 0.55, groundDurationMultiplier: 1.6, flightDelayMultiplier: 0.25, visibilityImpact: 0.7, windImpact: 0.15 },
  THUNDERSTORM: { runwayCapacityMultiplier: 0.5, groundDurationMultiplier: 1.5, flightDelayMultiplier: 0.3, visibilityImpact: 0.65, windImpact: 0.35 },
  STRONG_WIND: { runwayCapacityMultiplier: 0.6, groundDurationMultiplier: 1.2, flightDelayMultiplier: 0.2, visibilityImpact: 0.05, windImpact: 0.65 },
});

export const WEATHER_DATA_POLICY = Object.freeze({ sourceType: 'ESTIMATED', impactType: 'GAME', derivedType: 'DERIVED' });
