import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@nimiplatform/kit/ui';
import { i18nText } from '../../i18n/index.js';

// @nimi-authority: rule.parentos.advs.r003
export function AdvisorRuntimeGateNotice() {
  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] leading-6 text-amber-800">
          {i18nText('Advisor.runtimeGate.message')}
        </p>
        <Button asChild tone="secondary" size="sm">
          <Link to="/settings/ai" className="inline-flex items-center gap-1.5">
            <Sparkles size={14} aria-hidden="true" />
            {i18nText('Advisor.runtimeGate.action')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
