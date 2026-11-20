import type { NimiAppRuntimeClient } from '@nimiplatform/sdk';
import type { ParentOSShellCommandExecutor } from './shell-command.js';
import type { ChildRow } from './sqlite-bridge-family.js';
import type { JournalEntryRow, JournalTagInsertRow } from './sqlite-bridge-journal.js';
import type {
  OrthodonticApplianceRow,
  OrthodonticApplianceStatus,
  OrthodonticCaseRow,
  OrthodonticCheckinRow,
  OrthodonticUnwearIntervalRow,
  OrthodonticUnwearReason,
  WritableOrthodonticCaseType,
} from './sqlite-bridge-orthodontic.js';
import type {
  OrthodonticPhotoAngle,
  OrthodonticPhotoAttachmentRow,
  OrthodonticPhotoSessionBundle,
  OrthodonticPhotoSessionRow,
} from './sqlite-bridge-orthodontic-photos.js';
import type {
  AttachmentRow,
  SaveHealthRecordCaptureInput,
  SaveHealthRecordCaptureResult,
} from './sqlite-bridge-records.js';
import type { ReminderStateRow } from './sqlite-bridge-reminders.js';
import {
  VISION_FOLLOWUP_CADENCE_MAX,
  VISION_FOLLOWUP_CADENCE_MIN,
  type VisionFollowupSettings,
} from './sqlite-bridge-vision.js';
import {
  cascadeDeleteChild,
  collectAllHydratableAssetPaths,
  collectWebAssetPathsForChild,
  computeOrthodonticDashboard,
  computeOrthodonticJourney,
  computeProfileSectionSummaries,
  createEmptyParentOSWebState,
  validateLoadedWebState,
  WEB_ASSET_PREFIX,
  type ParentOSWebState,
} from './web-storage-state.js';

const STATE_ASSET_PATH = 'parentos/db/state-v1.json';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;

type RuntimeAssetsClient = NimiAppRuntimeClient['storage']['assets'];

export interface ParentOSWebStorageScope {
  readonly assets: RuntimeAssetsClient;
  readonly signal: AbortSignal;
}

const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'application/pdf': 'pdf',
};

function sanitizeSegment(value: string, label: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]/gu, '_');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error(`Invalid ParentOS Web storage identifier for ${label}.`);
  }
  return cleaned;
}

function extensionForMime(mimeType: string, fallback = 'bin'): string {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_TO_EXT[normalized] ?? fallback;
}

function decodeBoundedBase64(base64: string, maxBytes: number, label: string): Uint8Array<ArrayBuffer> {
  const compact = base64.replace(/\s+/gu, '');
  const estimatedBytes = Math.floor((compact.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit.`);
  }
  const binary = atob(compact);
  if (binary.length > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit.`);
  }
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

async function readAssetBytes(assets: RuntimeAssetsClient, relativePath: string): Promise<{
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: string;
}> {
  const result = await assets.read({ relativePath });
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of result.body) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const buffer = new ArrayBuffer(total);
  const merged = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: merged, mediaType: result.asset.mediaType || 'application/octet-stream' };
}

function asObj(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}

function asStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNum(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asOptNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function markLinkedReminderCompleted(
  state: ParentOSWebState,
  childId: string,
  stateId: string | null,
  ruleId: string | null,
  repeatIndex: number,
  now: string,
): void {
  if (!stateId || !ruleId) return;
  const existing = state.reminderStates.find(
    (row) => row.childId === childId && row.ruleId === ruleId && row.repeatIndex === repeatIndex,
  );
  if (existing) {
    existing.status = 'completed';
    existing.completedAt = now;
    existing.updatedAt = now;
    return;
  }
  state.reminderStates.push({
    stateId,
    childId,
    ruleId,
    status: 'completed',
    activatedAt: now,
    completedAt: now,
    dismissedAt: null,
    dismissReason: null,
    repeatIndex,
    nextTriggerAt: null,
    snoozedUntil: null,
    scheduledDate: null,
    notApplicable: 0,
    plannedForDate: null,
    surfaceRank: null,
    lastSurfacedAt: null,
    surfaceCount: 0,
    notes: null,
    acknowledgedAt: null,
    reflectedAt: null,
    practiceStartedAt: null,
    practiceLastAt: null,
    practiceCount: 0,
    practiceHabituatedAt: null,
    consultedAt: null,
    consultationConversationId: null,
    createdAt: now,
    updatedAt: now,
  });
}

function upsertConsultationInState(
  state: ParentOSWebState,
  childId: string,
  ruleId: string,
  repeatIndex: number,
  conversationId: string,
  now: string,
): void {
  const row = state.reminderStates.find(
    (item) => item.childId === childId && item.ruleId === ruleId && item.repeatIndex === repeatIndex,
  );
  if (!row) {
    throw new Error(`Reminder state not found for consultation (${childId}, ${ruleId}, ${repeatIndex}).`);
  }
  if (!row.consultedAt) {
    row.consultedAt = now;
    row.consultationConversationId = conversationId;
    row.updatedAt = now;
  }
}

async function pickBrowserImageFilesAsBase64(): Promise<
  Array<{ fileName: string; mimeType: string; base64: string }>
> {
  if (typeof document === 'undefined') {
    return [];
  }
  return await new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/heic,image/heif';
    input.multiple = true;
    input.style.display = 'none';
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener('cancel', () => {
      cleanup();
      resolve([]);
    });
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      void Promise.all(
        files.map(async (file) => {
          if (file.size > MAX_IMAGE_BYTES) {
            throw new Error(`Image ${file.name} exceeds the 25 MiB limit.`);
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          return {
            fileName: file.name,
            mimeType: file.type || 'image/jpeg',
            base64: encodeBase64(bytes),
          };
        }),
      ).then(resolve, reject);
    });
    document.body.appendChild(input);
    input.click();
  });
}

function triggerBrowserDownload(filename: string, kind: string, base64Data: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('File export requires a browser document.');
  }
  const mime = kind === 'pdf'
    ? 'application/pdf'
    : kind === 'png'
      ? 'image/png'
      : kind === 'csv'
        ? 'text/csv;charset=utf-8'
        : 'application/octet-stream';
  const bytes = decodeBoundedBase64(base64Data, MAX_AUDIO_BYTES, 'export payload');
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface ParentOSWebStorageController {
  readonly executor: ParentOSShellCommandExecutor;
  readonly bindScope: (scope: ParentOSWebStorageScope | null) => void;
  readonly reset: () => void;
}

