import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@nimiplatform/kit/ui';
import { ParentosAiMascotStatic } from '../profile/parentos-ai-mascot-button.js';
import { AdvisorHero } from './advisor-mascot.js';
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
    <AdvisorHero
      title={i18nText('Advisor.runtimeGate.title', { childName })}
      description={i18nText('Advisor.runtimeGate.description')}
      action={<AdvisorRuntimeGateAction size="lg" />}
      hint={i18nText('Advisor.runtimeGate.hint')}
    />
  );
}

/** Inline variant: takes the place of the composer or the starter questions. */
export function AdvisorRuntimeGateNotice() {
  return (
    <div className="advisor-gate-inline flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pl-3 pr-2.5">
      <ParentosAiMascotStatic size={36} />
      <p className="min-w-[10rem] flex-1 break-keep break-words text-[14px] leading-6 text-[var(--nimi-text-primary)]">
        {i18nText('Advisor.runtimeGate.message')}
      </p>
      <div className="ml-auto">
        <AdvisorRuntimeGateAction size="sm" />
      </div>
    </div>
  );
}
