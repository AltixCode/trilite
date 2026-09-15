import {
  LEVEL_TOLERANCE,
  NO_CALIBRATION,
  anglesFrom,
  applyCalibration,
  calibrationFrom,
  formatAngle,
  isLevel,
  smooth,
} from '../level';

describe('anglesFrom', () => {
  it('reads a phone lying flat as level', () => {
    // Gravity straight down the z axis: nothing is tilted.
    const angles = anglesFrom({ x: 0, y: 0, z: -1 });
    expect(angles.pitch).toBeCloseTo(0, 6);
    expect(angles.roll).toBeCloseTo(0, 6);
  });

  it('reads a phone stood upright as ninety degrees of pitch', () => {
    expect(anglesFrom({ x: 0, y: 1, z: 0 }).pitch).toBeCloseTo(90, 6);
  });

  it('reads a phone on its side as ninety degrees of roll', () => {
    expect(anglesFrom({ x: 1, y: 0, z: 0 }).roll).toBeCloseTo(90, 6);
  });

  it('reads a forty-five degree tilt as forty-five degrees', () => {
    const r = Math.SQRT1_2;
    expect(anglesFrom({ x: 0, y: r, z: -r }).pitch).toBeCloseTo(45, 4);
  });

  it('stays correct past vertical, where dividing by z alone goes wrong', () => {
    // z is zero here. An implementation using atan2(y, z) divides by zero and jumps.
    const angles = anglesFrom({ x: 0, y: -1, z: 0 });
    expect(angles.pitch).toBeCloseTo(-90, 6);
    expect(Number.isFinite(angles.pitch)).toBe(true);
  });

  it('reports flat for a sample with no magnitude rather than NaN', () => {
    // Free fall, or a sensor that has not reported yet.
    expect(anglesFrom({ x: 0, y: 0, z: 0 })).toEqual({ pitch: 0, roll: 0 });
  });

  it('reports flat for a non-finite sample', () => {
    expect(anglesFrom({ x: Number.NaN, y: 0, z: -1 })).toEqual({ pitch: 0, roll: 0 });
  });
});

describe('calibration', () => {
  it('makes the current reading read as flat', () => {
    // A worktop out by a degree can still be the reference for what sits on it.
    const tilted = anglesFrom({ x: 0.02, y: 0.02, z: -1 });
    const calibration = calibrationFrom(tilted);
    const corrected = applyCalibration(tilted, calibration);
    expect(corrected.pitch).toBeCloseTo(0, 6);
    expect(corrected.roll).toBeCloseTo(0, 6);
  });

  it('leaves angles alone with no calibration', () => {
    const angles = anglesFrom({ x: 0.1, y: 0.2, z: -1 });
    expect(applyCalibration(angles, NO_CALIBRATION)).toEqual(angles);
  });

  it('still reports a real tilt after calibrating on a different surface', () => {
    const surface = calibrationFrom(anglesFrom({ x: 0, y: 0.02, z: -1 }));
    const tilted = applyCalibration(anglesFrom({ x: 0, y: 0.3, z: -1 }), surface);
    expect(tilted.pitch).toBeGreaterThan(1);
  });
});

describe('isLevel', () => {
  it('is true within the tolerance and false outside it', () => {
    expect(isLevel({ pitch: 0.2, roll: -0.3 })).toBe(true);
    expect(isLevel({ pitch: LEVEL_TOLERANCE + 0.1, roll: 0 })).toBe(false);
  });

  it('needs both axes', () => {
    expect(isLevel({ pitch: 0, roll: 5 })).toBe(false);
  });
});

describe('smooth', () => {
  it('takes the first reading whole', () => {
    const next = { pitch: 3, roll: 4 };
    expect(smooth(null, next)).toEqual(next);
  });

  it('moves towards the new reading without jumping to it', () => {
    const result = smooth({ pitch: 0, roll: 0 }, { pitch: 10, roll: 10 }, 0.2);
    expect(result.pitch).toBeCloseTo(2, 6);
  });

  it('converges on a steady reading', () => {
    let angles = { pitch: 0, roll: 0 };
    for (let i = 0; i < 60; i += 1) angles = smooth(angles, { pitch: 10, roll: -5 });
    expect(angles.pitch).toBeCloseTo(10, 2);
    expect(angles.roll).toBeCloseTo(-5, 2);
  });
});

describe('formatAngle', () => {
  it('shows one decimal place', () => {
    expect(formatAngle(1.24)).toBe('1.2');
    expect(formatAngle(-3.15)).toBe('-3.1');
  });

  it('never shows minus zero', () => {
    // "-0.0" on a spirit level reads as a fault, not a value.
    expect(formatAngle(-0.01)).toBe('0.0');
    expect(formatAngle(-0)).toBe('0.0');
  });
});