export function createParentOSWebStorageController(): ParentOSWebStorageController {
  let activeScope: ParentOSWebStorageScope | null = null;
  let connectionEpoch = 0;
  let initialized = false;
  let state: ParentOSWebState = createEmptyParentOSWebState();
  let pendingWrite: Promise<void> = Promise.resolve();
  const mediaUrlCache = new Map<string, string>();
  const pendingExportTargets = new Map<string, { filename: string; kind: string }>();
  let exportTargetSeq = 0;

  function revokeAllMediaUrls(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const objectUrl of mediaUrlCache.values()) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Best-effort cleanup.
        }
      }
    }
    mediaUrlCache.clear();
  }

  function revokeMediaUrl(assetRef: string): void {
    const existing = mediaUrlCache.get(assetRef);
    if (existing && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(existing);
      } catch {
        // Best-effort cleanup.
      }
    }
    mediaUrlCache.delete(assetRef);
  }

  function cacheMediaBlob(assetRef: string, bytes: Uint8Array<ArrayBuffer>, mediaType: string): void {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return;
    }
    revokeMediaUrl(assetRef);
    mediaUrlCache.set(assetRef, URL.createObjectURL(new Blob([bytes], { type: mediaType })));
  }

  function requireScope(): { scope: ParentOSWebStorageScope; epoch: number } {
    if (!activeScope) {
      throw Object.assign(
        new Error('ParentOS Web storage is disconnected from the primary PC Runtime.'),
        { reasonCode: 'runtime-disconnected' },
      );
    }
    activeScope.signal.throwIfAborted();
    return { scope: activeScope, epoch: connectionEpoch };
  }

  function assertEpochCurrent(scope: ParentOSWebStorageScope, epoch: number): void {
    if (epoch !== connectionEpoch || activeScope !== scope || scope.signal.aborted) {
      throw Object.assign(
        new Error('ParentOS Web connection changed before the operation completed.'),
        { reasonCode: 'runtime-scope-invalidated' },
      );
    }
  }

  function requireInitialized(): void {
    if (!initialized) {
      throw new Error('ParentOS Web storage has not been initialized yet.');
    }
  }

  async function mutate<T>(updater: (draft: ParentOSWebState) => T): Promise<T> {
    requireInitialized();
    const { scope, epoch } = requireScope();
    let result!: T;
    const job = pendingWrite.then(async () => {
      assertEpochCurrent(scope, epoch);
      const nextState = structuredClone(state);
      result = updater(nextState);
      const serialized = JSON.stringify(nextState);
      await scope.assets.write({
        relativePath: STATE_ASSET_PATH,
        body: new Blob([serialized], { type: 'application/json' }),
        mediaType: 'application/json',
        overwrite: true,
      });
      assertEpochCurrent(scope, epoch);
      state = nextState;
    });
    pendingWrite = job.catch(() => undefined);
    await job;
    return result;
  }

  async function writeMediaAsset(
    relativePath: string,
    bytes: Uint8Array<ArrayBuffer>,
    mediaType: string,
  ): Promise<string> {
    const { scope, epoch } = requireScope();
    await scope.assets.write({
      relativePath,
      body: bytes,
      mediaType,
      overwrite: true,
    });
    assertEpochCurrent(scope, epoch);
    const assetRef = `${WEB_ASSET_PREFIX}${relativePath}`;
    cacheMediaBlob(assetRef, bytes, mediaType);
    return assetRef;
  }

  async function removeMediaAsset(assetRef: string): Promise<void> {
    if (!assetRef.startsWith(WEB_ASSET_PREFIX)) {
      return;
    }
    const { scope, epoch } = requireScope();
    const relativePath = assetRef.slice(WEB_ASSET_PREFIX.length);
    await scope.assets.remove(relativePath);
    assertEpochCurrent(scope, epoch);
    revokeMediaUrl(assetRef);
  }

  async function hydrateMediaUrls(loadedState: ParentOSWebState, scope: ParentOSWebStorageScope, epoch: number): Promise<void> {
    const relativePaths = collectAllHydratableAssetPaths(loadedState);
    for (const relativePath of relativePaths) {
      if (epoch !== connectionEpoch || activeScope !== scope || scope.signal.aborted) {
        return;
      }
      const assetRef = `${WEB_ASSET_PREFIX}${relativePath}`;
      if (mediaUrlCache.has(assetRef)) {
        continue;
      }
      try {
        const { bytes, mediaType } = await readAssetBytes(scope.assets, relativePath);
        if (epoch !== connectionEpoch || activeScope !== scope || scope.signal.aborted) {
          return;
        }
        cacheMediaBlob(assetRef, bytes, mediaType);
      } catch {
        // Leave missing optional media unhydrated rather than blocking app boot.
      }
    }
  }

  async function initStorage(): Promise<void> {
    const { scope, epoch } = requireScope();
    const listing = await scope.assets.list({ prefix: 'parentos/db/', pageSize: 50 });
    assertEpochCurrent(scope, epoch);
    const hasStateFile = listing.assets.some((asset) => asset.relativePath === STATE_ASSET_PATH);
    let loaded: ParentOSWebState;
    if (hasStateFile) {
      const { bytes } = await readAssetBytes(scope.assets, STATE_ASSET_PATH);
      assertEpochCurrent(scope, epoch);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      loaded = validateLoadedWebState(JSON.parse(text) as unknown);
    } else {
      loaded = createEmptyParentOSWebState();
    }
    revokeAllMediaUrls();
    state = loaded;
    initialized = true;
    await hydrateMediaUrls(loaded, scope, epoch);
  }

  async function invoke<T = unknown>(command: string, rawPayload: unknown = {}): Promise<T> {
    const p = asObj(rawPayload);

    switch (command) {
      case 'db_init': {
        await initStorage();
        return undefined as T;
      }
      case 'set_app_setting': {
        await mutate((draft) => {
          draft.appSettings[asStr(p.key)] = asStr(p.value);
        });
        return undefined as T;
      }
      case 'get_app_setting': {
        requireInitialized();
        const key = asStr(p.key);
        return (Object.prototype.hasOwnProperty.call(state.appSettings, key)
          ? state.appSettings[key]
          : null) as T;
      }

      // ── Family & Children ────────────────────────────────────────────────
      case 'create_family': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.family = {
            familyId: asStr(p.familyId),
            displayName: asStr(p.displayName),
            createdAt: now,
            updatedAt: now,
          };
        });
        return undefined as T;
      }
      case 'get_family': {
        requireInitialized();
        return (state.family ? structuredClone(state.family) : null) as T;
      }
      case 'get_child': {
        requireInitialized();
        const child = state.children.find((row) => row.childId === asStr(p.childId)) ?? null;
        return (child ? structuredClone(child) : null) as T;
      }
      case 'create_child': {
        const now = asStr(p.now);
        const child: ChildRow = {
          childId: asStr(p.childId),
          familyId: asStr(p.familyId),
          displayName: asStr(p.displayName),
          gender: asStr(p.gender),
          birthDate: asStr(p.birthDate),
          birthWeightKg: asOptNum(p.birthWeightKg),
          birthHeightCm: asOptNum(p.birthHeightCm),
          birthHeadCircCm: asOptNum(p.birthHeadCircCm),
          avatarPath: asOptStr(p.avatarPath),
          nurtureMode: asStr(p.nurtureMode, 'balanced'),
          nurtureModeOverrides: asOptStr(p.nurtureModeOverrides),
          allergies: asOptStr(p.allergies),
          medicalNotes: asOptStr(p.medicalNotes),
          recorderProfiles: asOptStr(p.recorderProfiles),
          createdAt: now,
          updatedAt: now,
        };
        await mutate((draft) => {
          draft.children = [...draft.children.filter((row) => row.childId !== child.childId), child];
        });
        return undefined as T;
      }
      case 'get_children': {
        requireInitialized();
        const familyId = asStr(p.familyId);
        return structuredClone(
          state.children
            .filter((row) => row.familyId === familyId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        ) as T;
      }
      case 'update_child': {
        const childId = asStr(p.childId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const existing = draft.children.find((row) => row.childId === childId);
          if (!existing) throw new Error(`Child not found: ${childId}`);
          existing.displayName = asStr(p.displayName);
          existing.gender = asStr(p.gender);
          existing.birthDate = asStr(p.birthDate);
          existing.birthWeightKg = asOptNum(p.birthWeightKg);
          existing.birthHeightCm = asOptNum(p.birthHeightCm);
          existing.birthHeadCircCm = asOptNum(p.birthHeadCircCm);
          existing.avatarPath = asOptStr(p.avatarPath);
          existing.nurtureMode = asStr(p.nurtureMode, existing.nurtureMode);
          existing.nurtureModeOverrides = asOptStr(p.nurtureModeOverrides);
          existing.allergies = asOptStr(p.allergies);
          existing.medicalNotes = asOptStr(p.medicalNotes);
          existing.recorderProfiles = asOptStr(p.recorderProfiles);
          existing.updatedAt = now;
        });
        return undefined as T;
      }
      case 'delete_child': {
        const childId = asStr(p.childId);
        const assetPaths = collectWebAssetPathsForChild(state, childId);
        await mutate((draft) => {
          cascadeDeleteChild(draft, childId);
        });
        const { scope } = requireScope();
        for (const relativePath of assetPaths) {
          revokeMediaUrl(`${WEB_ASSET_PREFIX}${relativePath}`);
          await scope.assets.remove(relativePath).catch(() => undefined);
        }
        return undefined as T;
      }

      // ── Measurements & Milestones & Vaccines & Posture & Reports ─────────
      case 'insert_measurement': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.measurements.push({
            measurementId: asStr(p.measurementId),
            childId: asStr(p.childId),
            typeId: asStr(p.typeId),
            value: asNum(p.value),
            measuredAt: asStr(p.measuredAt),
            ageMonths: asNum(p.ageMonths),
            percentile: asOptNum(p.percentile),
            source: asOptStr(p.source),
            notes: asOptStr(p.notes),
            createdAt: now,
          });
          markLinkedReminderCompleted(
            draft,
            asStr(p.childId),
            asOptStr(p.linkedReminderStateId),
            asOptStr(p.linkedReminderRuleId),
            0,
            now,
          );
        });
        return undefined as T;
      }
      case 'get_measurements': {
        requireInitialized();
        const childId = asStr(p.childId);
        const typeId = asOptStr(p.typeId);
        return structuredClone(
          state.measurements
            .filter((row) => row.childId === childId && (!typeId || row.typeId === typeId))
            .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)),
        ) as T;
      }
      case 'update_measurement': {
        const measurementId = asStr(p.measurementId);
        await mutate((draft) => {
          const row = draft.measurements.find((item) => item.measurementId === measurementId);
          if (!row) throw new Error(`Measurement not found: ${measurementId}`);
          row.value = asNum(p.value);
          row.measuredAt = asStr(p.measuredAt);
          row.ageMonths = asNum(p.ageMonths);
          row.percentile = asOptNum(p.percentile);
          row.source = asOptStr(p.source);
          row.notes = asOptStr(p.notes);
        });
        return undefined as T;
      }
      case 'delete_measurement': {
        const measurementId = asStr(p.measurementId);
        await mutate((draft) => {
          draft.measurements = draft.measurements.filter((item) => item.measurementId !== measurementId);
        });
        return undefined as T;
      }
      case 'upsert_milestone_record': {
        const now = asStr(p.now);
        await mutate((draft) => {
          const childId = asStr(p.childId);
          const milestoneId = asStr(p.milestoneId);
          const existing = draft.milestoneRecords.find(
            (row) => row.childId === childId && row.milestoneId === milestoneId,
          );
          if (existing) {
            existing.achievedAt = asOptStr(p.achievedAt);
            existing.ageMonthsWhenAchieved = asOptNum(p.ageMonthsWhenAchieved);
            existing.notes = asOptStr(p.notes);
            existing.photoPath = asOptStr(p.photoPath);
            existing.updatedAt = now;
          } else {
            draft.milestoneRecords.push({
              recordId: asStr(p.recordId),
              childId,
              milestoneId,
              achievedAt: asOptStr(p.achievedAt),
              ageMonthsWhenAchieved: asOptNum(p.ageMonthsWhenAchieved),
              notes: asOptStr(p.notes),
              photoPath: asOptStr(p.photoPath),
              createdAt: now,
              updatedAt: now,
            });
          }
        });
        return undefined as T;
      }
      case 'get_milestone_records': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(state.milestoneRecords.filter((row) => row.childId === childId)) as T;
      }
      case 'delete_milestone_record': {
        const recordId = asStr(p.recordId);
        await mutate((draft) => {
          draft.milestoneRecords = draft.milestoneRecords.filter((row) => row.recordId !== recordId);
        });
        return undefined as T;
      }

      // ── Reminders & Custom Todos ─────────────────────────────────────────
      case 'upsert_reminder_state': {
        const now = asStr(p.now);
        await mutate((draft) => {
          const childId = asStr(p.childId);
          const ruleId = asStr(p.ruleId);
          const repeatIndex = asNum(p.repeatIndex);
          const existing = draft.reminderStates.find(
            (row) => row.childId === childId && row.ruleId === ruleId && row.repeatIndex === repeatIndex,
          );
          const nextRow: ReminderStateRow = {
            stateId: existing?.stateId ?? asStr(p.stateId),
            childId,
            ruleId,
            status: asStr(p.status),
            activatedAt: asOptStr(p.activatedAt),
            completedAt: asOptStr(p.completedAt),
            dismissedAt: asOptStr(p.dismissedAt),
            dismissReason: asOptStr(p.dismissReason),
            repeatIndex,
            nextTriggerAt: asOptStr(p.nextTriggerAt),
            snoozedUntil: asOptStr(p.snoozedUntil),
            scheduledDate: asOptStr(p.scheduledDate),
            notApplicable: asNum(p.notApplicable, 0),
            plannedForDate: asOptStr(p.plannedForDate),
            surfaceRank: asOptNum(p.surfaceRank),
            lastSurfacedAt: asOptStr(p.lastSurfacedAt),
            surfaceCount: asNum(p.surfaceCount, 0),
            notes: asOptStr(p.notes),
            acknowledgedAt: asOptStr(p.acknowledgedAt),
            reflectedAt: asOptStr(p.reflectedAt),
            practiceStartedAt: asOptStr(p.practiceStartedAt),
            practiceLastAt: asOptStr(p.practiceLastAt),
            practiceCount: asNum(p.practiceCount, 0),
            practiceHabituatedAt: asOptStr(p.practiceHabituatedAt),
            consultedAt: asOptStr(p.consultedAt),
            consultationConversationId: asOptStr(p.consultationConversationId),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          };
          draft.reminderStates = [
            ...draft.reminderStates.filter(
              (row) => !(row.childId === childId && row.ruleId === ruleId && row.repeatIndex === repeatIndex),
            ),
            nextRow,
          ];
        });
        return undefined as T;
      }
      case 'get_reminder_states': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(state.reminderStates.filter((row) => row.childId === childId)) as T;
      }
      case 'get_active_reminders': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.reminderStates.filter(
            (row) => row.childId === childId && (row.status === 'active' || row.status === 'pending'),
          ),
        ) as T;
      }
      case 'upsert_reminder_consultation': {
        await mutate((draft) => {
          upsertConsultationInState(
            draft,
            asStr(p.childId),
            asStr(p.ruleId),
            asNum(p.repeatIndex),
            asStr(p.conversationId),
            asStr(p.now),
          );
        });
        return undefined as T;
      }
      case 'clear_reminder_consultation': {
        const childId = asStr(p.childId);
        const conversationId = asStr(p.conversationId);
        const now = asStr(p.now);
        await mutate((draft) => {
          for (const row of draft.reminderStates) {
            if (row.childId === childId && row.consultationConversationId === conversationId) {
              row.consultedAt = null;
              row.consultationConversationId = null;
              row.updatedAt = now;
            }
          }
        });
        return undefined as T;
      }
      case 'insert_custom_todo': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.customTodos.push({
            todoId: asStr(p.todoId),
            childId: asStr(p.childId),
            title: asStr(p.title),
            dueDate: asOptStr(p.dueDate),
            completedAt: null,
            createdAt: now,
            updatedAt: now,
            recurrenceRule: asOptStr(p.recurrenceRule),
            reminderOffsetMinutes: asOptNum(p.reminderOffsetMinutes),
          });
        });
        return undefined as T;
      }
      case 'update_custom_todo': {
        const todoId = asStr(p.todoId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.customTodos.find((item) => item.todoId === todoId);
          if (!row) throw new Error(`Todo not found: ${todoId}`);
          row.title = asStr(p.title);
          row.dueDate = asOptStr(p.dueDate);
          row.recurrenceRule = asOptStr(p.recurrenceRule);
          row.reminderOffsetMinutes = asOptNum(p.reminderOffsetMinutes);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'complete_custom_todo': {
        const todoId = asStr(p.todoId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.customTodos.find((item) => item.todoId === todoId);
          if (row) {
            row.completedAt = now;
            row.updatedAt = now;
          }
        });
        return undefined as T;
      }
      case 'advance_custom_todo_due_date': {
        const todoId = asStr(p.todoId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.customTodos.find((item) => item.todoId === todoId);
          if (row) {
            row.completedAt = null;
            row.dueDate = asOptStr(p.nextDueDate);
            row.updatedAt = now;
          }
        });
        return undefined as T;
      }
      case 'uncomplete_custom_todo': {
        const todoId = asStr(p.todoId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.customTodos.find((item) => item.todoId === todoId);
          if (row) {
            row.completedAt = null;
            row.updatedAt = now;
          }
        });
        return undefined as T;
      }
      case 'delete_custom_todo': {
        const todoId = asStr(p.todoId);
        await mutate((draft) => {
          draft.customTodos = draft.customTodos.filter((item) => item.todoId !== todoId);
        });
        return undefined as T;
      }
      case 'get_custom_todos': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.customTodos
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        ) as T;
      }

      // ── Vaccines ─────────────────────────────────────────────────────────
      case 'insert_vaccine_record': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.vaccineRecords.push({
            recordId: asStr(p.recordId),
            childId: asStr(p.childId),
            ruleId: asStr(p.ruleId),
            vaccineName: asStr(p.vaccineName),
            vaccinatedAt: asStr(p.vaccinatedAt),
            ageMonths: asNum(p.ageMonths),
            batchNumber: asOptStr(p.batchNumber),
            hospital: asOptStr(p.hospital),
            adverseReaction: asOptStr(p.adverseReaction),
            photoPath: asOptStr(p.photoPath),
            createdAt: now,
          });
          markLinkedReminderCompleted(
            draft,
            asStr(p.childId),
            asOptStr(p.reminderStateId),
            asOptStr(p.ruleId),
            0,
            now,
          );
        });
        return undefined as T;
      }
      case 'update_vaccine_record': {
        const recordId = asStr(p.recordId);
        await mutate((draft) => {
          const row = draft.vaccineRecords.find((item) => item.recordId === recordId);
          if (!row) throw new Error(`Vaccine record not found: ${recordId}`);
          row.vaccinatedAt = asStr(p.vaccinatedAt);
          row.ageMonths = asNum(p.ageMonths);
          row.batchNumber = asOptStr(p.batchNumber);
          row.hospital = asOptStr(p.hospital);
          row.adverseReaction = asOptStr(p.adverseReaction);
        });
        return undefined as T;
      }
      case 'delete_vaccine_record': {
        const recordId = asStr(p.recordId);
        await mutate((draft) => {
          draft.vaccineRecords = draft.vaccineRecords.filter((item) => item.recordId !== recordId);
        });
        return undefined as T;
      }
      case 'get_vaccine_records': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.vaccineRecords
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.vaccinatedAt.localeCompare(a.vaccinatedAt)),
        ) as T;
      }

      // ── Journal & Tags ───────────────────────────────────────────────────
      case 'insert_journal_entry':
      case 'insert_journal_entry_with_tags': {
        const now = asStr(p.now);
        const entryId = asStr(p.entryId);
        const aiTags = Array.isArray(p.aiTags) ? (p.aiTags as JournalTagInsertRow[]) : [];
        const entry: JournalEntryRow = {
          entryId,
          childId: asStr(p.childId),
          contentType: asStr(p.contentType),
          textContent: asOptStr(p.textContent),
          voicePath: asOptStr(p.voicePath),
          photoPaths: asOptStr(p.photoPaths),
          recordedAt: asStr(p.recordedAt),
          ageMonths: asNum(p.ageMonths),
          observationMode: asOptStr(p.observationMode),
          dimensionId: asOptStr(p.dimensionId),
          selectedTags: asOptStr(p.selectedTags),
          guidedAnswers: asOptStr(p.guidedAnswers),
          observationDuration: asOptNum(p.observationDuration),
          keepsake: asNum(p.keepsake, 0),
          keepsakeTitle: asOptStr(p.keepsakeTitle),
          keepsakeReason: asOptStr(p.keepsakeReason) as JournalEntryRow['keepsakeReason'],
          moodTag: asOptStr(p.moodTag),
          recorderId: asOptStr(p.recorderId),
          createdAt: now,
          updatedAt: now,
        };
        await mutate((draft) => {
          draft.journalEntries = [...draft.journalEntries.filter((row) => row.entryId !== entryId), entry];
          if (command === 'insert_journal_entry_with_tags') {
            draft.journalTags = [
              ...draft.journalTags.filter((tag) => tag.entryId !== entryId),
              ...aiTags.map((tag) => ({
                tagId: tag.tagId,
                entryId,
                domain: tag.domain,
                tag: tag.tag,
                source: tag.source,
                confidence: tag.confidence,
                createdAt: now,
              })),
            ];
          }
        });
        return undefined as T;
      }
      case 'update_journal_entry_with_tags': {
        const now = asStr(p.now);
        const entryId = asStr(p.entryId);
        const aiTags = Array.isArray(p.aiTags) ? (p.aiTags as JournalTagInsertRow[]) : [];
        await mutate((draft) => {
          const existing = draft.journalEntries.find((row) => row.entryId === entryId);
          if (!existing) throw new Error(`Journal entry not found: ${entryId}`);
          existing.contentType = asStr(p.contentType);
          existing.textContent = asOptStr(p.textContent);
          existing.voicePath = asOptStr(p.voicePath);
          existing.photoPaths = asOptStr(p.photoPaths);
          existing.recordedAt = asStr(p.recordedAt);
          existing.ageMonths = asNum(p.ageMonths);
          existing.observationMode = asOptStr(p.observationMode);
          existing.dimensionId = asOptStr(p.dimensionId);
          existing.selectedTags = asOptStr(p.selectedTags);
          existing.guidedAnswers = asOptStr(p.guidedAnswers);
          existing.observationDuration = asOptNum(p.observationDuration);
          existing.keepsake = asNum(p.keepsake, existing.keepsake);
          existing.keepsakeTitle = asOptStr(p.keepsakeTitle);
          existing.keepsakeReason = asOptStr(p.keepsakeReason) as JournalEntryRow['keepsakeReason'];
          existing.moodTag = asOptStr(p.moodTag);
          existing.recorderId = asOptStr(p.recorderId);
          existing.updatedAt = now;
          draft.journalTags = [
            ...draft.journalTags.filter((tag) => tag.entryId !== entryId),
            ...aiTags.map((tag) => ({
              tagId: tag.tagId,
              entryId,
              domain: tag.domain,
              tag: tag.tag,
              source: tag.source,
              confidence: tag.confidence,
              createdAt: now,
            })),
          ];
        });
        return undefined as T;
      }
      case 'update_journal_keepsake': {
        const entryId = asStr(p.entryId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.journalEntries.find((item) => item.entryId === entryId);
          if (row) {
            row.keepsake = asNum(p.keepsake, 0);
            row.keepsakeTitle = asOptStr(p.keepsakeTitle);
            row.keepsakeReason = asOptStr(p.keepsakeReason) as JournalEntryRow['keepsakeReason'];
            row.updatedAt = now;
          }
        });
        return undefined as T;
      }
      case 'delete_journal_entry': {
        const entryId = asStr(p.entryId);
        await mutate((draft) => {
          draft.journalEntries = draft.journalEntries.filter((item) => item.entryId !== entryId);
          draft.journalTags = draft.journalTags.filter((tag) => tag.entryId !== entryId);
        });
        return undefined as T;
      }
      case 'get_journal_entries': {
        requireInitialized();
        const childId = asStr(p.childId);
        const limit = asOptNum(p.limit);
        const entries = state.journalEntries
          .filter((row) => row.childId === childId)
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.createdAt.localeCompare(a.createdAt));
        return structuredClone(limit !== null ? entries.slice(0, limit) : entries) as T;
      }
      case 'insert_journal_tag': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.journalTags.push({
            tagId: asStr(p.tagId),
            entryId: asStr(p.entryId),
            domain: asStr(p.domain),
            tag: asStr(p.tag),
            source: asStr(p.source),
            confidence: asOptNum(p.confidence),
            createdAt: now,
          });
        });
        return undefined as T;
      }
      case 'get_journal_tags': {
        requireInitialized();
        const entryId = asStr(p.entryId);
        return structuredClone(state.journalTags.filter((tag) => tag.entryId === entryId)) as T;
      }

      // ── AI Conversations & Growth Reports ────────────────────────────────
      case 'create_conversation': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.conversations.push({
            conversationId: asStr(p.conversationId),
            childId: asStr(p.childId),
            title: asOptStr(p.title),
            startedAt: now,
            lastMessageAt: now,
            messageCount: 0,
            createdAt: now,
          });
        });
        return undefined as T;
      }
      case 'get_conversations': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.conversations
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
        ) as T;
      }
      case 'insert_ai_message': {
        const now = asStr(p.now);
        const conversationId = asStr(p.conversationId);
        await mutate((draft) => {
          draft.aiMessages.push({
            messageId: asStr(p.messageId),
            conversationId,
            role: asStr(p.role),
            content: asStr(p.content),
            contextSnapshot: asOptStr(p.contextSnapshot),
            createdAt: now,
          });
          const conv = draft.conversations.find((item) => item.conversationId === conversationId);
          if (conv) {
            conv.messageCount += 1;
            conv.lastMessageAt = now;
          }
        });
        return undefined as T;
      }
      case 'insert_consultation_ai_message': {
        const now = asStr(p.now);
        const conversationId = asStr(p.conversationId);
        await mutate((draft) => {
          draft.aiMessages.push({
            messageId: asStr(p.messageId),
            conversationId,
            role: 'assistant',
            content: asStr(p.content),
            contextSnapshot: asOptStr(p.contextSnapshot),
            createdAt: now,
          });
          const conv = draft.conversations.find((item) => item.conversationId === conversationId);
          if (conv) {
            conv.messageCount += 1;
            conv.lastMessageAt = now;
          }
          upsertConsultationInState(
            draft,
            asStr(p.childId),
            asStr(p.ruleId),
            asNum(p.repeatIndex),
            conversationId,
            now,
          );
        });
        return undefined as T;
      }
      case 'get_ai_messages': {
        requireInitialized();
        const conversationId = asStr(p.conversationId);
        return structuredClone(
          state.aiMessages
            .filter((row) => row.conversationId === conversationId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        ) as T;
      }
      case 'insert_growth_report': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.growthReports.push({
            reportId: asStr(p.reportId),
            childId: asStr(p.childId),
            reportType: asStr(p.reportType),
            periodStart: asStr(p.periodStart),
            periodEnd: asStr(p.periodEnd),
            ageMonthsStart: asNum(p.ageMonthsStart),
            ageMonthsEnd: asNum(p.ageMonthsEnd),
            content: asStr(p.content),
            generatedAt: asStr(p.generatedAt),
            createdAt: now,
          });
        });
        return undefined as T;
      }
      case 'get_growth_reports': {
        requireInitialized();
        const childId = asStr(p.childId);
        const reportType = asOptStr(p.reportType);
        return structuredClone(
          state.growthReports
            .filter((row) => row.childId === childId && (!reportType || row.reportType === reportType))
            .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
        ) as T;
      }
      case 'update_growth_report_content': {
        const reportId = asStr(p.reportId);
        await mutate((draft) => {
          const row = draft.growthReports.find((item) => item.reportId === reportId);
          if (row) {
            row.content = asStr(p.content);
          }
        });
        return undefined as T;
      }

      // ── Dental, Attachments, Allergy, Sleep, Medical, Tanner, Fitness, Outdoor, Posture ──
      case 'insert_dental_record':
      case 'insert_ortho_clinical_dental_record': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.dentalRecords.push({
            recordId: asStr(p.recordId),
            childId: asStr(p.childId),
            eventType: asStr(p.eventType),
            toothId: asOptStr(p.toothId),
            toothSet: asOptStr(p.toothSet),
            eventDate: asStr(p.eventDate),
            ageMonths: asNum(p.ageMonths),
            severity: asOptStr(p.severity),
            hospital: asOptStr(p.hospital),
            notes: asOptStr(p.notes),
            photoPath: asOptStr(p.photoPath),
            createdAt: now,
          });
        });
        return undefined as T;
      }
      case 'update_dental_record': {
        const recordId = asStr(p.recordId);
        await mutate((draft) => {
          const row = draft.dentalRecords.find((item) => item.recordId === recordId);
          if (!row) throw new Error(`Dental record not found: ${recordId}`);
          row.eventType = asStr(p.eventType);
          row.toothId = asOptStr(p.toothId);
          row.toothSet = asOptStr(p.toothSet);
          row.eventDate = asStr(p.eventDate);
          row.ageMonths = asNum(p.ageMonths);
          row.severity = asOptStr(p.severity);
          row.hospital = asOptStr(p.hospital);
          row.notes = asOptStr(p.notes);
          row.photoPath = asOptStr(p.photoPath);
        });
        return undefined as T;
      }
      case 'delete_dental_record': {
        const recordId = asStr(p.recordId);
        await mutate((draft) => {
          draft.dentalRecords = draft.dentalRecords.filter((item) => item.recordId !== recordId);
        });
        return undefined as T;
      }
      case 'get_dental_records': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.dentalRecords
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
        ) as T;
      }
      case 'save_attachment': {
        const ownerTable = asStr(p.ownerTable);
        if (ownerTable === 'orthodontic_photo_sessions') {
          throw new Error('orthodontic_photo_sessions must use attach_orthodontic_photo');
        }
        const attachmentId = sanitizeSegment(asStr(p.attachmentId), 'attachmentId');
        const childId = sanitizeSegment(asStr(p.childId), 'childId');
        const mimeType = asStr(p.mimeType, 'application/octet-stream');
        const bytes = decodeBoundedBase64(asStr(p.imageBase64), MAX_IMAGE_BYTES, 'attachment');
        const ext = extensionForMime(mimeType, 'bin');
        const relativePath = `parentos/media/attachments/${childId}/${attachmentId}.${ext}`;
        const filePath = await writeMediaAsset(relativePath, bytes, mimeType);
        const row: AttachmentRow = {
          attachmentId: asStr(p.attachmentId),
          childId: asStr(p.childId),
          ownerTable,
          ownerId: asStr(p.ownerId),
          filePath,
          fileName: asStr(p.fileName),
          mimeType,
          caption: asOptStr(p.caption),
          createdAt: asStr(p.now),
        };
        await mutate((draft) => {
          draft.attachments.push(row);
        });
        return structuredClone(row) as T;
      }
      case 'get_attachments': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(state.attachments.filter((row) => row.childId === childId)) as T;
      }
      case 'get_attachments_by_owner': {
        requireInitialized();
        const childId = asStr(p.childId);
        const ownerTable = asStr(p.ownerTable);
        const ownerId = asStr(p.ownerId);
        return structuredClone(
          state.attachments.filter(
            (row) => row.childId === childId && row.ownerTable === ownerTable && row.ownerId === ownerId,
          ),
        ) as T;
      }
      case 'delete_attachment': {
        const attachmentId = asStr(p.attachmentId);
        const existing = state.attachments.find((row) => row.attachmentId === attachmentId);
        if (existing?.ownerTable === 'orthodontic_photo_sessions') {
          throw new Error('orthodontic_photo_sessions must use delete_orthodontic_photo_attachment');
        }
        await mutate((draft) => {
          draft.attachments = draft.attachments.filter((row) => row.attachmentId !== attachmentId);
        });
        if (existing) {
          await removeMediaAsset(existing.filePath).catch(() => undefined);
        }
        return undefined as T;
      }
      case 'insert_allergy_record': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.allergyRecords.push({
            recordId: asStr(p.recordId),
            childId: asStr(p.childId),
            allergen: asStr(p.allergen),
            category: asStr(p.category),
            reactionType: asOptStr(p.reactionType),
            severity: asStr(p.severity),
            diagnosedAt: asOptStr(p.diagnosedAt),
            ageMonthsAtDiagnosis: asOptNum(p.ageMonthsAtDiagnosis),
            status: asStr(p.status),
            statusChangedAt: asOptStr(p.statusChangedAt),
            confirmedBy: asOptStr(p.confirmedBy),
            notes: asOptStr(p.notes),
            createdAt: now,
            updatedAt: now,
          });
        });
        return undefined as T;
      }
      case 'update_allergy_record': {
        const recordId = asStr(p.recordId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.allergyRecords.find((item) => item.recordId === recordId);
          if (!row) throw new Error(`Allergy record not found: ${recordId}`);
          row.allergen = asStr(p.allergen);
          row.category = asStr(p.category);
          row.reactionType = asOptStr(p.reactionType);
          row.severity = asStr(p.severity);
          row.status = asStr(p.status);
          row.statusChangedAt = asOptStr(p.statusChangedAt);
          row.confirmedBy = asOptStr(p.confirmedBy);
          row.notes = asOptStr(p.notes);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'get_allergy_records': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(state.allergyRecords.filter((row) => row.childId === childId)) as T;
      }
      case 'upsert_sleep_record': {
        const now = asStr(p.now);
        await mutate((draft) => {
          const childId = asStr(p.childId);
          const sleepDate = asStr(p.sleepDate);
          const existing = draft.sleepRecords.find(
            (row) => row.childId === childId && row.sleepDate === sleepDate,
          );
          if (existing) {
            existing.bedtime = asOptStr(p.bedtime);
            existing.wakeTime = asOptStr(p.wakeTime);
            existing.durationMinutes = asOptNum(p.durationMinutes);
            existing.napCount = asOptNum(p.napCount);
            existing.napMinutes = asOptNum(p.napMinutes);
            existing.quality = asOptStr(p.quality);
            existing.ageMonths = asNum(p.ageMonths);
            existing.notes = asOptStr(p.notes);
          } else {
            draft.sleepRecords.push({
              recordId: asStr(p.recordId),
              childId,
              sleepDate,
              bedtime: asOptStr(p.bedtime),
              wakeTime: asOptStr(p.wakeTime),
              durationMinutes: asOptNum(p.durationMinutes),
              napCount: asOptNum(p.napCount),
              napMinutes: asOptNum(p.napMinutes),
              quality: asOptStr(p.quality),
              ageMonths: asNum(p.ageMonths),
              notes: asOptStr(p.notes),
              createdAt: now,
            });
          }
        });
        return undefined as T;
      }
      case 'delete_sleep_record': {
        const recordId = asStr(p.recordId);
        await mutate((draft) => {
          draft.sleepRecords = draft.sleepRecords.filter((row) => row.recordId !== recordId);
        });
        return undefined as T;
      }
      case 'get_sleep_records': {
        requireInitialized();
        const childId = asStr(p.childId);
        const limit = asOptNum(p.limit);
        const rows = state.sleepRecords
          .filter((row) => row.childId === childId)
          .sort((a, b) => b.sleepDate.localeCompare(a.sleepDate));
        return structuredClone(limit !== null ? rows.slice(0, limit) : rows) as T;
      }
      case 'insert_medical_event': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.medicalEvents.push({
            eventId: asStr(p.eventId),
            childId: asStr(p.childId),
            eventType: asStr(p.eventType),
            title: asStr(p.title),
            eventDate: asStr(p.eventDate),
            endDate: asOptStr(p.endDate),
            ageMonths: asNum(p.ageMonths),
            severity: asOptStr(p.severity),
            result: asOptStr(p.result),
            hospital: asOptStr(p.hospital),
            medication: asOptStr(p.medication),
            dosage: asOptStr(p.dosage),
            notes: asOptStr(p.notes),
            photoPath: asOptStr(p.photoPath),
            createdAt: now,
            updatedAt: now,
          });
        });
        return undefined as T;
      }
      case 'update_medical_event': {
        const eventId = asStr(p.eventId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.medicalEvents.find((item) => item.eventId === eventId);
          if (!row) throw new Error(`Medical event not found: ${eventId}`);
          row.title = asStr(p.title);
          row.eventDate = asStr(p.eventDate);
          row.endDate = asOptStr(p.endDate);
          row.severity = asOptStr(p.severity);
          row.result = asOptStr(p.result);
          row.hospital = asOptStr(p.hospital);
          row.medication = asOptStr(p.medication);
          row.dosage = asOptStr(p.dosage);
          row.notes = asOptStr(p.notes);
          row.photoPath = asOptStr(p.photoPath);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'get_medical_events': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.medicalEvents
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
        ) as T;
      }
      case 'insert_tanner_assessment': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.tannerAssessments.push({
            assessmentId: asStr(p.assessmentId),
            childId: asStr(p.childId),
            assessedAt: asStr(p.assessedAt),
            ageMonths: asNum(p.ageMonths),
            breastOrGenitalStage: asOptNum(p.breastOrGenitalStage),
            pubicHairStage: asOptNum(p.pubicHairStage),
            menarcheStatus: asOptStr(p.menarcheStatus),
            menarcheDate: asOptStr(p.menarcheDate),
            assessedBy: asOptStr(p.assessedBy),
            notes: asOptStr(p.notes),
            createdAt: now,
          });
          markLinkedReminderCompleted(
            draft,
            asStr(p.childId),
            asOptStr(p.linkedReminderStateId),
            asOptStr(p.linkedReminderRuleId),
            0,
            now,
          );
        });
        return undefined as T;
      }
      case 'get_tanner_assessments': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.tannerAssessments
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)),
        ) as T;
      }
      case 'delete_tanner_assessment': {
        const assessmentId = asStr(p.assessmentId);
        await mutate((draft) => {
          draft.tannerAssessments = draft.tannerAssessments.filter((row) => row.assessmentId !== assessmentId);
        });
        return undefined as T;
      }
      case 'insert_fitness_assessment': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.fitnessAssessments.push({
            assessmentId: asStr(p.assessmentId),
            childId: asStr(p.childId),
            assessedAt: asStr(p.assessedAt),
            ageMonths: asNum(p.ageMonths),
            assessmentSource: asOptStr(p.assessmentSource),
            run50m: asOptNum(p.run50m),
            run800m: asOptNum(p.run800m),
            run1000m: asOptNum(p.run1000m),
            run50x8: asOptNum(p.run50x8),
            sitAndReach: asOptNum(p.sitAndReach),
            standingLongJump: asOptNum(p.standingLongJump),
            sitUps: asOptNum(p.sitUps),
            pullUps: asOptNum(p.pullUps),
            ropeSkipping: asOptNum(p.ropeSkipping),
            vitalCapacity: asOptNum(p.vitalCapacity),
            run10mShuttle: asOptNum(p.run10mShuttle),
            tennisBallThrow: asOptNum(p.tennisBallThrow),
            doubleFootJump: asOptNum(p.doubleFootJump),
            balanceBeam: asOptNum(p.balanceBeam),
            footArchStatus: asOptStr(p.footArchStatus),
            notes: asOptStr(p.notes),
            createdAt: now,
          });
          markLinkedReminderCompleted(
            draft,
            asStr(p.childId),
            asOptStr(p.linkedReminderStateId),
            asOptStr(p.linkedReminderRuleId),
            0,
            now,
          );
        });
        return undefined as T;
      }
      case 'get_fitness_assessments': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.fitnessAssessments
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)),
        ) as T;
      }
      case 'delete_fitness_assessment': {
        const assessmentId = asStr(p.assessmentId);
        await mutate((draft) => {
          draft.fitnessAssessments = draft.fitnessAssessments.filter((row) => row.assessmentId !== assessmentId);
        });
        return undefined as T;
      }
      case 'delete_fitness_event': {
        const eventId = asStr(p.eventId);
        await mutate((draft) => {
          draft.healthRecordEvents = draft.healthRecordEvents.filter((row) => row.eventId !== eventId);
          draft.healthRecordValues = draft.healthRecordValues.filter((row) => row.eventId !== eventId);
        });
        return undefined as T;
      }
      case 'insert_outdoor_record': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.outdoorRecords.push({
            recordId: asStr(p.recordId),
            childId: asStr(p.childId),
            activityDate: asStr(p.activityDate),
            durationMinutes: asNum(p.durationMinutes),
            note: asOptStr(p.note),
            createdAt: now,
            updatedAt: now,
          });
          markLinkedReminderCompleted(
            draft,
            asStr(p.childId),
            asOptStr(p.linkedReminderStateId),
            asOptStr(p.linkedReminderRuleId),
            0,
            now,
          );
        });
        return undefined as T;
      }
      case 'update_outdoor_record': {
        const recordId = asStr(p.recordId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.outdoorRecords.find((item) => item.recordId === recordId);
          if (!row) throw new Error(`Outdoor record not found: ${recordId}`);
          if (typeof p.activityDate === 'string') row.activityDate = p.activityDate;
          if (typeof p.durationMinutes === 'number') row.durationMinutes = p.durationMinutes;
          row.note = asOptStr(p.note);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'delete_outdoor_record': {
        const recordId = asStr(p.recordId);
        await mutate((draft) => {
          draft.outdoorRecords = draft.outdoorRecords.filter((row) => row.recordId !== recordId);
        });
        return undefined as T;
      }
      case 'get_outdoor_records': {
        requireInitialized();
        const childId = asStr(p.childId);
        const startDate = asOptStr(p.startDate);
        const endDate = asOptStr(p.endDate);
        return structuredClone(
          state.outdoorRecords
            .filter(
              (row) =>
                row.childId === childId
                && (!startDate || row.activityDate >= startDate)
                && (!endDate || row.activityDate <= endDate),
            )
            .sort((a, b) => b.activityDate.localeCompare(a.activityDate)),
        ) as T;
      }
      case 'get_outdoor_goal': {
        requireInitialized();
        const childId = asStr(p.childId);
        return (state.outdoorGoals[childId] ?? null) as T;
      }
      case 'set_outdoor_goal': {
        const childId = asStr(p.childId);
        const goalMinutes = asNum(p.goalMinutes);
        await mutate((draft) => {
          draft.outdoorGoals[childId] = goalMinutes;
        });
        return undefined as T;
      }
      case 'insert_posture_assessment': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.postureAssessments.push({
            assessmentId: asStr(p.assessmentId),
            childId: asStr(p.childId),
            assessedAt: asStr(p.assessedAt),
            ageMonths: asNum(p.ageMonths),
            source: asOptStr(p.source),
            shoulder: asOptStr(p.shoulder),
            scapula: asOptStr(p.scapula),
            hip: asOptStr(p.hip),
            leg: asOptStr(p.leg),
            heel: asOptStr(p.heel),
            neck: asOptStr(p.neck),
            pelvis: asOptStr(p.pelvis),
            knee: asOptStr(p.knee),
            adam: asOptStr(p.adam),
            cobbAngle: asOptNum(p.cobbAngle),
            notes: asOptStr(p.notes),
            photoPaths: asOptStr(p.photoPaths),
            createdAt: now,
            updatedAt: now,
          });
          markLinkedReminderCompleted(
            draft,
            asStr(p.childId),
            asOptStr(p.linkedReminderStateId),
            asOptStr(p.linkedReminderRuleId),
            asNum(p.linkedReminderRepeatIndex, 0),
            now,
          );
        });
        return undefined as T;
      }
      case 'get_posture_assessments': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.postureAssessments
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)),
        ) as T;
      }

      // ── Health Records ───────────────────────────────────────────────────
      case 'save_health_record_capture':
      case 'replace_health_record_capture': {
        const input = p.input as SaveHealthRecordCaptureInput;
        const replaceEventId = command === 'replace_health_record_capture' ? asStr(p.replaceEventId) : null;
        const result: SaveHealthRecordCaptureResult = await mutate((draft) => {
          if (replaceEventId) {
            draft.healthRecordEvents = draft.healthRecordEvents.filter((row) => row.eventId !== replaceEventId);
            draft.healthRecordValues = draft.healthRecordValues.filter((row) => row.eventId !== replaceEventId);
          }
          draft.healthRecordEvents.push({
            eventId: input.eventId,
            childId: input.childId,
            protocolId: input.protocolId,
            groupId: input.groupId,
            recordKind: input.recordKind,
            sourceSurface: input.sourceSurface,
            recordedAt: input.recordedAt,
            effectiveDate: input.effectiveDate,
            ageMonths: input.ageMonths,
            recorderId: input.recorderId,
            linkedReminderStateId: input.linkedReminderStateId,
            linkedReminderRuleId: input.linkedReminderRuleId,
            notes: input.notes,
            metadataJson: input.metadataJson,
            createdAt: input.now,
            updatedAt: input.now,
          });
          const valueIds: string[] = [];
          for (const value of input.values) {
            valueIds.push(value.valueId);
            draft.healthRecordValues.push({
              valueId: value.valueId,
              eventId: input.eventId,
              childId: input.childId,
              metricId: value.metricId,
              valueNumber: value.valueNumber,
              valueText: value.valueText,
              valueJson: value.valueJson,
              unit: value.unit,
              qualifier: value.qualifier,
              recordKind: value.recordKind,
              sourceValueIds: value.sourceValueIds,
              createdAt: input.now,
            });
          }
          markLinkedReminderCompleted(
            draft,
            input.childId,
            input.linkedReminderStateId,
            input.linkedReminderRuleId,
            0,
            input.now,
          );
          return {
            eventId: input.eventId,
            valueIds,
            persistedValueCount: valueIds.length,
          };
        });
        return result as T;
      }
      case 'get_health_record_events': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.healthRecordEvents
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.recordedAt.localeCompare(a.recordedAt)),
        ) as T;
      }
      case 'get_health_record_values': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.healthRecordValues
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.valueId.localeCompare(a.valueId)),
        ) as T;
      }
      case 'get_profile_section_summaries': {
        requireInitialized();
        return computeProfileSectionSummaries(state, asStr(p.childId)) as T;
      }

      // ── Orthodontic ──────────────────────────────────────────────────────
      case 'insert_orthodontic_case': {
        const now = asStr(p.now);
        const caseType = asStr(p.caseType) as WritableOrthodonticCaseType;
        if (caseType === ('unknown-legacy' as unknown)) {
          throw new Error('unknown-legacy orthodontic caseType cannot be written');
        }
        await mutate((draft) => {
          draft.orthodonticCases.push({
            caseId: asStr(p.caseId),
            childId: asStr(p.childId),
            caseType,
            stage: asStr(p.stage) as OrthodonticCaseRow['stage'],
            startedAt: asStr(p.startedAt),
            plannedEndAt: asOptStr(p.plannedEndAt),
            actualEndAt: null,
            primaryIssues: asOptStr(p.primaryIssues),
            providerName: asOptStr(p.providerName),
            providerInstitution: asOptStr(p.providerInstitution),
            nextReviewDate: null,
            notes: asOptStr(p.notes),
            createdAt: now,
            updatedAt: now,
          });
        });
        return undefined as T;
      }
      case 'update_orthodontic_case': {
        const caseId = asStr(p.caseId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticCases.find((item) => item.caseId === caseId);
          if (!row) throw new Error(`Orthodontic case not found: ${caseId}`);
          row.caseType = asStr(p.caseType) as WritableOrthodonticCaseType;
          row.stage = asStr(p.stage) as OrthodonticCaseRow['stage'];
          row.startedAt = asStr(p.startedAt);
          row.plannedEndAt = asOptStr(p.plannedEndAt);
          row.actualEndAt = asOptStr(p.actualEndAt);
          row.primaryIssues = asOptStr(p.primaryIssues);
          row.providerName = asOptStr(p.providerName);
          row.providerInstitution = asOptStr(p.providerInstitution);
          row.notes = asOptStr(p.notes);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'delete_orthodontic_case': {
        const caseId = asStr(p.caseId);
        const sessionIds = new Set(
          state.orthodonticPhotoSessions.filter((s) => s.caseId === caseId).map((s) => s.sessionId),
        );
        const photos = state.orthodonticPhotoAttachments.filter((a) => sessionIds.has(a.sessionId));
        await mutate((draft) => {
          draft.orthodonticCases = draft.orthodonticCases.filter((item) => item.caseId !== caseId);
          draft.orthodonticAppliances = draft.orthodonticAppliances.filter((item) => item.caseId !== caseId);
          draft.orthodonticCheckins = draft.orthodonticCheckins.filter((item) => item.caseId !== caseId);
          draft.orthodonticUnwearIntervals = draft.orthodonticUnwearIntervals.filter((item) => item.caseId !== caseId);
          draft.orthodonticPhotoSessions = draft.orthodonticPhotoSessions.filter((item) => item.caseId !== caseId);
          draft.orthodonticPhotoAttachments = draft.orthodonticPhotoAttachments.filter(
            (item) => !sessionIds.has(item.sessionId),
          );
        });
        for (const photo of photos) {
          await removeMediaAsset(photo.filePath).catch(() => undefined);
        }
        return undefined as T;
      }
      case 'get_orthodontic_cases': {
        requireInitialized();
        const childId = asStr(p.childId);
        return structuredClone(
          state.orthodonticCases
            .filter((row) => row.childId === childId)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        ) as T;
      }
      case 'insert_orthodontic_appliance': {
        const now = asStr(p.now);
        await mutate((draft) => {
          draft.orthodonticAppliances.push({
            applianceId: asStr(p.applianceId),
            caseId: asStr(p.caseId),
            childId: asStr(p.childId),
            applianceType: asStr(p.applianceType) as OrthodonticApplianceRow['applianceType'],
            status: asStr(p.status) as OrthodonticApplianceStatus,
            startedAt: asStr(p.startedAt),
            endedAt: null,
            prescribedHoursPerDay: asOptNum(p.prescribedHoursPerDay),
            prescribedActivations: asOptNum(p.prescribedActivations),
            completedActivations: 0,
            activationIntervalDays: asOptNum(p.activationIntervalDays),
            totalAligners: asOptNum(p.totalAligners),
            daysPerAligner: asOptNum(p.daysPerAligner),
            currentPhase: asOptStr(p.currentPhase),
            phaseStartedAt: asOptStr(p.phaseStartedAt),
            reviewIntervalDays: asOptNum(p.reviewIntervalDays),
            lastReviewAt: null,
            nextReviewDate: null,
            nextReviewAgenda: asOptStr(p.nextReviewAgenda),
            pauseReason: null,
            notes: asOptStr(p.notes),
            createdAt: now,
            updatedAt: now,
          });
        });
        return undefined as T;
      }
      case 'update_orthodontic_appliance_status': {
        const applianceId = asStr(p.applianceId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticAppliances.find((item) => item.applianceId === applianceId);
          if (!row) throw new Error(`Orthodontic appliance not found: ${applianceId}`);
          row.status = asStr(p.status) as OrthodonticApplianceStatus;
          row.pauseReason = asOptStr(p.pauseReason);
          row.endedAt = asOptStr(p.endedAt);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'update_orthodontic_appliance_review': {
        const applianceId = asStr(p.applianceId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticAppliances.find((item) => item.applianceId === applianceId);
          if (!row) throw new Error(`Orthodontic appliance not found: ${applianceId}`);
          row.lastReviewAt = asOptStr(p.lastReviewAt);
          row.nextReviewDate = asOptStr(p.nextReviewDate);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'update_orthodontic_appliance_plan': {
        const applianceId = asStr(p.applianceId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticAppliances.find((item) => item.applianceId === applianceId);
          if (!row) throw new Error(`Orthodontic appliance not found: ${applianceId}`);
          row.prescribedHoursPerDay = asOptNum(p.prescribedHoursPerDay);
          row.totalAligners = asOptNum(p.totalAligners);
          row.daysPerAligner = asOptNum(p.daysPerAligner);
          row.activationIntervalDays = asOptNum(p.activationIntervalDays);
          row.nextReviewAgenda = asOptStr(p.nextReviewAgenda);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'advance_orthodontic_appliance_phase': {
        const applianceId = asStr(p.applianceId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticAppliances.find((item) => item.applianceId === applianceId);
          if (!row) throw new Error(`Orthodontic appliance not found: ${applianceId}`);
          row.currentPhase = asStr(p.nextPhase);
          row.phaseStartedAt = now.slice(0, 10);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'delete_orthodontic_appliance': {
        const applianceId = asStr(p.applianceId);
        await mutate((draft) => {
          draft.orthodonticAppliances = draft.orthodonticAppliances.filter((item) => item.applianceId !== applianceId);
          draft.orthodonticCheckins = draft.orthodonticCheckins.filter((item) => item.applianceId !== applianceId);
          draft.orthodonticUnwearIntervals = draft.orthodonticUnwearIntervals.filter(
            (item) => item.applianceId !== applianceId,
          );
        });
        return undefined as T;
      }
      case 'get_orthodontic_appliances': {
        requireInitialized();
        const caseId = asStr(p.caseId);
        return structuredClone(state.orthodonticAppliances.filter((row) => row.caseId === caseId)) as T;
      }
      case 'insert_orthodontic_checkin': {
        const now = asStr(p.now);
        const checkinType = asStr(p.checkinType) as OrthodonticCheckinRow['checkinType'];
        const applianceId = asStr(p.applianceId);
        await mutate((draft) => {
          draft.orthodonticCheckins.push({
            checkinId: asStr(p.checkinId),
            childId: asStr(p.childId),
            caseId: asStr(p.caseId),
            applianceId,
            checkinType,
            checkinDate: asStr(p.checkinDate),
            checkinAt: asOptStr(p.checkinAt),
            activationIndex: asOptNum(p.activationIndex),
            alignerIndex: asOptNum(p.alignerIndex),
            notes: asOptStr(p.notes),
            createdAt: now,
            updatedAt: now,
          });
          if (checkinType === 'expander-activation') {
            const appliance = draft.orthodonticAppliances.find((item) => item.applianceId === applianceId);
            if (appliance) {
              appliance.completedActivations += 1;
              appliance.updatedAt = now;
            }
          }
        });
        return undefined as T;
      }
      case 'delete_orthodontic_checkin': {
        const checkinId = asStr(p.checkinId);
        await mutate((draft) => {
          const existing = draft.orthodonticCheckins.find((item) => item.checkinId === checkinId);
          draft.orthodonticCheckins = draft.orthodonticCheckins.filter((item) => item.checkinId !== checkinId);
          if (existing?.checkinType === 'expander-activation') {
            const appliance = draft.orthodonticAppliances.find((item) => item.applianceId === existing.applianceId);
            if (appliance && appliance.completedActivations > 0) {
              appliance.completedActivations -= 1;
            }
          }
        });
        return undefined as T;
      }
      case 'get_orthodontic_checkins': {
        requireInitialized();
        const applianceId = asStr(p.applianceId);
        const rows = state.orthodonticCheckins
          .filter((row) => row.applianceId === applianceId)
          .sort((a, b) => b.checkinDate.localeCompare(a.checkinDate) || b.createdAt.localeCompare(a.createdAt));
        return structuredClone(rows) as T;
      }
      case 'get_orthodontic_dashboard': {
        requireInitialized();
        return structuredClone(computeOrthodonticDashboard(state, asStr(p.childId))) as T;
      }
      case 'insert_unwear_interval': {
        const now = asStr(p.now);
        const applianceId = asStr(p.applianceId);
        const endAt = asOptStr(p.endAt);
        await mutate((draft) => {
          if (
            endAt === null
            && draft.orthodonticUnwearIntervals.some((item) => item.applianceId === applianceId && item.endAt === null)
          ) {
            throw new Error(`An open unwear interval already exists for appliance ${applianceId}`);
          }
          draft.orthodonticUnwearIntervals.push({
            intervalId: asStr(p.intervalId),
            childId: asStr(p.childId),
            caseId: asStr(p.caseId),
            applianceId,
            startAt: asStr(p.startAt),
            endAt,
            reason: asOptStr(p.reason) as OrthodonticUnwearReason | null,
            notes: asOptStr(p.notes),
            createdAt: now,
            updatedAt: now,
          });
        });
        return undefined as T;
      }
      case 'close_unwear_interval': {
        const intervalId = asStr(p.intervalId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticUnwearIntervals.find((item) => item.intervalId === intervalId);
          if (!row) throw new Error(`Unwear interval not found: ${intervalId}`);
          if (row.endAt !== null) throw new Error(`Unwear interval is already closed: ${intervalId}`);
          row.endAt = asStr(p.endAt);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'update_unwear_interval': {
        const intervalId = asStr(p.intervalId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticUnwearIntervals.find((item) => item.intervalId === intervalId);
          if (!row) throw new Error(`Unwear interval not found: ${intervalId}`);
          const nextEndAt = asOptStr(p.endAt);
          if (
            nextEndAt === null
            && draft.orthodonticUnwearIntervals.some(
              (item) => item.applianceId === row.applianceId && item.intervalId !== intervalId && item.endAt === null,
            )
          ) {
            throw new Error(`An open unwear interval already exists for appliance ${row.applianceId}`);
          }
          row.startAt = asStr(p.startAt);
          row.endAt = nextEndAt;
          row.reason = asOptStr(p.reason) as OrthodonticUnwearReason | null;
          row.notes = asOptStr(p.notes);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'delete_unwear_interval': {
        const intervalId = asStr(p.intervalId);
        await mutate((draft) => {
          draft.orthodonticUnwearIntervals = draft.orthodonticUnwearIntervals.filter(
            (item) => item.intervalId !== intervalId,
          );
        });
        return undefined as T;
      }
      case 'get_unwear_intervals': {
        requireInitialized();
        const applianceId = asStr(p.applianceId);
        const limit = asOptNum(p.limit);
        const rows: OrthodonticUnwearIntervalRow[] = state.orthodonticUnwearIntervals
          .filter((row) => row.applianceId === applianceId)
          .sort((a, b) => b.startAt.localeCompare(a.startAt));
        return structuredClone(limit !== null ? rows.slice(0, limit) : rows) as T;
      }
      case 'get_orthodontic_journey': {
        requireInitialized();
        return structuredClone(computeOrthodonticJourney(state, asStr(p.childId), asStr(p.caseId))) as T;
      }

      // ── Orthodontic Photos ───────────────────────────────────────────────
      case 'insert_orthodontic_photo_session': {
        const now = asStr(p.now);
        const row: OrthodonticPhotoSessionRow = {
          sessionId: asStr(p.sessionId),
          childId: asStr(p.childId),
          caseId: asStr(p.caseId),
          applianceId: asOptStr(p.applianceId),
          trayIndex: asOptNum(p.trayIndex),
          sessionDate: asStr(p.sessionDate),
          note: asOptStr(p.note),
          createdAt: now,
          updatedAt: now,
        };
        await mutate((draft) => {
          draft.orthodonticPhotoSessions.push(row);
        });
        return structuredClone(row) as T;
      }
      case 'update_orthodontic_photo_session': {
        const sessionId = asStr(p.sessionId);
        const now = asStr(p.now);
        await mutate((draft) => {
          const row = draft.orthodonticPhotoSessions.find((item) => item.sessionId === sessionId);
          if (!row) throw new Error(`Photo session not found: ${sessionId}`);
          row.trayIndex = asOptNum(p.trayIndex);
          row.sessionDate = asStr(p.sessionDate);
          row.note = asOptStr(p.note);
          row.updatedAt = now;
        });
        return undefined as T;
      }
      case 'get_orthodontic_photo_session': {
        requireInitialized();
        const sessionId = asStr(p.sessionId);
        const row = state.orthodonticPhotoSessions.find((item) => item.sessionId === sessionId) ?? null;
        return (row ? structuredClone(row) : null) as T;
      }
      case 'list_orthodontic_photo_sessions_for_case': {
        requireInitialized();
        const caseId = asStr(p.caseId);
        const childId = asStr(p.childId);
        return structuredClone(
          state.orthodonticPhotoSessions
            .filter((row) => row.caseId === caseId && row.childId === childId)
            .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate)),
        ) as T;
      }
      case 'list_photo_attachments_for_session': {
        requireInitialized();
        const sessionId = asStr(p.sessionId);
        return structuredClone(
          state.orthodonticPhotoAttachments.filter((row) => row.sessionId === sessionId),
        ) as T;
      }
      case 'attach_orthodontic_photo': {
        const sessionId = asStr(p.sessionId);
        const angle = asStr(p.angle) as OrthodonticPhotoAngle;
        if (state.orthodonticPhotoAttachments.some((row) => row.sessionId === sessionId && row.angle === angle)) {
          throw `photo for angle "${angle}" already exists on session ${sessionId}`;
        }
        const childId = sanitizeSegment(asStr(p.childId), 'childId');
        const safeSessionId = sanitizeSegment(sessionId, 'sessionId');
        const safeAttachmentId = sanitizeSegment(asStr(p.attachmentId), 'attachmentId');
        const mimeType = asStr(p.mimeType, 'image/jpeg');
        const bytes = decodeBoundedBase64(asStr(p.imageBase64), MAX_IMAGE_BYTES, 'orthodontic photo');
        const ext = extensionForMime(mimeType, 'jpg');
        const relativePath = `parentos/media/orthodontic-photos/${childId}/${safeSessionId}/${safeAttachmentId}.${ext}`;
        const filePath = await writeMediaAsset(relativePath, bytes, mimeType);
        const row: OrthodonticPhotoAttachmentRow = {
          attachmentId: asStr(p.attachmentId),
          childId: asStr(p.childId),
          sessionId,
          angle,
          filePath,
          fileName: asStr(p.fileName),
          mimeType,
          createdAt: asStr(p.now),
        };
        await mutate((draft) => {
          if (draft.orthodonticPhotoAttachments.some((item) => item.sessionId === sessionId && item.angle === angle)) {
            throw `photo for angle "${angle}" already exists on session ${sessionId}`;
          }
          draft.orthodonticPhotoAttachments.push(row);
        });
        return structuredClone(row) as T;
      }
      case 'list_orthodontic_photo_session_bundles': {
        requireInitialized();
        const caseId = asStr(p.caseId);
        const childId = asStr(p.childId);
        const sessions = state.orthodonticPhotoSessions
          .filter((row) => row.caseId === caseId && row.childId === childId)
          .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
        const bundles: OrthodonticPhotoSessionBundle[] = sessions.map((session) => ({
          session: structuredClone(session),
          attachments: structuredClone(
            state.orthodonticPhotoAttachments.filter((att) => att.sessionId === session.sessionId),
          ),
        }));
        return bundles as T;
      }
      case 'read_orthodontic_photo_blob': {
        requireInitialized();
        const attachmentId = asStr(p.attachmentId);
        const row = state.orthodonticPhotoAttachments.find((item) => item.attachmentId === attachmentId);
        if (!row || !row.filePath.startsWith(WEB_ASSET_PREFIX)) {
          throw new Error(`Orthodontic photo not found: ${attachmentId}`);
        }
        const { scope } = requireScope();
        const { bytes } = await readAssetBytes(scope.assets, row.filePath.slice(WEB_ASSET_PREFIX.length));
        return encodeBase64(bytes) as T;
      }
      case 'delete_orthodontic_photo_session': {
        const sessionId = asStr(p.sessionId);
        const childId = asStr(p.childId);
        const photos = state.orthodonticPhotoAttachments.filter(
          (item) => item.sessionId === sessionId && item.childId === childId,
        );
        await mutate((draft) => {
          draft.orthodonticPhotoSessions = draft.orthodonticPhotoSessions.filter(
            (item) => !(item.sessionId === sessionId && item.childId === childId),
          );
          draft.orthodonticPhotoAttachments = draft.orthodonticPhotoAttachments.filter(
            (item) => !(item.sessionId === sessionId && item.childId === childId),
          );
        });
        for (const photo of photos) {
          await removeMediaAsset(photo.filePath).catch(() => undefined);
        }
        return undefined as T;
      }
      case 'delete_orthodontic_photo_attachment': {
        const attachmentId = asStr(p.attachmentId);
        const existing = state.orthodonticPhotoAttachments.find((item) => item.attachmentId === attachmentId);
        await mutate((draft) => {
          draft.orthodonticPhotoAttachments = draft.orthodonticPhotoAttachments.filter(
            (item) => item.attachmentId !== attachmentId,
          );
        });
        if (existing) {
          await removeMediaAsset(existing.filePath).catch(() => undefined);
        }
        return undefined as T;
      }

      // ── Vision Followup Settings ─────────────────────────────────────────
      case 'get_vision_followup_settings': {
        requireInitialized();
        const childId = asStr(p.childId);
        return (state.visionFollowupSettings[childId]
          ? structuredClone(state.visionFollowupSettings[childId])
          : null) as T;
      }
      case 'set_vision_followup_settings': {
        const childId = asStr(p.childId);
        const cadenceMonths = asNum(p.cadenceMonths);
        if (cadenceMonths < VISION_FOLLOWUP_CADENCE_MIN || cadenceMonths > VISION_FOLLOWUP_CADENCE_MAX) {
          throw new Error(`cadenceMonths must be between ${VISION_FOLLOWUP_CADENCE_MIN} and ${VISION_FOLLOWUP_CADENCE_MAX}`);
        }
        const now = asStr(p.now);
        await mutate((draft) => {
          const existing = draft.visionFollowupSettings[childId];
          const next: VisionFollowupSettings = {
            childId,
            cadenceMonths,
            customNextDate: asOptStr(p.customNextDate),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          };
          draft.visionFollowupSettings[childId] = next;
        });
        return undefined as T;
      }
      case 'clear_vision_followup_settings': {
        const childId = asStr(p.childId);
        await mutate((draft) => {
          delete draft.visionFollowupSettings[childId];
        });
        return undefined as T;
      }

      // ── Media Storage ────────────────────────────────────────────────────
      case 'save_child_avatar': {
        const childId = sanitizeSegment(asStr(p.childId), 'childId');
        const mimeType = asStr(p.mimeType, 'image/png');
        const bytes = decodeBoundedBase64(asStr(p.imageBase64), MAX_IMAGE_BYTES, 'child avatar');
        const ext = extensionForMime(mimeType, 'png');
        const path = await writeMediaAsset(`parentos/media/avatars/${childId}.${ext}`, bytes, mimeType);
        return { path } as T;
      }
      case 'save_journal_photo': {
        const childId = sanitizeSegment(asStr(p.childId), 'childId');
        const entryId = sanitizeSegment(asStr(p.entryId), 'entryId');
        const index = Math.max(0, Math.trunc(asNum(p.index, 0)));
        const mimeType = asStr(p.mimeType, 'image/jpeg');
        const bytes = decodeBoundedBase64(asStr(p.imageBase64), MAX_IMAGE_BYTES, 'journal photo');
        const ext = extensionForMime(mimeType, 'jpg');
        const path = await writeMediaAsset(
          `parentos/media/journal-photos/${childId}/${entryId}-${index}.${ext}`,
          bytes,
          mimeType,
        );
        return { path } as T;
      }
      case 'delete_journal_photo': {
        await removeMediaAsset(asStr(p.path));
        return undefined as T;
      }
      case 'save_journal_voice_audio': {
        const childId = sanitizeSegment(asStr(p.childId), 'childId');
        const entryId = sanitizeSegment(asStr(p.entryId), 'entryId');
        const mimeType = asStr(p.mimeType, 'audio/webm');
        const bytes = decodeBoundedBase64(asStr(p.audioBase64), MAX_AUDIO_BYTES, 'journal voice audio');
        const ext = extensionForMime(mimeType, 'webm');
        const path = await writeMediaAsset(
          `parentos/media/journal-audio/${childId}/${entryId}.${ext}`,
          bytes,
          mimeType,
        );
        return { path } as T;
      }
      case 'delete_journal_voice_audio': {
        await removeMediaAsset(asStr(p.path));
        return undefined as T;
      }

      // ── Browser-native file operations ───────────────────────────────────
      case 'pick_image_files_as_base64': {
        return (await pickBrowserImageFilesAsBase64()) as T;
      }
      case 'report_export_create_save_target': {
        const defaultFilename = asStr(p.defaultFilename, 'report-export');
        const kind = asStr(p.kind, 'pdf');
        exportTargetSeq += 1;
        const saveTargetId = `parentos-web-export-${exportTargetSeq}`;
        pendingExportTargets.set(saveTargetId, { filename: defaultFilename, kind });
        return { saveTargetId, displayPath: defaultFilename } as T;
      }
      case 'report_export_write_save_target': {
        const saveTargetId = asStr(p.saveTargetId);
        const target = pendingExportTargets.get(saveTargetId);
        if (!target) {
          throw new Error(`Unknown export save target: ${saveTargetId}`);
        }
        pendingExportTargets.delete(saveTargetId);
        triggerBrowserDownload(target.filename, target.kind, asStr(p.base64Data));
        return { saveTargetId, displayPath: target.filename } as T;
      }
      case 'data_transfer_export_backup':
      case 'data_transfer_restore_backup': {
        throw new Error(
          'Complete .parentos SQLite archive backup and restore are only supported in ParentOS Desktop.',
        );
      }

      default:
        throw new Error(`Unsupported ParentOS Web command: ${command}`);
    }
  }

  function convertFileSrc(filePath: string): string {
    if (!filePath) return '';
    if (filePath.startsWith(WEB_ASSET_PREFIX)) {
      return mediaUrlCache.get(filePath) ?? '';
    }
    return filePath;
  }

  function bindScope(scope: ParentOSWebStorageScope | null): void {
    connectionEpoch += 1;
    activeScope = scope;
    initialized = false;
    pendingWrite = Promise.resolve();
    pendingExportTargets.clear();
    revokeAllMediaUrls();
    state = createEmptyParentOSWebState();
  }

  function reset(): void {
    bindScope(null);
  }

  return {
    executor: { invoke, convertFileSrc },
    bindScope,
    reset,
  };
}
