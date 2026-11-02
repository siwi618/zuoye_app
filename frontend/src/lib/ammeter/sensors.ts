// DISPRO current sensors the page knows, by the id in their EEPROM (byte 0).
// Accuracy is from the spec sheet (±0.5% of full scale).
export type SensorSpec = { rangeA: number; accuracyA: number }

export const SENSORS: Record<number, SensorSpec> = {
  3: { rangeA: 3, accuracyA: 0.015 },
}

/** Used before a device is connected, and as the accuracy estimate for unknown sensors. */
export const DEFAULT_SENSOR_ID = 3
export const ACCURACY_FRACTION = 0.005
