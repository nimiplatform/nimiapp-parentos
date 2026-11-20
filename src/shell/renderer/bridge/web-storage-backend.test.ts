import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NimiAppRuntimeClient } from '@nimiplatform/sdk';
import { createParentOSWebStorageController } from './web-storage-backend.js';

type AssetsClient = NimiAppRuntimeClient['storage']['assets'];

function createMemoryAssetsClient() {
  const files = new Map<string, { bytes: Uint8Array; mediaType: string }>();

  async function bodyToBytes(body: Uint8Array | Blob | AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    if (body instanceof Uint8Array) return new Uint8Array(body);
    if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of body) {
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }

  const assets: AssetsClient = {
    async stat(relativePath) {
      const entry = files.get(relativePath);
      if (!entry) throw new Error(`Asset not found: ${relativePath}`);
      return {
        relativePath,
        mediaType: entry.mediaType,
        sizeBytes: entry.bytes.byteLength,
        sha256: 'test-sha256',
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
      };
    },
    async list({ prefix }) {
      const matched = [...files.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([relativePath, entry]) => ({
          relativePath,
          mediaType: entry.mediaType,
          sizeBytes: entry.bytes.byteLength,
          sha256: 'test-sha256',
          createdAt: '2026-11-20T00:00:00.000Z',
          updatedAt: '2026-11-20T00:00:00.000Z',
        }));
      return { assets: matched, nextCursor: '' };
    },
    async write({ relativePath, body, mediaType }) {
      const bytes = await bodyToBytes(body);
      files.set(relativePath, { bytes, mediaType: mediaType ?? 'application/octet-stream' });
      return {
        relativePath,
        mediaType: mediaType ?? 'application/octet-stream',
        sizeBytes: bytes.byteLength,
        sha256: 'test-sha256',
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
      };
    },
    async read({ relativePath }) {
      const entry = files.get(relativePath);
      if (!entry) throw new Error(`Asset not found: ${relativePath}`);
      const copy = new Uint8Array(entry.bytes);
      return {
        asset: {
          relativePath,
          mediaType: entry.mediaType,
          sizeBytes: copy.byteLength,
          sha256: 'test-sha256',
          createdAt: '2026-11-20T00:00:00.000Z',
          updatedAt: '2026-11-20T00:00:00.000Z',
        },
        range: { offset: 0, length: copy.byteLength, totalSize: copy.byteLength },
        body: (async function* () {
          yield copy;
        })(),
      };
    },
    async remove(relativePath) {
      return { removed: files.delete(relativePath) };
    },
    async move({ from, to }) {
      const entry = files.get(from);
      if (!entry) throw new Error(`Asset not found: ${from}`);
      files.delete(from);
      files.set(to, entry);
      return {
        relativePath: to,
        mediaType: entry.mediaType,
        sizeBytes: entry.bytes.byteLength,
        sha256: 'test-sha256',
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
      };
    },
    async adoptArtifact() {
      throw new Error('Not used in test');
    },
  };

  return { assets, files };
}

