"use client";

import { useEffect, useState } from "react";
import { readStoredValue, storageKeys } from "@/lib/storage";
import type { OnboardingState } from "@/types";

export const initialOnboardingState: OnboardingState = { completed: false };

export function useOnboardingState() {
  const [onboarding, setOnboarding] = useState<OnboardingState>(initialOnboardingState);
  const [isOnboardingLoaded, setIsOnboardingLoaded] = useState(false);

  useEffect(() => {
    const load = () => {
      setOnboarding(readStoredValue<OnboardingState>(storageKeys.onboarding, initialOnboardingState));
      setIsOnboardingLoaded(true);
    };
    const hydrationTimer = window.setTimeout(load, 0);
    window.addEventListener("planaround:onboarding", load);

    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("planaround:onboarding", load);
    };
  }, []);

  return { onboarding, isOnboardingLoaded, setOnboarding };
}
