// RevenueCat wiring (SPEC.md §6, P2). iOS only — SPEC.md §9 cut list has no Android target.
//
// Verified against the installed react-native-purchases@10.4.2 type declarations (not assumed
// from training data — RevenueCat's JS API has changed across major versions): `Purchases.configure`,
// `getOfferings`, `purchasePackage`, `restorePurchases`, `getCustomerInfo`,
// `addCustomerInfoUpdateListener`, `PurchasesOffering.monthly`/`.annual`, and
// `PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR` (the non-deprecated way to detect a user
// cancelling out of the native purchase sheet — `PurchasesError.userCancelled` is deprecated).

import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

import { useEntitlementStore } from '@/stores/entitlementStore';

// Entitlement identifier configured in the RevenueCat dashboard (Entitlements tab), attached to
// both sb_monthly_999 and sb_annual_4999 (SPEC.md §6). UNVERIFIED against a real RevenueCat
// project — no account exists yet (see app/README.md's Monetization setup section). If the
// dashboard entitlement ends up named something else, update this constant to match.
const PRO_ENTITLEMENT_ID = 'pro';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;

let configured = false;

function isProFromCustomerInfo(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active[PRO_ENTITLEMENT_ID]);
}

/**
 * Configures the RevenueCat SDK and starts syncing entitlementStore.isPro from CustomerInfo
 * changes (purchases, renewals, expirations, restores). Safe to call with no API key set — that's
 * the expected state until a RevenueCat project exists — it's a no-op, so free-session gating and
 * the __DEV__ manual toggle in entitlementStore keep working unaffected.
 */
export function initPurchases() {
  if (configured || Platform.OS !== 'ios' || !IOS_API_KEY) return;
  configured = true;

  Purchases.configure({ apiKey: IOS_API_KEY });
  if (__DEV__) {
    Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG).catch(() => {});
  }

  Purchases.addCustomerInfoUpdateListener((info) => {
    useEntitlementStore.getState().setPro(isProFromCustomerInfo(info));
  });

  // Listener above only fires on *changes*; pull the current state once at startup too, in case
  // entitlementStore's persisted isPro (from a previous session) is stale.
  Purchases.getCustomerInfo()
    .then((info) => useEntitlementStore.getState().setPro(isProFromCustomerInfo(info)))
    .catch(() => {
      // Non-fatal — offline or first-run. The persisted isPro from the last successful sync (or
      // false, for a fresh install) is a reasonable interim value until the listener fires.
    });
}

export interface Plans {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

/**
 * Fetches the current RevenueCat offering and pulls out packages by RevenueCat's standard
 * duration-based package types (not by product identifier) — this is how offerings are
 * conventionally configured in the dashboard and keeps working if the product IDs ever change.
 * Returns nulls (never throws) when unconfigured, offline, or no offering is set up — paywall.tsx
 * falls back to SPEC.md §6's static prices/copy in that case.
 */
export async function fetchPlans(): Promise<Plans> {
  if (!configured) return { monthly: null, annual: null };
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    return {
      monthly: current?.monthly ?? null,
      annual: current?.annual ?? null,
    };
  } catch {
    return { monthly: null, annual: null };
  }
}

export class PurchaseCancelledError extends Error {}

function isCancellation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PurchasesError).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

/**
 * Buys `pkg`. entitlementStore.isPro is already updated by the time this resolves (the
 * CustomerInfo update listener fires before purchasePackage's own promise settles). Throws
 * PurchaseCancelledError when the user backs out of the native purchase sheet, so callers can
 * skip showing an error Alert for that specific, expected case.
 */
export async function purchase(pkg: PurchasesPackage): Promise<void> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    useEntitlementStore.getState().setPro(isProFromCustomerInfo(customerInfo));
  } catch (err) {
    if (isCancellation(err)) throw new PurchaseCancelledError();
    throw err;
  }
}

/**
 * Restores prior purchases (settings.tsx "Restore Purchases"). Returns whether an active pro
 * entitlement was found — entitlementStore.isPro is updated either way before this resolves.
 */
export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  const isPro = isProFromCustomerInfo(info);
  useEntitlementStore.getState().setPro(isPro);
  return isPro;
}
