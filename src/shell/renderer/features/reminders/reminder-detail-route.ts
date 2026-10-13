/**
 * Domain → dedicated detail route resolution for reminder primary actions.
 *
 * `actionType` decides the primary button copy (PO-REMI-002); the route target
 * is the domain's own detail surface from `data/structured/parentos/routes.yaml`. Domains without a
 * dedicated detail surface fall back to the profile console.
 */

// @nimi-authority: rule.parentos.remi.r002
// @nimi-authority: rule.parentos.hrec.r003
import type { ParentOSDestination } from '../../app-shell/navigation-destinations.js';
const DOMAIN_DETAIL_ROUTE: Record<string, ParentOSDestination> = {
  vaccine: { id: '/profile/vaccines' },
  checkup: { id: '/profile/medical-events' },
  vision: { id: '/profile/vision' },
  dental: { id: '/profile/dental' },
  growth: { id: '/profile/growth' },
  'bone-age': { id: '/profile/tanner' },
  milestone: { id: '/profile/milestones' },
  posture: { id: '/profile/posture' },
  sleep: { id: '/profile/sleep' },
  tanner: { id: '/profile/tanner' },
  fitness: { id: '/profile/fitness' },
  outdoor: { id: '/profile/outdoor' },
};

export function domainDetailRoute(domain: string): ParentOSDestination {
  return DOMAIN_DETAIL_ROUTE[domain] ?? { id: '/profile' };
}
