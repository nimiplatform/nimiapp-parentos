import { ArrowRight } from 'lucide-react';
import { Button } from '@nimiplatform/kit/ui';
import { AdvisorHero } from './advisor-mascot.js';
import { AdvisorRuntimeGateHero } from './advisor-runtime-gate.js';
import { i18nText } from '../../i18n/index.js';


export type AdvisorEmptyStateProps = {
  childName: string;
  runtimeAvailable: boolean | null;
  onNewConversation: () => void;
};

export function AdvisorEmptyState({ childName, runtimeAvailable, onNewConversation }: AdvisorEmptyStateProps) {
  if (runtimeAvailable === false) {
    return <AdvisorRuntimeGateHero childName={childName} />;
  }
  return (
    <AdvisorHero
      title={i18nText('Advisor.empty.title')}
      description={i18nText('Advisor.empty.description', { childName })}
      // Offer the start action only once the runtime check has passed.
      action={runtimeAvailable ? (
        <Button
          tone="primary"
          size="lg"
          className="rounded-full"
          onClick={onNewConversation}
          trailingIcon={<ArrowRight size={16} aria-hidden="true" />}
        >
          {i18nText('Advisor.empty.action')}
        </Button>
      ) : undefined}
    />
  );
}
