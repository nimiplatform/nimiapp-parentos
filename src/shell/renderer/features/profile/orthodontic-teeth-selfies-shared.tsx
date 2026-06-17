import type { OrthodonticPhotoSessionBundle } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';

export function formatThumbLabel(session: OrthodonticPhotoSessionBundle['session']): string {
  if (session.note) return session.note;
  if (session.trayIndex !== null) {
    return i18nText('Orthodontic.selfies.thumb.trayIndex', { trayIndex: session.trayIndex });
  }
  return i18nText('Orthodontic.selfies.thumb.photoSet');
}

export function CapsLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--nimi-text-muted)',
      }}
    >
      {children}
    </div>
  );
}
