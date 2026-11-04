export interface OnboardingState {
  providerCheckDone: boolean;
  hasConfiguredProvider: boolean;
  onboardingDone: boolean;
}

export const shouldShowFirstRun = ({
  providerCheckDone,
  hasConfiguredProvider,
  onboardingDone,
}: OnboardingState) =>
  providerCheckDone && !hasConfiguredProvider && !onboardingDone;

export const isDemoMode = ({
  providerCheckDone,
  hasConfiguredProvider,
}: Pick<OnboardingState, 'providerCheckDone' | 'hasConfiguredProvider'>) =>
  providerCheckDone && !hasConfiguredProvider;
