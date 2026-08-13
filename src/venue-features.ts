/**
 * Shared helpers for per-venue feature detection (capability latches).
 */

/** Whether a venue version string is at least `major.minor`. Unparseable → true
 *  (optimistic — the 404 probe corrects a wrong yes; a wrong no never recovers). */
export function versionAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const m = version?.match(/^(\d+)\.(\d+)/);
  if (!m) return true;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj > major || (maj === major && min >= minor);
}

/**
 * Matches the distinctive body of a covia 404 for an UNMAPPED route
 * ("Endpoint GET /api/v1/... not found"), as opposed to a mapped route
 * 404ing for a missing resource. Only the former proves a feature endpoint
 * is absent on this venue and may latch it off; a per-resource 404 must
 * propagate to the caller (see AgentManager, covia#180: latching on a
 * resource 404 permanently downgraded a polling UI for a whole connection).
 */
export const ROUTE_MISSING_404 = /\bEndpoint (GET|POST|PUT|DELETE|PATCH|HEAD) /;
