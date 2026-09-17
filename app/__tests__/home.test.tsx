import { act, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Alert, Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

import Home from '../index';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { FREE_PATTERN } from '@/logic/patterns';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { useToolStore } from '@/store/useToolStore';
import { usePremiumStore } from '@/store/usePremiumStore';

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  useToolStore.setState({ tool: 'torch', pattern: FREE_PATTERN, surfaces: {}, activeSurface: null });
});

describe('the three tools', () => {
  it('offers all three and switches between them', async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    for (const key of ['torchTab', 'magnifierTab', 'levelTab'] as const) {
      expect(getByLabelText(t(key))).toBeTruthy();
    }
    await fireEvent.press(getByLabelText(t('levelTab')));
    expect(useToolStore.getState().tool).toBe('level');
  });
});

describe('the torch', () => {
  it('turns on and off', async () => {
    const { getByText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByText(t('torchOn')));
    expect(getByText(t('torchOff'))).toBeTruthy();
  });

  it('sends a free user tapping a locked pattern to the paywall, changing nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = await renderWithProviders(<Home />);

    await fireEvent.press(getByLabelText(t('patternLocked', { name: t('patternSos') })));
    expect(alert.mock.calls[0]![0]).toBe(t('lockedTitle'));
    expect(useToolStore.getState().pattern).toBe(FREE_PATTERN);
  });

  it('lets a paying user pick SOS', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t('patternSos')));
    expect(useToolStore.getState().pattern).toBe('sos');
  });
});

describe('the magnifier', () => {
  it('offers zoom steps', async () => {
    useToolStore.setState({ tool: 'magnifier' });
    const { getByLabelText } = await renderWithProviders(<Home />);
    expect(getByLabelText(`${t('zoomLabel')} 100%`)).toBeTruthy();
  });

  it('offers the purchase when a free user tries to freeze', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useToolStore.setState({ tool: 'magnifier' });
    const { getByText } = await renderWithProviders(<Home />);

    await fireEvent.press(getByText(t('freezeCta')));
    expect(alert.mock.calls[0]![0]).toBe(t('lockedTitle'));
  });

  it('freezes for a paying user and says nothing was saved', async () => {
    // The claim is that no image is written. The screen says so where it matters.
    usePremiumStore.setState({ isPremium: true });
    useToolStore.setState({ tool: 'magnifier' });
    const { getByText } = await renderWithProviders(<Home />);

    await fireEvent.press(getByText(t('freezeCta')));
    expect(getByText(t('frozenNote'))).toBeTruthy();
    expect(getByText(t('unfreezeCta'))).toBeTruthy();
  });
});

describe('the level', () => {
  // The name of this test was already the correct contract; its assertions
  // were not. It checked for "Pitch 0.0deg" before any sample had arrived,
  // which is exactly what the screen should NOT say -- alongside a headline
  // reading "Not level", it made a measurement claim the app had no basis for.
  it('claims nothing before it has a reading', async () => {
    useToolStore.setState({ tool: 'level' });
    const { getByText, queryByText } = await renderWithProviders(<Home />);
    expect(getByText(t('noReadingLabel'))).toBeTruthy();
    expect(queryByText(t('notLevelLabel'))).toBeNull();
    expect(getByText(`${t('pitchLabel')} \u2014`)).toBeTruthy();
    expect(getByText(`${t('rollLabel')} \u2014`)).toBeTruthy();
  });

  it('reports on the surface once a sample arrives', async () => {
    useToolStore.setState({ tool: 'level' });
    const { getByText } = await renderWithProviders(<Home />);
    await act(async () => {
      // Flat on its back: gravity straight down the z axis.
      (Accelerometer as unknown as { __emit: (s: object) => void }).__emit({ x: 0, y: 0, z: -1 });
    });
    expect(getByText(`${t('pitchLabel')} 0.0°`)).toBeTruthy();
    expect(getByText(`${t('rollLabel')} 0.0°`)).toBeTruthy();
  });

  it('offers the purchase when a free user saves a second surface', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useToolStore.setState({ tool: 'level', surfaces: { Existing: { pitch: 0, roll: 0 } } });

    const { getByLabelText, getByText } = await renderWithProviders(<Home />);
    // The level refuses to calibrate without a reading, so give it one.
    await act(async () => {
      (Accelerometer as unknown as { __emit: (s: object) => void }).__emit({ x: 0, y: 0, z: -1 });
    });
    await fireEvent.changeText(getByLabelText(t('surfaceNameLabel')), 'Second');
    await fireEvent.press(getByText(t('calibrateCta')));

    expect(alert.mock.calls[0]![0]).toBe(t('surfaceLimitTitle'));
    expect(Object.keys(useToolStore.getState().surfaces)).toEqual(['Existing']);
  });

  it('lists saved surfaces and lets one be selected', async () => {
    useToolStore.setState({ tool: 'level', surfaces: { Worktop: { pitch: 1, roll: 1 } } });
    const { getByLabelText } = await renderWithProviders(<Home />);

    await fireEvent.press(getByLabelText(t('useSurface', { name: 'Worktop' })));
    expect(useToolStore.getState().activeSurface).toBe('Worktop');

    await fireEvent.press(getByLabelText(t('clearSurface')));
    expect(useToolStore.getState().activeSurface).toBeNull();
  });
});

describe('navigation', () => {
  it('routes to settings', async () => {
    const { getByText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByText(t('settingsTitle')));
    expect(testRouter.push).toHaveBeenCalledWith('/settings');
  });
});

describe('a device with no torch', () => {
  /**
   * No iPad has a rear flash, and the torch IS the flash unit. `enableTorch`
   * on such a device is silently ignored by expo-camera: the camera mounts,
   * the button reads "Torch on", the user taps it, and nothing happens with
   * nothing on screen to say why.
   *
   * The app already shipped `torchUnavailable` in all fourteen locales. It was
   * translated and then never rendered anywhere -- this is the condition it
   * describes, and these two tests are what make it reachable.
   */
  afterEach(() => {
    Object.defineProperty(Platform, 'isPad', { value: false, configurable: true });
  });

  it('says so instead of offering a torch that cannot light', async () => {
    Object.defineProperty(Platform, 'isPad', { value: true, configurable: true });
    const { getByText, queryByText } = await renderWithProviders(<Home />);

    expect(getByText(t('torchUnavailable'))).toBeTruthy();
    expect(queryByText(t('torchOn'))).toBeNull();
  });

  it('still offers the torch where there is one', async () => {
    Object.defineProperty(Platform, 'isPad', { value: false, configurable: true });
    const { getByText, queryByText } = await renderWithProviders(<Home />);

    expect(getByText(t('torchOn'))).toBeTruthy();
    expect(queryByText(t('torchUnavailable'))).toBeNull();
  });
});
