export function automationsEnabled(config: {
  localMode?: boolean;
  runAutomations?: boolean;
}) {
  return config.localMode === false && config.runAutomations === true;
}
export function startEnabledAutomations(
  config,
  ...starters: Array<() => unknown>
) {
  if (!automationsEnabled(config)) return false;
  for (const start of starters) start();
  return true;
}
