import { PillTabs } from '@nimiplatform/kit/ui';
import { useParentOSPosition, useParentOSNavigation } from '../../app-shell/app-navigation.js';
import { useAppStore, computeAgeMonths } from '../../app-shell/app-store.js';
import { DentalHistoryView } from './dental-history-view.js';
import { OrthodonticPage } from './orthodontic-page.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { i18nText } from '../../i18n/index.js';


type DentalTab = 'history' | 'orthodontic';



/**
 * Top-level dental page. Responsibility is shell chrome (back link, title,
 * tab nav) + delegating to one of two admitted tabs. Child switching
 * is handled by the global header next to the ParentOS logo.
 *
 *  - History: dental_records clinical timeline (includes ortho clinical events)
 *  - Orthodontics: case + appliance + daily checkin surface
 *
 * The per-tab primary action lives inline at the
 * top of each tab's content area, not in the shell header — both tabs render
 * their action button via the same right-aligned in-content row pattern.
 */
export default function DentalPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const position = useParentOSPosition(), { open } = useParentOSNavigation();
  const activeTab = position.id === '/profile/dental' ? position.tab ?? 'history' : 'history';
  const setActiveTab = (tab: DentalTab) => { void open({ id: '/profile/dental', tab }); };

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('Dental.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const ageMonths = computeAgeMonths(child.birthDate);

  return (
    <ProfileDetailShell
      title={i18nText('Dental.page.title')}
      subnav={<TabNav activeTab={activeTab} onChange={setActiveTab} />}
    >
      {activeTab === 'history' && <DentalHistoryView />}
      {activeTab === 'orthodontic' && (
        <OrthodonticPage
          childId={child.childId}
          childBirthDate={child.birthDate}
          ageMonths={ageMonths}
        />
      )}
    </ProfileDetailShell>
  );
}

/* ── Tab nav ─────────────────────────────────────────────── */

function TabNav({
  activeTab,
  onChange,
}: {
  activeTab: DentalTab;
  onChange: (tab: DentalTab) => void;
}) {
  return (
    <PillTabs
      ariaLabel={i18nText('Dental.page.tabAria')}
      size="sm"
      value={activeTab}
      onValueChange={(next) => onChange(next as DentalTab)}
      items={[
        { value: 'history', label: i18nText('Dental.page.tabs.history') },
        { value: 'orthodontic', label: i18nText('Dental.page.tabs.orthodontic') },
      ]}
    />
  );
}
