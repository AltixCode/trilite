/**
 * Torch patterns: steady, strobe and SOS.
 *
 * A pattern is a list of on/off durations in milliseconds, and the screen simply walks it.
 * Expressing it as data rather than as a chain of `setTimeout` calls is what makes the timing
 * testable, and what stops a stop-request leaving a dangling timer that turns the torch back
 * on after the user has left the screen.
 *
 * Pure and dependency-free.
 */

export type PatternId =
  "steady" | "slowStrobe" | "fastStrobe" | "sos" | "beacon";

export interface Step {
  on: boolean;
  ms: number;
}

export interface Pattern {
  id: PatternId;
  nameKey: string;
  /** Empty means "just on" — a steady torch has no sequence to walk. */
  steps: Step[];
  /** Whether the sequence repeats once it reaches the end. */
  loops: boolean;
}

/**
 * International Morse timing, in units of one dot.
 *
 * S is three dots, O is three dashes. A dash is three dots long, the gap between symbols is
 * one dot, between letters three, and between words seven. Getting these ratios right is the
 * difference between a recognisable SOS and a light flashing arbitrarily — which is the whole
 * point of the feature, since somebody may be reading it.
 */
const DOT = 200;
const DASH = DOT * 3;
const SYMBOL_GAP = DOT;
const LETTER_GAP = DOT * 3;
const WORD_GAP = DOT * 7;

function morse(letters: number[][]): Step[] {
  const steps: Step[] = [];
  letters.forEach((letter, letterIndex) => {
    letter.forEach((length, symbolIndex) => {
      steps.push({ on: true, ms: length });
      if (symbolIndex < letter.length - 1)
        steps.push({ on: false, ms: SYMBOL_GAP });
    });
    steps.push({
      on: false,
      ms: letterIndex < letters.length - 1 ? LETTER_GAP : WORD_GAP,
    });
  });
  return steps;
}

const S = [DOT, DOT, DOT];
const O = [DASH, DASH, DASH];

export const PATTERNS: Pattern[] = [
  { id: "steady", nameKey: "patternSteady", steps: [], loops: false },
  {
    id: "slowStrobe",
    nameKey: "patternSlowStrobe",
    steps: [
      { on: true, ms: 500 },
      { on: false, ms: 500 },
    ],
    loops: true,
  },
  {
    id: "fastStrobe",
    nameKey: "patternFastStrobe",
    steps: [
      { on: true, ms: 80 },
      { on: false, ms: 80 },
    ],
    loops: true,
  },
  { id: "sos", nameKey: "patternSos", steps: morse([S, O, S]), loops: true },
  {
    id: "beacon",
    nameKey: "patternBeacon",
    steps: [
      { on: true, ms: 120 },
      { on: false, ms: 120 },
      { on: true, ms: 120 },
      { on: false, ms: 2000 },
    ],
    loops: true,
  },
];

/** The one pattern a free user gets. The purchase opens the rest. */
export const FREE_PATTERN: PatternId = "steady";

export const patternById = (id: string): Pattern =>
  PATTERNS.find((p) => p.id === id) ?? PATTERNS[0]!;

export function canUsePattern(id: string, isPremium: boolean): boolean {
  if (!PATTERNS.some((p) => p.id === id)) return false;
  return isPremium || id === FREE_PATTERN;
}

/** How long one full cycle takes. Zero for a steady torch, which has no cycle. */
export function cycleMs(pattern: Pattern): number {
  return pattern.steps.reduce((total, step) => total + step.ms, 0);
}

/**
 * Whether the torch should be lit at `elapsed` into the pattern.
 *
 * Derived from elapsed time rather than advanced by a timer, so a dropped frame or a
 * backgrounded app cannot leave the sequence out of step with itself.
 */
export function isLitAt(pattern: Pattern, elapsed: number): boolean {
  if (pattern.steps.length === 0) return true;
  const total = cycleMs(pattern);
  if (total <= 0) return true;

  let offset = elapsed;
  if (pattern.loops) offset = ((elapsed % total) + total) % total;
  else if (elapsed >= total) return false;

  let seen = 0;
  for (const step of pattern.steps) {
    seen += step.ms;
    if (offset < seen) return step.on;
  }
  return pattern.steps.at(-1)!.on;
}
