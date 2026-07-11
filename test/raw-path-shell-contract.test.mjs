import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();

function readRepoFile(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

test('native image picker does not expose reusable absolute paths to the renderer', () => {
  const droppedFile = readRepoFile('src-tauri/src/dropped_file.rs');
  const tauriMain = readRepoFile('src-tauri/src/main.rs');
  const dentalHistory = readRepoFile('src/shell/renderer/features/profile/dental-history-view.tsx');

  assert.doesNotMatch(
    droppedFile,
    /pub\s+fn\s+pick_image_files\s*\([^)]*\)\s*->\s*Result\s*<\s*Vec\s*<\s*String\s*>/m,
    'native picker must not return raw filesystem paths',
  );
  assert.doesNotMatch(
    tauriMain,
    /\bdropped_file::pick_image_files\b/,
    'raw-path native picker command must not be registered',
  );
  assert.doesNotMatch(
    dentalHistory,
    /invoke\s*<\s*string\s*\[\]\s*>\s*\(\s*['"]pick_image_files['"]/m,
    'renderer must not receive reusable absolute paths from native picker',
  );
  assert.match(
    dentalHistory,
    /invoke\s*<\s*[^>]*DentalPhotoPayload[^>]*>\s*\(\s*['"]pick_image_files_as_base64['"]/m,
    'renderer should consume native picker bytes payloads directly',
  );
});

test('production renderer and Tauri command registry do not expose raw filesystem path authority', () => {
  const tauriMain = readRepoFile('src-tauri/src/main.rs');
  const droppedFile = readRepoFile('src-tauri/src/dropped_file.rs');
  const reportExportRust = readRepoFile('src-tauri/src/report_export.rs');
  const dentalHistory = readRepoFile('src/shell/renderer/features/profile/dental-history-view.tsx');
  const reportExportTs = readRepoFile('src/shell/renderer/features/reports/report-export.ts');
  const windowDrag = readRepoFile('src/shell/renderer/bridge/window-drag.ts');

  assert.doesNotMatch(
    tauriMain,
    /\b(get_storage_dirs|prepare_parentos_app_storage|parentos_start_window_drag)\b/,
    'legacy renderer-visible storage/drag commands must be removed from Tauri main',
  );
  assert.doesNotMatch(
    dentalHistory,
    /@tauri-apps\/api\/webview|getCurrentWebview|onDragDropEvent|read_dropped_image_as_base64/u,
    'renderer must not consume reusable dropped file paths through the Tauri webview API',
  );
  assert.doesNotMatch(
    droppedFile,
    /pub\s+fn\s+read_dropped_image_as_base64\s*\(\s*path\s*:\s*String/m,
    'dropped image reads must not accept arbitrary renderer-supplied paths',
  );
  assert.doesNotMatch(
    reportExportRust,
    /pub\s+fn\s+pick_report_save_path[\s\S]*Result\s*<\s*Option\s*<\s*String\s*>|pub\s+fn\s+write_report_file_at\s*\(\s*path\s*:\s*String|PathBuf::from\s*\(\s*path\.trim\(\)\s*\)/m,
    'report export must use one-shot grants instead of renderer-visible absolute paths',
  );
  assert.doesNotMatch(
    reportExportTs,
    /pick_report_save_path|write_report_file_at[\s\S]*\{\s*path\s*,\s*base64Data\s*\}/m,
    'renderer report export must not request or replay absolute save paths',
  );
  assert.doesNotMatch(
    windowDrag,
    /parentos_start_window_drag/u,
    'window drag must use the standard kit shell command, not the app-prefixed alias',
  );
});

test('Electron shell does not expose generic raw path standard surfaces to ParentOS renderer', () => {
  const electronMain = readRepoFile('src-electron/main.ts');

  assert.doesNotMatch(
    electronMain,
    /NIMI_STANDARD_SHELL_COMMANDS\['file-dialog\.open'\]/u,
    'ParentOS renderer must use app-owned picker bytes commands, not generic shell file-dialog absolute paths',
  );
  assert.doesNotMatch(
    electronMain,
    /NIMI_STANDARD_SHELL_COMMANDS\['file-reveal\.reveal'\]/u,
    'ParentOS renderer must not receive reusable absolute paths for OS reveal',
  );
  assert.doesNotMatch(
    electronMain,
    /NIMI_STANDARD_SHELL_COMMANDS\['export\.saveFile'\]/u,
    'ParentOS report export must use host-owned one-shot grants, not generic shell save-file paths',
  );
  assert.doesNotMatch(
    electronMain,
    /app\.getPath\(\s*['"]downloads['"]\s*\)/u,
    'Electron local asset roots must not grant renderer authority over the user Downloads directory',
  );
});
