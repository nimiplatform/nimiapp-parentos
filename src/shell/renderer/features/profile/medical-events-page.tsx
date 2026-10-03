import { Button } from '@nimiplatform/kit/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, computeAgeMonths } from '../../app-shell/app-store.js';
import { getMedicalEvents } from '../../bridge/sqlite-bridge.js';
import type { MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import { AISummaryCard } from './ai-summary-card.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { MedicalEventsForm } from './medical-events-form.js';
import { MedicalEventsKpiStrip, MedicalEventsOverviewCard } from './medical-events-overview.js';
import {
  computeMedicalKpis,
  EVENT_TYPE_LABELS,
  parseLabReport,
  summarizeMedications,
  summarizeVisitReasons,
  VISIT_TYPES,
} from './medical-events-page-shared.js';
import { MedicalEventsHistorySection, type MedicalFilterTab } from './medical-events-timeline.js';
import { useMedicalEventsFormState } from './medical-events-page-form-state.js';
import { useMedicalEventsInsights } from './medical-events-page-insights.js';
import { i18nText } from '../../i18n/index.js';


/**
 * Medical records archive — laid out like the other archive pages:
 *   KPI strip → overview (reasons / medications / providers, on-demand AI
 *   insight) → date-grouped history timeline with type tabs and search.
 */
export default function MedicalEventsPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [events, setEvents] = useState<MedicalEventRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeChildId) {
      getMedicalEvents(activeChildId).then(setEvents).catch(catchLog('medical-events', 'action:load-medical-events-failed'));
    }
  }, [activeChildId]);

  const formState = useMedicalEventsFormState(child, events, setEvents);
  const insights = useMedicalEventsInsights(child, events);

  const presentTypes = useMemo<string[]>(
    () => VISIT_TYPES.filter((type) => events.some((event) => event.eventType === type)),
    [events],
  );
  // A tab disappears once its last record is edited away; fall back to "all".
  const activeFilter = presentTypes.includes(filterType) ? filterType : 'all';

  const filteredEvents = useMemo(() => {
    let result = [...events];
    if (activeFilter !== 'all') {
      result = result.filter((event) => event.eventType === activeFilter);
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((event) =>
        [
          event.title,
          event.hospital,
          event.medication,
          event.dosage,
          // Lab reports store their values as JSON; only free-text notes are searchable.
          parseLabReport(event.notes) ? null : event.notes,
        ].some((field) => field?.toLowerCase().includes(query)),
      );
    }
    return result.sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
    );
  }, [events, activeFilter, searchQuery]);

  const kpis = useMemo(() => computeMedicalKpis(events), [events]);
  const visitReasons = useMemo(() => summarizeVisitReasons(events), [events]);
  const medications = useMemo(() => summarizeMedications(events), [events]);

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('MedicalEvents.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const ageMonths = computeAgeMonths(child.birthDate);
  const filterTabs: MedicalFilterTab[] = presentTypes.length > 1
    ? [
        { key: 'all', label: i18nText('MedicalEvents.page.allTypes') },
        ...presentTypes.map((type) => ({ key: type, label: EVENT_TYPE_LABELS[type] ?? type })),
      ]
    : [];

  const showRelatedRecords = (keyword: string) => {
    setFilterType('all');
    setSearchQuery(keyword);
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <ProfileDetailShell
      title={i18nText('MedicalEvents.page.title')}
      actions={!formState.showForm ? (
        <Button tone="primary" size="md" onClick={() => formState.setShowForm(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {i18nText('MedicalEvents.page.addEvent')}
        </Button>
      ) : null}
      aiSummary={
        <AISummaryCard domain="medical" childName={child.displayName} childId={child.childId}
          ageLabel={i18nText('Common.age.yearsMonths', { years: Math.floor(ageMonths / 12), months: ageMonths % 12 })} gender={child.gender}
          dataContext={events.length > 0 ? i18nText('MedicalEvents.page.dataContext', { count: events.length }) : ''}
        />
      }
    >
      {events.length > 0 ? (
        <>
          <MedicalEventsKpiStrip kpis={kpis} />
          <MedicalEventsOverviewCard
            totalEvents={events.length}
            reasons={visitReasons}
            medications={medications}
            hospitals={insights.analysis?.frequentHospitals ?? []}
            alerts={insights.analysis?.alerts ?? []}
            aiInsight={insights.aiInsight}
            aiLoading={insights.aiLoading}
            // First request may reuse today's cached insight; later ones refresh it.
            onRequestAi={() => { void insights.generateAIInsight(insights.aiInsight !== null); }}
            onSelectKeyword={showRelatedRecords}
          />
        </>
      ) : null}

      {/* ── Add / edit form (modal) ── */}
      {formState.showForm ? (
        <MedicalEventsForm
          editingEventId={formState.editingEventId}
          formEventType={formState.formEventType}
          setFormEventType={formState.setFormEventType}
          formTitle={formState.formTitle}
          setFormTitle={formState.setFormTitle}
          formEventDate={formState.formEventDate}
          setFormEventDate={formState.setFormEventDate}
          formEndDate={formState.formEndDate}
          setFormEndDate={formState.setFormEndDate}
          formShowEndDate={formState.formShowEndDate}
          setFormShowEndDate={formState.setFormShowEndDate}
          formSeverity={formState.formSeverity}
          setFormSeverity={formState.setFormSeverity}
          formResult={formState.formResult}
          setFormResult={formState.setFormResult}
          formHospital={formState.formHospital}
          setFormHospital={formState.setFormHospital}
          formNotes={formState.formNotes}
          setFormNotes={formState.setFormNotes}
          formLabValues={formState.formLabValues}
          setFormLabValues={formState.setFormLabValues}
          formSymptomTags={formState.formSymptomTags}
          setFormSymptomTags={formState.setFormSymptomTags}
          formMeds={formState.formMeds}
          setFormMeds={formState.setFormMeds}
          historyDrugs={formState.historyDrugs}
          ocrLoading={formState.ocrLoading}
          ocrError={formState.ocrError}
          ocrImageName={formState.ocrImageName}
          ocrInputRef={formState.ocrInputRef}
          submitError={formState.submitError}
          saving={formState.saving}
          onClose={formState.closeForm}
          onSubmit={() => { void formState.submitForm(); }}
          onOCRUpload={(file) => { void formState.handleOCRUpload(file); }}
        />
      ) : null}

      <div ref={historyRef} className="scroll-mt-4">
        <MedicalEventsHistorySection
          totalCount={events.length}
          filteredEvents={filteredEvents}
          filterTabs={filterTabs}
          filterType={activeFilter}
          onFilterTypeChange={setFilterType}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          eventAiLoading={insights.eventAiLoading}
          eventAiResult={insights.eventAiResult}
          onEdit={formState.startEditing}
          onAnalyze={(event) => { void insights.analyzeEvent(event); }}
          onCloseAI={insights.closeEventAnalysis}
        />
      </div>
    </ProfileDetailShell>
  );
}
