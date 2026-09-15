import AsyncStorage from '@react-native-async-storage/async-storage';

import { FREE_SURFACES, MAX_SURFACES, TOOL_CACHE_KEY, useToolStore } from '../useToolStore';
import { NO_CALIBRATION } from '@/logic/level';
import { FREE_PATTERN } from '@/logic/patterns';

const cal = (pitch: number, roll: number) => ({ pitch, roll });

const reset = () =>
  useToolStore.setState({
    tool: 'torch',
    pattern: FREE_PATTERN,
    surfaces: {},
    activeSurface: null,
  });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  reset();
});

describe('tools and patterns', () => {
  it('switches tool', () => {
    useToolStore.getState().setTool('level');
    expect(useToolStore.getState().tool).toBe('level');
  });

  it('refuses a locked pattern to a free user', () => {
    expect(useToolStore.getState().setPattern('sos', false)).toBe('locked');
    expect(useToolStore.getState().pattern).toBe(FREE_PATTERN);
  });

  it('allows one for a paying user', () => {
    expect(useToolStore.getState().setPattern('sos', true)).toBe('set');
    expect(useToolStore.getState().pattern).toBe('sos');
  });

  it('refuses a pattern that does not exist', () => {
    expect(useToolStore.getState().setPattern('disco', true)).toBe('locked');
  });
});

describe('surfaces', () => {
  it('saves a calibration and makes it active', () => {
    expect(useToolStore.getState().saveSurface('Worktop', cal(1, -2), false)).toBe('saved');
    expect(useToolStore.getState().activeSurface).toBe('Worktop');
    expect(useToolStore.getState().calibrationFor('Worktop')).toEqual(cal(1, -2));
  });

  it('refuses an unnamed or non-finite calibration', () => {
    expect(useToolStore.getState().saveSurface('  ', cal(0, 0), true)).toBe('invalid');
    expect(useToolStore.getState().saveSurface('X', cal(Number.NaN, 0), true)).toBe('invalid');
  });

  it('stops a free user at one surface', () => {
    expect(useToolStore.getState().saveSurface('One', cal(0, 0), false)).toBe('saved');
    expect(useToolStore.getState().saveSurface('Two', cal(0, 0), false)).toBe('limit-reached');
    expect(Object.keys(useToolStore.getState().surfaces)).toHaveLength(FREE_SURFACES);
  });

  it('still lets a free user re-calibrate the one they have', () => {
    // Re-calibrating the surface you already keep is not keeping more of them.
    useToolStore.getState().saveSurface('One', cal(0, 0), false);
    expect(useToolStore.getState().saveSurface('One', cal(3, 3), false)).toBe('saved');
    expect(useToolStore.getState().calibrationFor('One')).toEqual(cal(3, 3));
  });

  it('lets a paying user keep several', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(useToolStore.getState().saveSurface(`S${i}`, cal(i, i), true)).toBe('saved');
    }
    expect(Object.keys(useToolStore.getState().surfaces)).toHaveLength(5);
  });

  it('caps even a paying user', () => {
    for (let i = 0; i < MAX_SURFACES; i += 1) {
      useToolStore.getState().saveSurface(`S${i}`, cal(0, 0), true);
    }
    expect(useToolStore.getState().saveSurface('OneMore', cal(0, 0), true)).toBe('limit-reached');
  });

  it('removes a surface and forgets it was active', () => {
    useToolStore.getState().saveSurface('Gone', cal(1, 1), false);
    useToolStore.getState().removeSurface('Gone');
    expect(useToolStore.getState().surfaces).toEqual({});
    expect(useToolStore.getState().activeSurface).toBeNull();
  });

  it('ignores a request to use a surface it does not have', () => {
    useToolStore.getState().selectSurface('Nope');
    expect(useToolStore.getState().activeSurface).toBeNull();
  });

  it('falls back to no calibration for an unknown or cleared surface', () => {
    expect(useToolStore.getState().calibrationFor(null)).toEqual(NO_CALIBRATION);
    expect(useToolStore.getState().calibrationFor('Nope')).toEqual(NO_CALIBRATION);
  });
});

describe('persistence', () => {
  it('round-trips surfaces and the active one', async () => {
    useToolStore.getState().saveSurface('Desk', cal(0.5, -0.5), true);
    await useToolStore.getState().persist();

    reset();
    await useToolStore.getState().hydrate();
    expect(useToolStore.getState().calibrationFor('Desk')).toEqual(cal(0.5, -0.5));
    expect(useToolStore.getState().activeSurface).toBe('Desk');
  });

  it('never restores a locked pattern', async () => {
    // Restoring one would light a paid strobe for free on the next launch.
    useToolStore.getState().setPattern('sos', true);
    await useToolStore.getState().persist();
    reset();
    await useToolStore.getState().hydrate();
    expect(useToolStore.getState().pattern).toBe(FREE_PATTERN);
  });

  it('drops a calibration that is not a pair of numbers', async () => {
    await AsyncStorage.setItem(
      TOOL_CACHE_KEY,
      JSON.stringify({ surfaces: { Bad: { pitch: 'x', roll: 1 }, Good: { pitch: 1, roll: 1 } } }),
    );
    await useToolStore.getState().hydrate();
    expect(Object.keys(useToolStore.getState().surfaces)).toEqual(['Good']);
  });

  it('starts clean on stored rubbish', async () => {
    await AsyncStorage.setItem(TOOL_CACHE_KEY, '{"tool":9,"surfaces":"none"}');
    await useToolStore.getState().hydrate();
    expect(useToolStore.getState().tool).toBe('torch');
    expect(useToolStore.getState().surfaces).toEqual({});
  });
});
