import {
  FREE_PATTERN,
  PATTERNS,
  canUsePattern,
  cycleMs,
  isLitAt,
  patternById,
} from '../patterns';

describe('the pattern list', () => {
  it('gives every pattern a unique id and a name key', () => {
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    for (const pattern of PATTERNS) expect(pattern.nameKey.length).toBeGreaterThan(0);
  });

  it('falls back to the first pattern for an id it does not know', () => {
    expect(patternById('invented')).toEqual(PATTERNS[0]);
  });

  it('gives every timed pattern positive durations', () => {
    for (const pattern of PATTERNS) {
      for (const step of pattern.steps) expect(step.ms).toBeGreaterThan(0);
    }
  });
});

describe('canUsePattern', () => {
  it('gives a free user the steady torch only', () => {
    expect(canUsePattern(FREE_PATTERN, false)).toBe(true);
    for (const pattern of PATTERNS.filter((p) => p.id !== FREE_PATTERN)) {
      expect(canUsePattern(pattern.id, false)).toBe(false);
    }
  });

  it('gives a paying user all of them', () => {
    for (const pattern of PATTERNS) expect(canUsePattern(pattern.id, true)).toBe(true);
  });

  it('refuses a pattern that does not exist', () => {
    expect(canUsePattern('invented', true)).toBe(false);
  });
});

describe('isLitAt', () => {
  it('keeps a steady torch on forever', () => {
    const steady = patternById('steady');
    expect(cycleMs(steady)).toBe(0);
    for (const t of [0, 1000, 1e9]) expect(isLitAt(steady, t)).toBe(true);
  });

  it('alternates a strobe', () => {
    const strobe = patternById('slowStrobe');
    expect(isLitAt(strobe, 0)).toBe(true);
    expect(isLitAt(strobe, 499)).toBe(true);
    expect(isLitAt(strobe, 500)).toBe(false);
    expect(isLitAt(strobe, 999)).toBe(false);
  });

  it('loops, so a long run stays in step', () => {
    const strobe = patternById('slowStrobe');
    expect(isLitAt(strobe, 1000)).toBe(isLitAt(strobe, 0));
    expect(isLitAt(strobe, 100_000 + 600)).toBe(isLitAt(strobe, 600));
  });

  it('handles a negative elapsed without going dark unpredictably', () => {
    expect(typeof isLitAt(patternById('slowStrobe'), -50)).toBe('boolean');
  });
});

describe('SOS is really SOS', () => {
  const sos = patternById('sos');

  it('is three short, three long, three short', () => {
    // Somebody may be reading this. The ratios are what make it recognisable rather than
    // just a light flashing.
    const lit = sos.steps.filter((s) => s.on).map((s) => s.ms);
    expect(lit).toHaveLength(9);

    const [a, b, c, d, e, f, g, h, i] = lit;
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(d).toBe(e);
    expect(e).toBe(f);
    expect(g).toBe(h);
    expect(h).toBe(i);
    // A dash is three dots long.
    expect(d! / a!).toBeCloseTo(3, 6);
    expect(g).toBe(a);
  });

  it('separates letters by more than it separates symbols', () => {
    const gaps = sos.steps.filter((s) => !s.on).map((s) => s.ms);
    expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps));
  });

  it('repeats', () => {
    expect(sos.loops).toBe(true);
    expect(isLitAt(sos, cycleMs(sos))).toBe(isLitAt(sos, 0));
  });

  it('starts lit', () => {
    expect(isLitAt(sos, 0)).toBe(true);
  });

  it('ends with a long gap before repeating, so two cycles are distinguishable', () => {
    const total = cycleMs(sos);
    expect(isLitAt(sos, total - 1)).toBe(false);
  });
});
