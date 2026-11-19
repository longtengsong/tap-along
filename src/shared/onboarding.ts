export interface OnboardingState {
  providerCheckDone: boolean;
  hasConfiguredProvider: boolean;
  demoRequested: boolean;
}

/**
 * 未配置模型且用户没有显式进入演示模式时，始终停留在首用引导页，
 * 阻止在没有模型的情况下开始真实对话。
 *
 * 这里刻意不参考「首用引导已关闭」之类的历史标记：关闭设置但没有配置模型时，
 * 不能因此悄悄落入演示模式，让人误以为接的是真实模型。
 */
export const shouldShowFirstRun = ({
  providerCheckDone,
  hasConfiguredProvider,
  demoRequested,
}: OnboardingState) =>
  providerCheckDone && !hasConfiguredProvider && !demoRequested;

/**
 * 演示模式必须由用户显式选择，且只在没有配置模型时成立。
 * 配置模型后调用方会清掉演示标记，避免后续再被当成演示。
 */
export const isDemoMode = ({
  providerCheckDone,
  hasConfiguredProvider,
  demoRequested,
}: OnboardingState) =>
  providerCheckDone && !hasConfiguredProvider && demoRequested;
