import { lazy, Suspense } from 'react';
import { useParentOSPosition } from './app-navigation.js';
import type { ParentOSDestinationId } from './navigation-destinations.js';
import { useAppStore } from './app-store.js';
import type { ComponentType } from 'react';
import { Surface } from '@nimiplatform/kit/ui';

const TimelinePage = lazy(() => import('../features/timeline/timeline-page.js'));
const ProfilePage = lazy(() => import('../features/profile/profile-page.js'));
const HealthMetricDetailPage = lazy(() => import('../features/profile/health-metric-detail-page.js'));
const GrowthCurvePage = lazy(() => import('../features/profile/growth-curve-page.js'));
const MilestonePage = lazy(() => import('../features/profile/milestone-page.js'));
const VaccinePage = lazy(() => import('../features/profile/vaccine-page.js'));
const VisionPage = lazy(() => import('../features/profile/vision-page.js'));
const DentalPage = lazy(() => import('../features/profile/dental-page.js'));
const AllergyPage = lazy(() => import('../features/profile/allergy-page.js'));
const SleepPage = lazy(() => import('../features/profile/sleep-page.js'));
const MedicalEventsPage = lazy(() => import('../features/profile/medical-events-page.js'));
const PosturePage = lazy(() => import('../features/profile/posture-page.js'));
const TannerPage = lazy(() => import('../features/profile/tanner-page.js'));
const FitnessPage = lazy(() => import('../features/profile/fitness-page.js'));
const OutdoorPage = lazy(() => import('../features/outdoor/outdoor-page.js').then((m) => ({ default: m.OutdoorPage })));
const JournalPage = lazy(() => import('../features/journal/journal-page.js'));
const AdvisorPage = lazy(() => import('../features/advisor/advisor-page.js'));
const ReportsPage = lazy(() => import('../features/reports/reports-page.js'));
const RemindersPage = lazy(() => import('../features/reminders/reminders-page.js'));
const SettingsPage = lazy(() => import('../features/settings/settings-page.js'));
const ChildrenSettingsPage = lazy(() => import('../features/settings/children-settings-page.js'));
const NurtureModeSettingsPage = lazy(() => import('../features/settings/nurture-mode-settings-page.js'));
const ReminderSettingsPage = lazy(() => import('../features/settings/reminder-settings-page.js'));
const AiSettingsPage = lazy(() => import('../features/settings/ai-settings-page.js'));
const PrivacySettingsPage = lazy(() => import('../features/settings/privacy-settings-page.js'));
const AboutSettingsPage = lazy(() => import('../features/settings/about-settings-page.js'));

function PageFallback() {
  return (
    <Surface tone="canvas" padding="none" className="flex h-full items-center justify-center border-0 text-[var(--nimi-text-muted)]">
      Loading...
    </Surface>
  );
}

export const PARENTOS_PAGES: Record<ParentOSDestinationId, ComponentType> = {
  '/timeline': TimelinePage,
  '/profile': ProfilePage,
  '/profile/health/:metricId': HealthMetricDetailPage,
  '/profile/growth': GrowthCurvePage,
  '/profile/milestones': MilestonePage,
  '/profile/vaccines': VaccinePage,
  '/profile/vision': VisionPage,
  '/profile/dental': DentalPage,
  '/profile/allergies': AllergyPage,
  '/profile/sleep': SleepPage,
  '/profile/medical-events': MedicalEventsPage,
  '/profile/posture': PosturePage,
  '/profile/tanner': TannerPage,
  '/profile/fitness': FitnessPage,
  '/profile/outdoor': OutdoorPage,
  '/journal': JournalPage,
  '/advisor': AdvisorPage,
  '/reminders': RemindersPage,
  '/reports': ReportsPage,
  '/settings': SettingsPage,
  '/settings/children': ChildrenSettingsPage,
  '/settings/nurture-mode': NurtureModeSettingsPage,
  '/settings/reminders': ReminderSettingsPage,
  '/settings/ai': AiSettingsPage,
  '/settings/privacy': PrivacySettingsPage,
  '/settings/about': AboutSettingsPage,
  '/profile/report-upload': ProfilePage,
};

export function AppRoutes() {
  const position = useParentOSPosition();
  const childId = useAppStore(state => state.activeChildId);
  const Page = PARENTOS_PAGES[position.id];
  return <Suspense fallback={<PageFallback />}><Page key={childId ?? 'no-child'} /></Suspense>;
}
