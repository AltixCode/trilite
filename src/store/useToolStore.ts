/**
 * Which tool is showing, the torch pattern, and the level calibration per surface.
 *
 * Three of the paywall's four claims are enforced here — the strobe and SOS patterns, the
 * magnifier's frozen frame, and calibration saved per surface — and each takes `isPremium`
 * explicitly at the call site.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { type Calibration, NO_CALIBRATION } from '@/logic/level';
import { type PatternId, FREE_PATTERN, canUsePattern } from '@/logic/patterns';

export const TOOL_CACHE_KEY = 'trilite.state.v1';

/** Named surfaces a free user can calibrate. The purchase lifts it. */
export const FREE_SURFACES = 1;
/** A ceiling even for a paying user. */
export const MAX_SURFACES = 20;

export type Tool = 'torch' | 'magnifier' | 'level';

interface ToolState {
  tool: Tool;
  pattern: PatternId;
  /** Calibration per named surface. */
  surfaces: Record<string, Calibration>;
  activeSurface: string | null;

  setTool: (tool: Tool) => void;
  setPattern: (id: string, isPremium: boolean) => 'set' | 'locked';
  saveSurface: (name: string, calibration: Calibration, isPremium: boolean) =>
    | 'saved'
    | 'limit-reached'
    | 'invalid';
  removeSurface: (name: string) => void;
  selectSurface: (name: string | null) => void;
  calibrationFor: (name: string | null) => Calibration;
  persist: () => Promise<void>;
  hydrate: () => Promise<void>;
}

function validSurfaces(value: unknown): Record<string, Calibration> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, Calibration> = {};
  for (const [name, cal] of Object.entries(value as Record<string, unknown>)) {
    if (!name.trim() || !cal || typeof cal !== 'object') continue;
    const { pitch, roll } = cal as Calibration;
    if (typeof pitch !== 'number' || typeof roll !== 'number') continue;
    if (!Number.isFinite(pitch) || !Number.isFinite(roll)) continue;
    out[name] = { pitch, roll };
  }
  return out;
}

export const useToolStore = create<ToolState>((set, get) => ({
  tool: 'torch',
  pattern: FREE_PATTERN,
  surfaces: {},
  activeSurface: null,

  setTool(tool) {
    set({ tool });
    void get().persist();
  },

  setPattern(id, isPremium) {
    if (!canUsePattern(id, isPremium)) return 'locked';
    set({ pattern: id as PatternId });
    void get().persist();
    return 'set';
  },

  saveSurface(name, calibration, isPremium) {
    const clean = name.trim();
    if (!clean) return 'invalid';
    if (!Number.isFinite(calibration.pitch) || !Number.isFinite(calibration.roll)) return 'invalid';

    const { surfaces } = get();
    const replacing = clean in surfaces;
    const limit = isPremium ? MAX_SURFACES : FREE_SURFACES;
    // Replacing an existing surface is always allowed: re-calibrating the one you have is
    // not the same as keeping more than you are entitled to.
    if (!replacing && Object.keys(surfaces).length >= limit) return 'limit-reached';

    set((s) => ({
      surfaces: { ...s.surfaces, [clean]: calibration },
      activeSurface: clean,
    }));
    void get().persist();
    return 'saved';
  },

  removeSurface(name) {
    set((s) => {
      const next = { ...s.surfaces };
      delete next[name];
      return { surfaces: next, activeSurface: s.activeSurface === name ? null : s.activeSurface };
    });
    void get().persist();
  },

  selectSurface(name) {
    if (name !== null && !(name in get().surfaces)) return;
    set({ activeSurface: name });
    void get().persist();
  },

  calibrationFor(name) {
    if (name === null) return NO_CALIBRATION;
    return get().surfaces[name] ?? NO_CALIBRATION;
  },

  async persist() {
    const { tool, pattern, surfaces, activeSurface } = get();
    try {
      await AsyncStorage.setItem(
        TOOL_CACHE_KEY,
        JSON.stringify({ tool, pattern, surfaces, activeSurface }),
      );
    } catch {
      // A lost calibration is survivable; a failed launch is not.
    }
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(TOOL_CACHE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const record = parsed as Record<string, unknown>;
      const surfaces = validSurfaces(record.surfaces);
      const active = record.activeSurface;
      set({
        tool: record.tool === 'magnifier' || record.tool === 'level' ? record.tool : 'torch',
        // A stored pattern is NOT trusted to still be unlocked: entitlement is checked when
        // it is used, and starting on a locked pattern would light the torch for free.
        pattern: FREE_PATTERN,
        surfaces,
        activeSurface: typeof active === 'string' && active in surfaces ? active : null,
      });
    } catch {
      // Unreadable storage starts clean rather than preventing launch.
    }
  },
}));
