import { i18nText } from '../../i18n/index.js';
import parentosLogoUrl from '../../../../../src-tauri/icons/icon.png';

export function BrandHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={parentosLogoUrl}
        alt={i18nText('App.logoAlt')}
        draggable={false}
        className="h-8 w-8 select-none rounded-[9px] object-contain"
      />
      <span className="text-[19px] font-semibold tracking-[-0.01em] text-[var(--nimi-text-primary)]">
        ParentOS
      </span>
    </div>
  );
}
