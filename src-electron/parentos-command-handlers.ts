import { dialog, type BrowserWindow } from 'electron';
import type {
  NimiElectronCommandHandler,
} from '@nimiplatform/kit/shell/electron/main';
import type { ParentOSHostClient } from './parentos-host-client.js';

const PARENTOS_SIDECAR_COMMANDS = [
  'save_journal_voice_audio',
  'delete_journal_voice_audio',
  'save_journal_photo',
  'save_child_avatar',
  'delete_journal_photo',
  'report_export_write_grant',
  'create_family',
  'get_family',
  'get_child',
  'create_child',
  'get_children',
  'update_child',
  'delete_child',
  'insert_measurement',
  'get_measurements',
  'update_measurement',
  'delete_measurement',
  'upsert_milestone_record',
  'get_milestone_records',
  'delete_milestone_record',
  'upsert_reminder_state',
  'get_reminder_states',
  'get_active_reminders',
  'upsert_reminder_consultation',
  'clear_reminder_consultation',
  'insert_custom_todo',
  'update_custom_todo',
  'complete_custom_todo',
  'advance_custom_todo_due_date',
  'uncomplete_custom_todo',
  'delete_custom_todo',
  'get_custom_todos',
  'insert_vaccine_record',
  'get_vaccine_records',
  'insert_journal_entry',
  'insert_journal_entry_with_tags',
  'update_journal_entry_with_tags',
  'update_journal_keepsake',
  'delete_journal_entry',
  'get_journal_entries',
  'insert_journal_tag',
  'get_journal_tags',
  'create_conversation',
  'get_conversations',
  'insert_ai_message',
  'insert_consultation_ai_message',
  'get_ai_messages',
  'insert_growth_report',
  'get_growth_reports',
  'update_growth_report_content',
  'set_app_setting',
  'get_app_setting',
  'insert_dental_record',
  'update_dental_record',
  'delete_dental_record',
  'get_dental_records',
  'insert_ortho_clinical_dental_record',
  'save_attachment',
  'get_attachments',
  'get_attachments_by_owner',
  'delete_attachment',
  'insert_allergy_record',
  'update_allergy_record',
  'get_allergy_records',
  'upsert_sleep_record',
  'delete_sleep_record',
  'get_sleep_records',
  'insert_medical_event',
  'update_medical_event',
  'get_medical_events',
  'insert_tanner_assessment',
  'get_tanner_assessments',
  'delete_tanner_assessment',
  'insert_fitness_assessment',
  'get_fitness_assessments',
  'delete_fitness_assessment',
  'delete_fitness_event',
  'insert_outdoor_record',
  'update_outdoor_record',
  'delete_outdoor_record',
  'get_outdoor_records',
  'get_outdoor_goal',
  'set_outdoor_goal',
  'insert_posture_assessment',
  'get_posture_assessments',
  'save_health_record_capture',
  'replace_health_record_capture',
  'get_health_record_events',
  'get_health_record_values',
  'get_profile_section_summaries',
  'insert_orthodontic_case',
  'update_orthodontic_case',
  'delete_orthodontic_case',
  'get_orthodontic_cases',
  'insert_orthodontic_appliance',
  'update_orthodontic_appliance_status',
  'update_orthodontic_appliance_review',
  'update_orthodontic_appliance_plan',
  'advance_orthodontic_appliance_phase',
  'delete_orthodontic_appliance',
  'get_orthodontic_appliances',
  'insert_orthodontic_checkin',
  'delete_orthodontic_checkin',
  'get_orthodontic_checkins',
  'get_orthodontic_dashboard',
  'insert_unwear_interval',
  'close_unwear_interval',
  'update_unwear_interval',
  'delete_unwear_interval',
  'get_unwear_intervals',
  'get_orthodontic_journey',
  'insert_orthodontic_photo_session',
  'update_orthodontic_photo_session',
  'get_orthodontic_photo_session',
  'list_orthodontic_photo_sessions_for_case',
  'list_photo_attachments_for_session',
  'attach_orthodontic_photo',
  'list_orthodontic_photo_session_bundles',
  'read_orthodontic_photo_blob',
  'delete_orthodontic_photo_session',
  'delete_orthodontic_photo_attachment',
  'get_vision_followup_settings',
  'set_vision_followup_settings',
  'clear_vision_followup_settings',
  'db_init',
] as const;

