import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@nimiplatform/kit/ui';
import { i18nText } from '../../i18n/index.js';

// @nimi-authority: rule.parentos.advs.r003
function AdvisorRuntimeGateAction({ size }: { size: 'sm' | 'lg' }) {
  return (
    <Button asChild tone="primary" size={size} className="rounded-full">
      <Link to="/settings/ai">
        {i18nText('Advisor.runtimeGate.action')}
        <ArrowRight size={size === 'lg' ? 16 : 14} aria-hidden="true" />
      </Link>
    </Button>
  );
}

/** Empty-state variant: tells the parent what the advisor offers before asking them to connect. */
export function AdvisorRuntimeGateHero({ childName }: { childName: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="advisor-gate-orb advisor-gate-orb--halo mb-7 flex h-16 w-16 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <Sparkles size={28} strokeWidth={1.8} />
      </span>
      <h2 className="text-[22px] font-bold leading-snug tracking-tight text-[var(--nimi-text-primary)]">
        {i18nText('Advisor.runtimeGate.title', { childName })}
      </h2>
      <p className="mt-3 max-w-[320px] break-keep break-words text-balance text-[14px] leading-6 text-[var(--nimi-text-secondary)]">
        {i18nText('Advisor.runtimeGate.description')}
      </p>
      <div className="mt-7">
        <AdvisorRuntimeGateAction size="lg" />
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[var(--nimi-text-muted)]">
        {i18nText('Advisor.runtimeGate.hint')}
      </p>
    </div>
  );
}

/** Inline variant: takes the place of the composer or the starter questions. */
export function AdvisorRuntimeGateNotice() {
  return (
    <div className="advisor-gate-inline flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pl-3 pr-2.5">
      <span
        className="advisor-gate-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <Sparkles size={16} strokeWidth={1.9} />
      </span>
      <p className="min-w-[10rem] flex-1 break-keep break-words text-[14px] leading-6 text-[var(--nimi-text-primary)]">
        {i18nText('Advisor.runtimeGate.message')}
      </p>
      <div className="ml-auto">
        <AdvisorRuntimeGateAction size="sm" />
      </div>
    </div>
  );
}
