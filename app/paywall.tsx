import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Text } from "@/components/ui";
import { t } from "@/i18n";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/monetization/config";
import { usePremiumStore } from "@/store/usePremiumStore";
import { useTheme } from "@/theme";
import { useTabletColumn } from "../src/theme/useTabletColumn";

/**
 * The one purchase this app sells: a lifetime non-consumable that removes the ads and unlocks
 * everything. There is deliberately no plan picker — a second option would be a subscription,
 * and the portfolio does not sell those.
 */
const BENEFIT_KEYS = [
  { title: "feat1Title", desc: "feat1Desc" },
  { title: "feat2Title", desc: "feat2Desc" },
  { title: "feat3Title", desc: "feat3Desc" },
  { title: "feat4Title", desc: "feat4Desc" },
] as const;

type Benefit = (typeof BENEFIT_KEYS)[number];

/**
 * Chunks the already-filtered benefit list into cards of at most two claims each.
 * Not hardcoded to "two cards" — an app with three claims gets a two-and-one split,
 * one claim gets a single card, and this still degrades gracefully to zero cards.
 */
function pairUp<T>(items: readonly T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    pairs.push(items.slice(i, i + 2));
  }
  return pairs;
}

export default function Paywall() {
  /**
   * Only the claims this app can actually make.
   *
   * Four slots is what this template offers, not a quota to fill. An app whose
   * purchase removes the ads and nothing else has one honest thing to say about
   * it, and padding to four is how "Everything unlocked -- every level, every
   * mode and the full archive" ends up on a paywall for an app with no levels,
   * no modes and no archive.
   *
   * A benefit whose title is blank is dropped, so cutting a claim is a one-line
   * edit in `i18n` rather than a component change. Computed per render, not at
   * module load, so it follows the active locale.
   */
  const benefits = BENEFIT_KEYS.filter((b) => t(b.title).trim().length > 0);
  const cards = pairUp(benefits);
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const tabletColumn = useTabletColumn(640);
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();

  const lifetime = usePremiumStore((s) => s.lifetime);
  const offeringsResolved = usePremiumStore((s) => s.offeringsResolved);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isPurchasing = usePremiumStore((s) => s.isPurchasing);
  const error = usePremiumStore((s) => s.error);
  const purchase = usePremiumStore((s) => s.purchase);
  const restore = usePremiumStore((s) => s.restore);
  // A restore that finds nothing must SAY so.
  // `restore()` returned 'none' and the screen rendered nothing at all, so
  // the button read as broken -- and App Review taps Restore on every
  // submission. The string already existed in all fourteen locales; it was
  // simply never shown on this paywall shape.
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const refreshOfferings = usePremiumStore((s) => s.refreshOfferings);

  useEffect(() => {
    void refreshOfferings();
  }, [refreshOfferings]);

  // A user who already owns it must never be left staring at a buy button.
  useEffect(() => {
    if (isPremium) router.back();
  }, [isPremium, router]);

  const price = lifetime?.product.priceString;

  // Card width follows the tablet-capped column, not the raw screen, so the carousel
  // never spans the full width of a 13" iPad the way the rest of this screen doesn't.
  const columnWidth =
    typeof tabletColumn.maxWidth === "number"
      ? tabletColumn.maxWidth
      : SCREEN_WIDTH;
  const cardWidth = Math.min(SCREEN_WIDTH, columnWidth) - spacing.xl * 2;

  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeCard, setActiveCard] = useState(0);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
      }}
    >
      <View style={{ alignItems: "flex-end", padding: spacing.base }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("close")}
          hitSlop={12}
          onPress={() => router.back()}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <Text variant="body" tone="muted">
            {t("close")}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.sm,
          paddingBottom: spacing["3xl"],
          flexGrow: 1,
        }}
      >
        {/* Paired hero cards, not a flat list.

            29 of 44 apps in this portfolio shipped one paywall file byte for
            byte, and Apple rejected under 4.3(a) naming "multiple similar apps
            using a repackaged app template". This shape groups the same four
            claims into a small horizontally-paged carousel of two-claim cards,
            each one gently scaling into focus as it centers — a different
            reading rhythm from a numbered list, not a recolor of one. */}
        <View style={{ paddingHorizontal: spacing.xl, ...tabletColumn }}>
          <Text variant="micro" tone="accent">
            {t("antiSubTitle")}
          </Text>
          <Text variant="display" style={{ marginTop: spacing.xs }}>
            {t("paywallTitle")}
          </Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
            {t("antiSubHeadline")}
          </Text>
        </View>

        {cards.length > 0 ? (
          <View style={{ marginTop: spacing["2xl"] }}>
            <Animated.ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + spacing.base}
              decelerationRate="fast"
              contentContainerStyle={{
                paddingHorizontal: (SCREEN_WIDTH - cardWidth) / 2,
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                {
                  useNativeDriver: true,
                  listener: (e) => {
                    const x = (
                      e as { nativeEvent: { contentOffset: { x: number } } }
                    ).nativeEvent.contentOffset.x;
                    const index = Math.round(x / (cardWidth + spacing.base));
                    setActiveCard(
                      Math.max(0, Math.min(cards.length - 1, index)),
                    );
                  },
                },
              )}
              scrollEventThrottle={16}
            >
              {cards.map((pair, cardIndex) => {
                const inputRange = [
                  (cardIndex - 1) * (cardWidth + spacing.base),
                  cardIndex * (cardWidth + spacing.base),
                  (cardIndex + 1) * (cardWidth + spacing.base),
                ];
                const scale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.94, 1, 0.94],
                  extrapolate: "clamp",
                });
                return (
                  <Animated.View
                    key={pair.map((b) => b.title).join("+")}
                    style={{
                      width: cardWidth,
                      marginRight:
                        cardIndex === cards.length - 1 ? 0 : spacing.base,
                      transform: [{ scale }],
                      padding: spacing.xl,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: colors.border,
                      gap: spacing.lg,
                    }}
                  >
                    {pair.map((benefit: Benefit) => (
                      <View key={benefit.title}>
                        <Text variant="bodyStrong">{t(benefit.title)}</Text>
                        <Text
                          variant="caption"
                          tone="muted"
                          style={{ marginTop: 2 }}
                        >
                          {t(benefit.desc)}
                        </Text>
                      </View>
                    ))}
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>

            {/* A row of segments, not dots — each one is the active card's own width share. */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: spacing.xs,
                marginTop: spacing.md,
              }}
            >
              {cards.map((pair, i) => (
                <View
                  key={pair.map((b) => b.title).join("+")}
                  style={{
                    height: 4,
                    width: i === activeCard ? 24 : 10,
                    borderRadius: 2,
                    backgroundColor:
                      i === activeCard ? colors.accent : colors.border,
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View
          style={{
            paddingHorizontal: spacing.xl,
            ...tabletColumn,
            marginTop: spacing["2xl"],
          }}
        >
          {lifetime ? (
            <Button
              label={
                price
                  ? t("lifetimeAccess", { price })
                  : t("lifetimeAccessPlain")
              }
              size="lg"
              fullWidth
              loading={isPurchasing}
              onPress={() => void purchase(lifetime)}
            />
          ) : offeringsResolved ? (
            // Resolved, with no package: the store is genuinely unreachable or carries no
            // product yet. Say that, and keep Restore reachable below — a user who already
            // paid must still be able to get their purchase back.
            <View style={{ padding: spacing.xl, alignItems: "center" }}>
              <Text variant="caption" tone="muted" align="center">
                {t("storeUnavailable")}
              </Text>
            </View>
          ) : (
            <View style={{ padding: spacing.xl, alignItems: "center" }}>
              <ActivityIndicator color={colors.textMuted} />
              <Text
                variant="caption"
                tone="muted"
                style={{ marginTop: spacing.md }}
              >
                {t("loadingPrice")}
              </Text>
            </View>
          )}
          <Text
            variant="caption"
            tone="muted"
            align="center"
            style={{ marginTop: spacing.md }}
          >
            {t("oneTimePayment")}
          </Text>

          {error ? (
            <Text
              variant="caption"
              tone="danger"
              align="center"
              style={{ marginTop: spacing.base }}
            >
              {error}
            </Text>
          ) : null}

          {restoreNotice ? (
            <Text
              accessibilityRole="alert"
              variant="caption"
              tone="muted"
              align="center"
              style={{ marginTop: spacing.base }}
            >
              {restoreNotice}
            </Text>
          ) : null}

          <Button
            label={t("restorePurchases")}
            variant="ghost"
            fullWidth
            onPress={() => {
              setRestoreNotice(null);
              void restore().then((outcome) => {
                if (outcome === "none") setRestoreNotice(t("noPriorPurchases"));
              });
            }}
            style={{ marginTop: spacing.lg }}
          />

          <Text
            variant="micro"
            tone="faint"
            align="center"
            style={{ marginTop: spacing.xl }}
          >
            {t("adsDisclosure")}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.lg,
              marginTop: spacing.md,
            }}
          >
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("termsOfUse")}
              hitSlop={12}
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              <Text variant="micro" tone="faint">
                {t("termsOfUse")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("privacyPolicy")}
              hitSlop={12}
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            >
              <Text variant="micro" tone="faint">
                {t("privacyPolicy")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
