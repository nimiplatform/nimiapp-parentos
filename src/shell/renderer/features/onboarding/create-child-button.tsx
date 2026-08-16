import { Plus } from 'lucide-react';
import { i18nText } from '../../i18n/index.js';

type CreateChildButtonProps = {
  onCreateChild: () => void;
};

export function CreateChildButton({ onCreateChild }: CreateChildButtonProps) {
  return (
    <button
      type="button"
      data-testid="parentos-onboarding-create-child"
      onClick={onCreateChild}
      className="parentos-onboarding-cta"
    >
      <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
      {i18nText('Onboarding.cta')}
    </button>
  );
}