describe('ParentOS Web storage backend', () => {
  it('persists family, child, observation journal, and tags across disconnect and reconnect', async () => {
    const { assets, files } = createMemoryAssetsClient();
    const controller = createParentOSWebStorageController();
    const scope1 = new AbortController();
    controller.bindScope({ assets, signal: scope1.signal });

    await controller.executor.invoke('db_init', { appAccountId: null, admittedReminderRuleIds: [] });
    await controller.executor.invoke('create_family', {
      familyId: 'fam-1',
      displayName: '林家测试档案',
      now: '2026-11-20T01:00:00.000Z',
    });
    await controller.executor.invoke('create_child', {
      childId: 'child-1',
      familyId: 'fam-1',
      displayName: '小安',
      gender: 'female',
      birthDate: '2024-05-10',
      birthWeightKg: 3.2,
      birthHeightCm: 50,
      birthHeadCircCm: 34,
      avatarPath: null,
      nurtureMode: 'balanced',
      nurtureModeOverrides: null,
      allergies: null,
      medicalNotes: null,
      recorderProfiles: null,
      now: '2026-11-20T01:00:01.000Z',
    });
    await controller.executor.invoke('insert_journal_entry_with_tags', {
      entryId: 'entry-1',
      childId: 'child-1',
      contentType: 'text',
      textContent: '今天小安自己把三块积木叠在一起并笑着拍手。',
      voicePath: null,
      photoPaths: null,
      recordedAt: '2026-11-20T01:05:00.000Z',
      ageMonths: 30,
      observationMode: 'free',
      dimensionId: null,
      selectedTags: '["fine_motor"]',
      guidedAnswers: null,
      observationDuration: null,
      keepsake: 0,
      keepsakeTitle: null,
      keepsakeReason: null,
      moodTag: 'happy',
      recorderId: null,
      aiTags: [{ tagId: 'tag-1', domain: 'motor', tag: '积木搭建', source: 'user', confidence: null }],
      now: '2026-11-20T01:05:00.000Z',
    });

    expect(files.has('parentos/db/state-v1.json')).toBe(true);

    // Simulate logout, page refresh, and reconnect with a brand new controller and AbortSignal
    scope1.abort();
    controller.reset();

    const reconnected = createParentOSWebStorageController();
    const scope2 = new AbortController();
    reconnected.bindScope({ assets, signal: scope2.signal });
    await reconnected.executor.invoke('db_init', { appAccountId: null, admittedReminderRuleIds: [] });

    const family = await reconnected.executor.invoke<{ familyId: string; displayName: string } | null>('get_family');
    expect(family?.displayName).toBe('林家测试档案');

    const children = await reconnected.executor.invoke<Array<{ childId: string; displayName: string }>>('get_children', {
      familyId: 'fam-1',
    });
    expect(children).toHaveLength(1);
    expect(children[0]?.displayName).toBe('小安');

    const entries = await reconnected.executor.invoke<Array<{ entryId: string; textContent: string }>>('get_journal_entries', {
      childId: 'child-1',
      limit: null,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.textContent).toBe('今天小安自己把三块积木叠在一起并笑着拍手。');

    const tags = await reconnected.executor.invoke<Array<{ tag: string }>>('get_journal_tags', {
      entryId: 'entry-1',
    });
    expect(tags.map((item) => item.tag)).toEqual(['积木搭建']);
  });

  it('cascades child deletion across records and media assets', async () => {
    const { assets, files } = createMemoryAssetsClient();
    const controller = createParentOSWebStorageController();
    const scope = new AbortController();
    controller.bindScope({ assets, signal: scope.signal });

    await controller.executor.invoke('db_init', { appAccountId: null, admittedReminderRuleIds: [] });
    await controller.executor.invoke('create_family', {
      familyId: 'fam-1',
      displayName: '测试家庭',
      now: '2026-11-20T01:00:00.000Z',
    });
    const avatar = await controller.executor.invoke<{ path: string }>('save_child_avatar', {
      childId: 'child-del',
      mimeType: 'image/png',
      imageBase64: btoa('fake-png-bytes'),
    });
    await controller.executor.invoke('create_child', {
      childId: 'child-del',
      familyId: 'fam-1',
      displayName: '待删测试',
      gender: 'male',
      birthDate: '2025-01-01',
      birthWeightKg: null,
      birthHeightCm: null,
      birthHeadCircCm: null,
      avatarPath: avatar.path,
      nurtureMode: 'balanced',
      nurtureModeOverrides: null,
      allergies: null,
      medicalNotes: null,
      recorderProfiles: null,
      now: '2026-11-20T01:00:01.000Z',
    });
    await controller.executor.invoke('insert_journal_entry', {
      entryId: 'entry-del',
      childId: 'child-del',
      contentType: 'text',
      textContent: '测试观察',
      voicePath: null,
      photoPaths: null,
      recordedAt: '2026-11-20T01:02:00.000Z',
      ageMonths: 22,
      observationMode: null,
      dimensionId: null,
      selectedTags: null,
      guidedAnswers: null,
      observationDuration: null,
      keepsake: 0,
      keepsakeTitle: null,
      keepsakeReason: null,
      moodTag: null,
      recorderId: null,
      now: '2026-11-20T01:02:00.000Z',
    });

    expect(files.has('parentos/media/avatars/child-del.png')).toBe(true);
    await controller.executor.invoke('delete_child', { childId: 'child-del' });
    expect(files.has('parentos/media/avatars/child-del.png')).toBe(false);
    expect(
      await controller.executor.invoke<unknown[]>('get_journal_entries', { childId: 'child-del', limit: null }),
    ).toEqual([]);
  });

  it('fails closed when persisted JSON is corrupted or scope is aborted', async () => {
    const { assets, files } = createMemoryAssetsClient();
    files.set('parentos/db/state-v1.json', {
      bytes: new TextEncoder().encode('{broken json'),
      mediaType: 'application/json',
    });
    const controller = createParentOSWebStorageController();
    const scope = new AbortController();
    controller.bindScope({ assets, signal: scope.signal });

    await expect(
      controller.executor.invoke('db_init', { appAccountId: null, admittedReminderRuleIds: [] }),
    ).rejects.toThrow();

    scope.abort();
    await expect(controller.executor.invoke('get_family')).rejects.toThrow();
  });

  it('covers every Electron sidecar and native command in the Web command switch', () => {
    const electronSource = readFileSync(join(process.cwd(), 'src-electron/parentos-command-handlers.ts'), 'utf8');
    const webSource = readFileSync(join(process.cwd(), 'src/shell/renderer/bridge/web-storage-backend.ts'), 'utf8');
    const match = electronSource.match(/const\s+PARENTOS_SIDECAR_COMMANDS\s*=\s*\[([\s\S]*?)\]\s+as\s+const/u);
    expect(match).not.toBeNull();
    const sidecarCommands = [...match![1]!.matchAll(/'([^']+)'/gu)].map((entry) => entry[1]!);
    const nativeCommands = [
      'pick_image_files_as_base64',
      'report_export_create_save_target',
      'data_transfer_export_backup',
      'data_transfer_restore_backup',
    ];
    const missing = [...sidecarCommands, ...nativeCommands].filter(
      (command) => !webSource.includes(`case '${command}':`),
    );
    expect(missing).toEqual([]);
  });
});
