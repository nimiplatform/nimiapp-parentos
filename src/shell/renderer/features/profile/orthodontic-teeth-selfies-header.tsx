import type { OrthodonticPhotoAngle, OrthodonticPhotoSessionBundle } from '../../bridge/sqlite-bridge.js';
import { CapsLabel } from './orthodontic-teeth-selfies-shared.js';
import { i18nText } from '../../i18n/index.js';


export type CompareMode = 'slide' | 'split';

// ── Header ─────────────────────────────────────────────────

export function Header({
  bundles,
  aSessionId,
  bSessionId,
  angle,
  mode,
  onAngleChange,
  onModeChange,
}: {
  bundles: OrthodonticPhotoSessionBundle[] | null;
  aSessionId: string | null;
  bSessionId: string | null;
  angle: OrthodonticPhotoAngle;
  mode: CompareMode;
  onAngleChange: (a: OrthodonticPhotoAngle) => void;
  onModeChange: (m: CompareMode) => void;
}) {
  const count = bundles?.length ?? 0;
  const a = bundles?.find((b) => b.session.sessionId === aSessionId)?.session;
  const b = bundles?.find((bb) => bb.session.sessionId === bSessionId)?.session;
  const trayDelta =
    a?.trayIndex !== undefined && a.trayIndex !== null
      ? b?.trayIndex !== undefined && b.trayIndex !== null
        ? Math.abs(b.trayIndex - a.trayIndex)
        : null
      : null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 6,
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      <div>
        <CapsLabel>{i18nText('Orthodontic.selfies.header.eyebrow')}</CapsLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--nimi-text-primary)',
            }}
          >
            {i18nText('Orthodontic.selfies.header.title')}
          </span>
          {count > 0 && (
            <span style={{ fontSize: 13, color: 'var(--nimi-text-muted)' }}>
              {i18nText('Orthodontic.selfies.header.count', { count })}
              {trayDelta !== null
                ? i18nText('Orthodontic.selfies.header.trayDelta', { trayDelta })
                : ''}
            </span>
          )}
        </div>
      </div>
      {count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Segmented<OrthodonticPhotoAngle>
            value={angle}
            options={[
              { id: 'front', label: i18nText('Orthodontic.selfies.angle.front') },
              { id: 'side', label: i18nText('Orthodontic.selfies.angle.side') },
            ]}
            onChange={onAngleChange}
          />
          <Segmented<CompareMode>
            value={mode}
            options={[
              {
                id: 'slide',
                label: i18nText('Orthodontic.selfies.mode.slide'),
                title: i18nText('Orthodontic.selfies.mode.slideTitle'),
              },
              {
                id: 'split',
                label: i18nText('Orthodontic.selfies.mode.split'),
                title: i18nText('Orthodontic.selfies.mode.splitTitle'),
              },
            ]}
            onChange={onModeChange}
          />
        </div>
      )}
    </div>
  );
}
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; title?: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: 3,
        borderRadius: 999,
        background: 'var(--nimi-surface-active)',
      }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            title={o.title}
            onClick={() => onChange(o.id)}
            style={{
              padding: '5px 14px',
              borderRadius: 999,
              border: 0,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              background: active ? '#ffffff' : 'transparent',
              color: active ? 'var(--nimi-text-primary)' : 'var(--nimi-text-muted)',
              boxShadow: active ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
              transition: 'all 160ms',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