let reportSaveTargetSequence = 0;

export function createParentOSElectronCommandHandlers(
  input: {
    readonly hostClient: ParentOSHostClient;
    readonly getMainWindow: () => BrowserWindow | undefined;
  },
): Readonly<Record<string, NimiElectronCommandHandler>> {
  const sidecarHandlers = Object.fromEntries(
    PARENTOS_SIDECAR_COMMANDS.map((command) => [
      command,
      (context: Parameters<NimiElectronCommandHandler>[0]) =>
        input.hostClient.invoke(command, context.payload),
    ]),
  );
  return {
    ...sidecarHandlers,
    pick_image_files_as_base64: (context: Parameters<NimiElectronCommandHandler>[0]) =>
      pickImageFilesAsBase64(input.hostClient, input.getMainWindow(), context.payload),
    report_export_create_save_grant: (context: Parameters<NimiElectronCommandHandler>[0]) =>
      createReportSaveGrant(input.hostClient, input.getMainWindow(), context.payload),
  };
}

async function pickImageFilesAsBase64(
  hostClient: ParentOSHostClient,
  mainWindow: BrowserWindow | undefined,
  payload: unknown,
): Promise<unknown> {
  const input = asRecord(payload, 'pick_image_files_as_base64 payload');
  const title = optionalText(input.title);
  const options: Electron.OpenDialogOptions = {
    title: title || 'Select photos',
    properties: ['openFile', 'multiSelections'],
    filters: [imageFileFilter()],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  return await hostClient.invoke('dropped_file_read_image_files_as_base64', {
    paths: result.filePaths,
  });
}

async function createReportSaveGrant(
  hostClient: ParentOSHostClient,
  mainWindow: BrowserWindow | undefined,
  payload: unknown,
): Promise<{ saveTargetId: string; displayPath: string } | null> {
  const input = asRecord(payload, 'report_export_create_save_grant payload');
  const defaultFilename = requiredText(input.defaultFilename, 'defaultFilename');
  const kind = requiredText(input.kind, 'kind');
  const title = optionalText(input.title);
  const options = {
    title: title || 'Save report',
    defaultPath: defaultFilename,
    filters: [filterForKind(kind)],
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return null;
  }
  const targetPath = ensureKindExtension(result.filePath, kind);
  const displayPath = displayOnlyPath(targetPath);
  const saveTargetId = nextReportSaveTargetId();
  const registered = await hostClient.invoke('report_export_register_save_grant', {
    saveTargetId,
    path: targetPath,
    kind,
    displayPath,
  });
  return registered as { saveTargetId: string; displayPath: string };
}

function imageFileFilter(): Electron.FileFilter {
  return { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'] };
}

function filterForKind(kind: string): Electron.FileFilter {
  if (kind === 'pdf') return { name: 'PDF Document', extensions: ['pdf'] };
  if (kind === 'png') return { name: 'PNG Image', extensions: ['png'] };
  if (kind === 'csv') return { name: 'CSV File', extensions: ['csv'] };
  return { name: 'File', extensions: ['*'] };
}

function ensureKindExtension(filePath: string, kind: string): string {
  if (/\.[^/\\.]+$/u.test(filePath)) {
    return filePath;
  }
  if (kind === 'pdf' || kind === 'png' || kind === 'csv') {
    return `${filePath}.${kind}`;
  }
  return filePath;
}

function displayOnlyPath(filePath: string): string {
  const segments = filePath.split(/[\\/]+/u);
  return segments.at(-1) || 'report-export';
}

function nextReportSaveTargetId(): string {
  reportSaveTargetSequence += 1;
  return `parentos-report-save-${process.pid}-${Date.now()}-${reportSaveTargetSequence}`;
}

function requiredText(value: unknown, field: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`ParentOS Electron command requires ${field}`);
  }
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ParentOS Electron command expected object ${field}`);
  }
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
