import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectorKind,
  ConnectorStatus,
  LocalAssetKind,
  LocalAssetStatus,
} from '@nimiplatform/sdk/runtime/generated';

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
    expect(snapshot.selected).toBeNull();
    expect(snapshot.local.models).toEqual([expect.objectContaining({
      localModelId: 'local-qwen',
      model: 'qwen3',
      engine: 'llama',
      status: 'active',
      capabilities: ['text.generate'],
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
      selected: null,
      local: {
        defaultEndpoint: undefined,
        models: [],
      },
      connectors: [],
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
    expect(snapshot.connectors).toEqual([expect.objectContaining({
      id: 'openai-main',
      label: 'OpenAI',
      provider: 'openai',
      models: ['gpt-5.4'],
      modelCapabilities: {
        'gpt-5.4': ['text.generate'],
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
    expect(snapshot.local.models).toEqual([expect.objectContaining({
      localModelId: 'local-gemma-vision',
      model: 'gemma-4-vision',
      capabilities: ['text.generate.vision'],
    })]);
  });

  it('fails closed for unsupported ParentOS route capability tokens', () => {
    expect(() => normalizeParentosRuntimeRouteCapability('image.generate')).toThrow(
      'ParentOS runtime route capability is unsupported',
    );
  });
});
