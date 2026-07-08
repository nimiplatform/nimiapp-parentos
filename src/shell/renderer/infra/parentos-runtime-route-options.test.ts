import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectorKind,
  ConnectorStatus,
  LocalAssetKind,
  LocalAssetStatus,
} from '@nimiplatform/sdk/runtime/wire-types';

const listLocalAssetsMock = vi.fn();
const listConnectorsMock = vi.fn();
const listConnectorModelsMock = vi.fn();
const getParentOSNimiClientMock = vi.fn();

vi.mock('./parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => getParentOSNimiClientMock(),
}));

const {
  loadParentosRuntimeRouteOptions,
  normalizeParentosRuntimeRouteCapability,
} = await import('./parentos-runtime-route-options.js');

describe('parentos-runtime-route-options', () => {
  beforeEach(() => {
    listLocalAssetsMock.mockReset();
    listConnectorsMock.mockReset();
    listConnectorModelsMock.mockReset();
    getParentOSNimiClientMock.mockReset();
    listLocalAssetsMock.mockResolvedValue({
      assets: [],
      nextPageToken: '',
    });
    listConnectorsMock.mockResolvedValue({
      connectors: [],
      nextPageToken: '',
    });
    listConnectorModelsMock.mockResolvedValue({
      models: [],
      nextPageToken: '',
    });
    getParentOSNimiClientMock.mockReturnValue({
      runtime: {
        local: {
          listLocalAssets: listLocalAssetsMock,
        },
        connectors: {
          listConnectors: listConnectorsMock,
          listConnectorModels: listConnectorModelsMock,
        },
      },
    });
  });

  it('normalizes ParentOS capability aliases before delegating to SDK host options', async () => {
    listLocalAssetsMock.mockResolvedValue({
      assets: [{
        localAssetId: 'local-qwen',
        assetId: 'qwen3',
        engine: 'llama',
        status: LocalAssetStatus.ACTIVE,
        kind: LocalAssetKind.CHAT,
        endpoint: 'http://127.0.0.1:1234/v1',
        capabilities: [],
      }],
      nextPageToken: '',
    });

    const snapshot = await loadParentosRuntimeRouteOptions('chat');

    expect(snapshot.capability).toBe('text.generate');
    expect(snapshot.selectedTargetRef).toBeNull();
    expect(snapshot.inventory.targets).toEqual([expect.objectContaining({
      targetRef: {
        kind: 'local-runtime',
        version: 'v2',
        profileBindingId: 'local-runtime:local-qwen',
      },
      display: expect.objectContaining({
        model: 'qwen3',
        engine: 'llama',
      }),
      readiness: expect.objectContaining({
        status: 'active',
      }),
      compatibility: {
        capabilities: ['text.generate'],
      },
    })]);
    expect(listLocalAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
      statusFilter: LocalAssetStatus.UNSPECIFIED,
      kindFilter: LocalAssetKind.UNSPECIFIED,
    }), undefined);
  });

  it('does not fabricate options when Runtime exposes no matching assets or connectors', async () => {
    const snapshot = await loadParentosRuntimeRouteOptions('audio.transcribe');

    expect(snapshot).toEqual({
      capability: 'audio.transcribe',
      selectedTargetRef: null,
      snapshotRevision: 'route-options:v1:audio.transcribe',
      inventory: {
        capability: 'audio.transcribe',
        targets: [],
      },
    });
  });

  it('includes cloud connector models through the vNext Runtime connector boundary', async () => {
    listConnectorsMock.mockResolvedValue({
      connectors: [{
        connectorId: 'openai-main',
        label: 'OpenAI',
        provider: 'openai',
        kind: ConnectorKind.REMOTE_MANAGED,
      }],
      nextPageToken: '',
    });
    listConnectorModelsMock.mockResolvedValue({
      models: [{
        available: true,
        modelId: 'gpt-5.4',
        providerModelId: 'gpt-5.4',
        remoteModelCatalogId: 'remote-catalog:openai-main:gpt-5.4',
        capabilities: ['text.generate'],
      }],
      nextPageToken: '',
    });

    const snapshot = await loadParentosRuntimeRouteOptions('text.generate');

    expect(listConnectorsMock).toHaveBeenCalledWith(expect.objectContaining({
      kindFilter: ConnectorKind.REMOTE_MANAGED,
      statusFilter: ConnectorStatus.ACTIVE,
    }), undefined);
    expect(listConnectorModelsMock).toHaveBeenCalledWith(expect.objectContaining({
      connectorId: 'openai-main',
      forceRefresh: false,
    }), undefined);
    expect(snapshot.inventory.targets).toEqual([expect.objectContaining({
      targetRef: {
        kind: 'cloud-connector',
        version: 'v2',
        connectorId: 'openai-main',
        remoteModelCatalogId: 'remote-catalog:openai-main:gpt-5.4',
        providerModelId: 'gpt-5.4',
        provider: 'openai',
      },
      display: expect.objectContaining({
        label: 'gpt-5.4',
        provider: 'openai',
        model: 'gpt-5.4',
      }),
      compatibility: {
        capabilities: ['text.generate'],
      },
    })]);
  });

  it('keeps the vision route as the canonical text.generate.vision capability', async () => {
    expect(normalizeParentosRuntimeRouteCapability('vision')).toBe('text.generate.vision');
    listLocalAssetsMock.mockResolvedValue({
      assets: [{
        localAssetId: 'local-gemma-vision',
        assetId: 'gemma-4-vision',
        engine: 'llama',
        status: LocalAssetStatus.ACTIVE,
        kind: LocalAssetKind.CHAT,
        capabilities: ['text.generate.vision'],
      }],
      nextPageToken: '',
    });

    const snapshot = await loadParentosRuntimeRouteOptions('vision');

    expect(snapshot.capability).toBe('text.generate.vision');
    expect(snapshot.inventory.targets).toEqual([expect.objectContaining({
      targetRef: {
        kind: 'local-runtime',
        version: 'v2',
        profileBindingId: 'local-runtime:local-gemma-vision',
      },
      display: expect.objectContaining({
        model: 'gemma-4-vision',
      }),
      compatibility: {
        capabilities: ['text.generate.vision'],
      },
    })]);
  });

  it('fails closed for unsupported ParentOS route capability tokens', () => {
    expect(() => normalizeParentosRuntimeRouteCapability('image.generate')).toThrow(
      'ParentOS runtime route capability is unsupported',
    );
  });
});
