export const dashboardState = {
  cache: new Map(),
  revision: 0,
};

export function invalidateDashboard(userId) {
  dashboardState.revision += 1;
  for (const key of dashboardState.cache.keys()) {
    if (key.startsWith(`${userId}:`)) dashboardState.cache.delete(key);
  }
}
