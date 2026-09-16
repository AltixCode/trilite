import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Accelerometer } from "expo-sensors";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";

import { BannerAdSlot } from "@/components/BannerAdSlot";
import { Button, Screen, Text } from "@/components/ui";
import { t, type TranslationKey } from "@/i18n";
import {
  type Angles,
  anglesFrom,
  applyCalibration,
  calibrationFrom,
  formatAngle,
  isLevel,
  smooth,
} from "@/logic/level";
import { FREE_PATTERN, PATTERNS, isLitAt, patternById } from "@/logic/patterns";
import { type Tool, useToolStore } from "@/store/useToolStore";
import { usePremiumStore } from "@/store/usePremiumStore";
import { useTheme } from "@/theme";

const MIN_TOUCH_TARGET = 44;
/** How often the torch pattern is re-evaluated. Fast enough for an 80 ms strobe. */
const TORCH_TICK_MS = 40;

const TOOLS: { id: Tool; key: TranslationKey }[] = [
  { id: "torch", key: "torchTab" },
  { id: "magnifier", key: "magnifierTab" },
  { id: "level", key: "levelTab" },
];

export default function Tools() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const isPremium = usePremiumStore((s) => s.isPremium);

  const tool = useToolStore((s) => s.tool);
  const pattern = useToolStore((s) => s.pattern);
  const surfaces = useToolStore((s) => s.surfaces);
  const activeSurface = useToolStore((s) => s.activeSurface);
  const setTool = useToolStore((s) => s.setTool);
  const setPattern = useToolStore((s) => s.setPattern);
  const saveSurface = useToolStore((s) => s.saveSurface);
  const selectSurface = useToolStore((s) => s.selectSurface);
  const calibrationFor = useToolStore((s) => s.calibrationFor);

  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [angles, setAngles] = useState<Angles | null>(null);
  const [surfaceName, setSurfaceName] = useState("");
  // When the current pattern run began, and a clock that ticks while it runs. Kept as state
  // rather than written from inside the effect: a synchronous setState in an effect is what
  // the React Compiler's cascading-render rule exists to catch.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), TORCH_TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  // Derived, not stored: the pattern is read from elapsed time, so a dropped tick cannot
  // leave the sequence out of step with itself.
  const lit =
    startedAt === null ? false : isLitAt(patternById(pattern), Math.max(0, now - startedAt));

  const toggleTorch = useCallback(() => {
    setTorchOn((on) => {
      const next = !on;
      const at = next ? Date.now() : null;
      setStartedAt(at);
      if (at !== null) setNow(at);
      return next;
    });
  }, []);

  useEffect(() => {
    if (tool !== "level") return;
    Accelerometer.setUpdateInterval(60);
    const sub = Accelerometer.addListener((sample) => {
      setAngles((previous) => smooth(previous, anglesFrom(sample)));
    });
    return () => sub.remove();
  }, [tool]);

  const offerUnlock = useCallback(
    (titleKey: TranslationKey) => {
      Alert.alert(t(titleKey), t("unlockBody"), [
        { text: t("cancel"), style: "cancel" },
        { text: t("removeAdsCta"), onPress: () => router.push("/paywall") },
      ]);
    },
    [router],
  );

  const pickPattern = useCallback(
    (id: string) => {
      if (setPattern(id, isPremium) === "locked") {
        offerUnlock("lockedTitle");
        return;
      }
      // Restart the sequence so a switch mid-flash begins the new pattern at its first step.
      if (torchOn) {
        const at = Date.now();
        setStartedAt(at);
        setNow(at);
      }
      void Haptics.selectionAsync();
    },
    [setPattern, isPremium, offerUnlock, torchOn],
  );

  const toggleFreeze = useCallback(() => {
    if (!isPremium) {
      offerUnlock("lockedTitle");
      return;
    }
    setFrozen((v) => !v);
  }, [isPremium, offerUnlock]);

  const corrected = angles
    ? applyCalibration(angles, calibrationFor(activeSurface))
    : null;

  const calibrate = useCallback(() => {
    if (!angles) return;
    const name = surfaceName.trim() || t("surfacesTitle");
    const outcome = saveSurface(name, calibrationFrom(angles), isPremium);
    if (outcome === "limit-reached") {
      offerUnlock("surfaceLimitTitle");
      return;
    }
    if (outcome === "saved") {
      setSurfaceName("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [angles, surfaceName, saveSurface, isPremium, offerUnlock]);

  const needsCamera = tool !== "level" && !permission?.granted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* topInset, because this route sets headerShown:false -- with no
          navigation header above it, nothing else pays the notch, and the
          title renders underneath the status bar. */}
      <Screen scroll topInset>
        <View style={[styles.chips, { gap: spacing.sm }]}>
          {TOOLS.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityLabel={t(option.key)}
              accessibilityState={{ selected: tool === option.id }}
              onPress={() => setTool(option.id)}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: radius.md,
                backgroundColor: colors.surfaceAlt,
                borderWidth: tool === option.id ? 2 : 1,
                borderColor: tool === option.id ? colors.accent : colors.border,
              }}
            >
              <Text variant="caption">{t(option.key)}</Text>
            </Pressable>
          ))}
        </View>

        {needsCamera ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text variant="bodyStrong">{t("cameraNeeded")}</Text>
            <Text
              variant="caption"
              tone="muted"
              style={{ marginTop: spacing.xs }}
            >
              {t("cameraWhy")}
            </Text>
            <Button
              label={t("grantCamera")}
              fullWidth
              onPress={() => void requestPermission()}
              style={{ marginTop: spacing.md }}
            />
          </View>
        ) : null}

        {tool === "torch" && !needsCamera ? (
          <>
            {/* The torch is the camera's flash unit, so a camera has to be mounted for it to
                exist at all. It is kept off-screen and no frame is read. */}
            <CameraView
              style={styles.hidden}
              facing="back"
              enableTorch={torchOn && lit}
            />

            <Button
              label={torchOn ? t("torchOff") : t("torchOn")}
              fullWidth
              onPress={toggleTorch}
              style={{ marginTop: spacing.xl }}
            />

            <View
              style={[styles.chips, { gap: spacing.sm, marginTop: spacing.lg }]}
            >
              {PATTERNS.map((option) => {
                const locked = !isPremium && option.id !== FREE_PATTERN;
                const name = t(option.nameKey as TranslationKey);
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={
                      locked ? t("patternLocked", { name }) : name
                    }
                    accessibilityState={{ selected: pattern === option.id }}
                    onPress={() => pickPattern(option.id)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET,
                      justifyContent: "center",
                      paddingHorizontal: spacing.base,
                      borderRadius: radius.full,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: pattern === option.id ? 2 : 1,
                      borderColor:
                        pattern === option.id ? colors.accent : colors.border,
                    }}
                  >
                    <Text variant="caption">{name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {tool === "magnifier" && !needsCamera ? (
          <>
            <View
              style={{
                marginTop: spacing.lg,
                // Sized from the width it is given rather than a fixed height, so the
                // magnifier fills a large screen instead of leaving a dead band.
                aspectRatio: 3 / 4,
                borderRadius: radius.lg,
                overflow: "hidden",
                backgroundColor: colors.surfaceAlt,
              }}
            >
              {/* Freezing stops the preview by unmounting it rather than capturing anything:
                  no image is written, which is what keeps the privacy note true. */}
              {frozen ? null : (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  zoom={zoom}
                />
              )}
            </View>

            <Text
              variant="micro"
              tone="faint"
              style={{ marginTop: spacing.sm }}
            >
              {`${t("zoomLabel")} ${Math.round(zoom * 100)}%`}
            </Text>
            <View
              style={[styles.row, { gap: spacing.sm, marginTop: spacing.xs }]}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                <Pressable
                  key={step}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("zoomLabel")} ${Math.round(step * 100)}%`}
                  onPress={() => setZoom(step)}
                  style={{
                    flex: 1,
                    minHeight: MIN_TOUCH_TARGET,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: zoom === step ? 2 : 1,
                    borderColor: zoom === step ? colors.accent : colors.border,
                  }}
                >
                  <Text variant="caption">{`${Math.round(step * 100)}%`}</Text>
                </Pressable>
              ))}
            </View>

            <Button
              label={frozen ? t("unfreezeCta") : t("freezeCta")}
              variant="secondary"
              fullWidth
              onPress={toggleFreeze}
              style={{ marginTop: spacing.md }}
            />
            {frozen ? (
              <Text
                variant="micro"
                tone="faint"
                style={{ marginTop: spacing.xs }}
              >
                {t("frozenNote")}
              </Text>
            ) : null}
          </>
        ) : null}

        {tool === "level" ? (
          <>
            <View style={{ alignItems: "center", marginTop: spacing.xl }}>
              <Text
                variant="display"
                tone={corrected && isLevel(corrected) ? "accent" : "default"}
              >
                {corrected && isLevel(corrected)
                  ? t("isLevelLabel")
                  : t("notLevelLabel")}
              </Text>
              <Text variant="numeric" style={{ marginTop: spacing.md }}>
                {`${t("pitchLabel")} ${formatAngle(corrected?.pitch ?? 0)}°`}
              </Text>
              <Text variant="numeric">
                {`${t("rollLabel")} ${formatAngle(corrected?.roll ?? 0)}°`}
              </Text>
            </View>

            <TextInput
              value={surfaceName}
              onChangeText={setSurfaceName}
              autoCapitalize="words"
              placeholder={t("surfaceNameLabel")}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={t("surfaceNameLabel")}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                marginTop: spacing.lg,
                color: colors.text,
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
              }}
            />
            <Button
              label={t("calibrateCta")}
              fullWidth
              onPress={calibrate}
              style={{ marginTop: spacing.sm }}
            />

            <Text
              variant="micro"
              tone="faint"
              style={{ marginTop: spacing.lg }}
            >
              {t("surfacesTitle").toUpperCase()}
            </Text>
            <View
              style={[styles.chips, { gap: spacing.sm, marginTop: spacing.xs }]}
            >
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={t("clearSurface")}
                accessibilityState={{ selected: activeSurface === null }}
                onPress={() => selectSurface(null)}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  justifyContent: "center",
                  paddingHorizontal: spacing.base,
                  borderRadius: radius.full,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: activeSurface === null ? 2 : 1,
                  borderColor:
                    activeSurface === null ? colors.accent : colors.border,
                }}
              >
                <Text variant="caption">{t("clearSurface")}</Text>
              </Pressable>

              {Object.keys(surfaces).map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="radio"
                  accessibilityLabel={t("useSurface", { name })}
                  accessibilityState={{ selected: activeSurface === name }}
                  onPress={() => selectSurface(name)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    justifyContent: "center",
                    paddingHorizontal: spacing.base,
                    borderRadius: radius.full,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: activeSurface === name ? 2 : 1,
                    borderColor:
                      activeSurface === name ? colors.accent : colors.border,
                  }}
                >
                  <Text variant="caption">{name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Button
          label={t("settingsTitle")}
          variant="ghost"
          fullWidth
          onPress={() => router.push("/settings")}
          style={{ marginTop: spacing.xl }}
        />
      </Screen>
      <BannerAdSlot />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  chips: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  // Present so the flash unit exists, but never shown.
  hidden: { width: 1, height: 1, opacity: 0, position: "absolute" },
});
