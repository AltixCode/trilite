/**
 * Turning an accelerometer reading into a usable spirit level.
 *
 * Pure and dependency-free: the sensor sample is passed in, so every angle here is testable
 * against a known vector rather than by tilting a phone and hoping.
 *
 * Expo reports acceleration in g, with the device axes: x to the right, y to the top, z out
 * of the screen. At rest the only force is gravity, so the vector's direction *is* the
 * device's orientation — which is why this needs no gyroscope and no integration, and cannot
 * drift.
 */

export interface Sample {
  x: number;
  y: number;
  z: number;
}

export interface Angles {
  /** Tilt around the device's left–right axis. Positive is top edge lifted. */
  pitch: number;
  /** Tilt around the top–bottom axis. Positive is right edge lifted. */
  roll: number;
}

/** Stored calibration: what "flat" reads as on a particular surface. */
export interface Calibration {
  pitch: number;
  roll: number;
}

export const NO_CALIBRATION: Calibration = { pitch: 0, roll: 0 };

/** Within this many degrees of zero counts as level. */
export const LEVEL_TOLERANCE = 0.5;

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Pitch and roll, in degrees, from one accelerometer sample.
 *
 * `atan2` against the magnitude of the other two axes rather than against z alone: using z by
 * itself is correct only while the phone is roughly face-up and goes wrong — silently, and
 * worst near vertical — as soon as it is not.
 *
 * A zero-magnitude sample (free fall, or a sensor that has not reported yet) has no
 * orientation to report, so it returns flat rather than NaN.
 */
export function anglesFrom(sample: Sample): Angles {
  const { x, y, z } = sample;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
    return { pitch: 0, roll: 0 };
  if (Math.hypot(x, y, z) < 1e-6) return { pitch: 0, roll: 0 };

  return {
    pitch: toDegrees(Math.atan2(y, Math.hypot(x, z))),
    roll: toDegrees(Math.atan2(x, Math.hypot(y, z))),
  };
}

/** Angles with a surface's calibration subtracted. */
export function applyCalibration(
  angles: Angles,
  calibration: Calibration,
): Angles {
  return {
    pitch: angles.pitch - calibration.pitch,
    roll: angles.roll - calibration.roll,
  };
}

/**
 * A calibration that makes the current reading read as flat.
 *
 * This is what "level for this surface" means: a worktop that is genuinely out by a degree
 * can still be used as the reference for something sitting on it.
 */
export function calibrationFrom(angles: Angles): Calibration {
  return { pitch: angles.pitch, roll: angles.roll };
}

export function isLevel(angles: Angles, tolerance = LEVEL_TOLERANCE): boolean {
  return (
    Math.abs(angles.pitch) <= tolerance && Math.abs(angles.roll) <= tolerance
  );
}

/**
 * Smooths a noisy sensor.
 *
 * A raw accelerometer jitters by a few tenths of a degree at rest, which makes the readout
 * flicker and the "level" indicator blink. An exponential average at this weight settles
 * within a moment and still tracks a real movement immediately.
 */
export function smooth(
  previous: Angles | null,
  next: Angles,
  weight = 0.2,
): Angles {
  if (!previous) return next;
  return {
    pitch: previous.pitch + (next.pitch - previous.pitch) * weight,
    roll: previous.roll + (next.roll - previous.roll) * weight,
  };
}

/** One decimal place, and never "-0.0". */
export function formatAngle(degrees: number): string {
  const rounded = Math.round(degrees * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}
