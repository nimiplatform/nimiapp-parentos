import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BackLink,
  PageDetailLayout,
  type PageDetailLayoutWidth,
} from '@nimiplatform/kit/ui';
import { ParentosAiMascotButton } from '../parentos-ai-mascot-button.js';

export type ProfileDetailShellProps = {
  title: ReactNode;
  width?: PageDetailLayoutWidth;
  actions?: ReactNode;
  subnav?: ReactNode;
  aiSummary?: ReactNode;
  backTo?: string;
  backLabel?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ProfileDetailShell({
  title,
  width = 'lg',
  actions,
  subnav,
  aiSummary,
  backTo = '/profile',
  backLabel,
  children,
  className,
}: ProfileDetailShellProps) {
  const { t } = useTranslation();
  const [aiOpen, setAiOpen] = useState(false);
  const label = backLabel ?? t('Profile.rich.common.backToProfile');
  const aiLabel = aiOpen
    ? t('Profile.rich.common.collapseAnalysis')
    : t('Profile.rich.common.aiAnalysis');
  const composedActions = aiSummary ? (
    <>
      <ParentosAiMascotButton
        thinking={false}
        onClick={() => setAiOpen((open) => !open)}
        label={aiLabel}
        size={32}
      />
      {actions}
    </>
  ) : actions;
  return (
    <PageDetailLayout
      width={width}
      title={title}
      back={
        <BackLink asChild>
          <Link to={backTo}>{label}</Link>
        </BackLink>
      }
      actions={composedActions}
      subnav={subnav}
      beforeContent={aiSummary && aiOpen ? aiSummary : undefined}
      className={className}
    >
      {children}
    </PageDetailLayout>
  );
}
