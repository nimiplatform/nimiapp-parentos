import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Baby,
  BellRing,
  Bot,
  ChevronRight,
  Database,
  Info,
  Sprout,
  Upload,
  UserRound,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Surface, buttonVariants, cn } from '@nimiplatform/kit/ui';
import { useAppStore } from '../../app-shell/app-store.js';
import { logoutParentOSRuntimeAccount } from '../auth/parentos-auth-adapter.js';
import { seedMockData, type SeedProgress } from '../../infra/mock-seed.js';
import { syncParentOSLocalDataScope } from '../../infra/parentos-bootstrap.js';

type SettingsSection = {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly desc: string;
  readonly iconClassName: string;
};

const sections: readonly SettingsSection[] = [
  {
    to: '/settings/children',
    icon: Baby,
    label: '孩子管理',
    desc: '添加、编辑、删除孩子档案',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]',
  },
  {
    to: '/settings/nurture-mode',
    icon: Sprout,
    label: '养育模式',
    desc: '轻松养 / 均衡养 / 进阶养，可按领域混合配置',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]',
  },
  {
    to: '/settings/reminders',
    icon: BellRing,
    label: '提醒管理',
    desc: '查看和管理已自定义频率的提醒',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]',
  },
  {
    to: '/settings/ai',
    icon: Bot,
    label: 'AI 模型设置',
    desc: '配置对话、语音转写等 AI 能力使用的模型',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]',
  },
];

const infoCards = [
  {
    icon: ShieldCheck,
    label: '数据与隐私',
    desc: '所有数据存储在本地，不上传至云端',
  },
  {
    icon: Info,
    label: '关于',
    desc: '成长底稿 v0.1.0 · AI 驱动的儿童成长操作系统',
  },
] as const;

export default function SettingsPage() {
  const authUser = useAppStore((s) => s.auth.user);
  const authStatus = useAppStore((s) => s.auth.status);
  const clearAuth = useAppStore((s) => s.clearAuthSession);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [seedLabel, setSeedLabel] = useState('');
  const [seedResult, setSeedResult] = useState('');

  const handleSeedMock = async () => {
    setSeedStatus('seeding');
    setSeedLabel('');
    setSeedResult('');
    const result = await seedMockData((p: SeedProgress) => {
      setSeedLabel(`${p.label} ${p.done}/${p.total}`);
    });
    setSeedStatus(result.ok ? 'done' : 'error');
    setSeedResult(result.summary);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    // PO-SHELL-008: revoke through Runtime account custody (single source of
    // truth). Local auth projection is cleared only after Runtime accepts logout.
    setLogoutError(null);
    try {
      await logoutParentOSRuntimeAccount();
      clearAuth();
      void syncParentOSLocalDataScope(null);
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : String(error || '退出登录失败'));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-[72px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--nimi-text-primary)]">设置</h1>

        {authStatus === 'authenticated' && authUser ? (
          <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-6 flex items-center gap-4 parentos-radius-xl p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_14%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
              <UserRound size={19} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[16px] font-semibold text-[var(--nimi-text-primary)]">
                {authUser.displayName || '未命名用户'}
              </h3>
              {authUser.email ? (
                <p className="mt-0.5 truncate text-[13px] text-[var(--nimi-text-muted)]">{authUser.email}</p>
              ) : null}
              {logoutError ? (
                <p className="mt-2 text-[13px] leading-snug text-[var(--nimi-status-danger)]">{logoutError}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={cn(
                buttonVariants({ tone: 'ghost', size: 'sm' }),
                'shrink-0 border border-[color-mix(in_srgb,var(--nimi-status-danger)_40%,var(--nimi-border-subtle))] text-[var(--nimi-status-danger)] disabled:opacity-50',
              )}
            >
              {loggingOut ? '退出中...' : '退出登录'}
            </button>
          </Surface>
        ) : null}

        <div className="mb-6 grid gap-3">
          {sections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <Surface
                key={section.to}
                as={Link}
                to={section.to}
                tone="card"
                material="solid"
                elevation="base"
                padding="lg"
                interactive
                className="flex items-center gap-4 parentos-radius-xl p-5"
              >
                <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center parentos-radius-14', section.iconClassName)}>
                  <SectionIcon size={19} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">{section.label}</h3>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{section.desc}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--nimi-text-muted)]" aria-hidden="true" />
              </Surface>
            );
          })}
        </div>

        <p className="mb-3 text-[13px] font-semibold text-[var(--nimi-text-muted)]">其他</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {infoCards.map((card) => {
            const InfoIcon = card.icon;
            return (
              <Surface key={card.label} tone="card" material="solid" elevation="base" padding="md" className="parentos-radius-xl p-4">
                <div className="mb-3 flex h-9 w-9 items-center justify-center parentos-radius-10 bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)]">
                  <InfoIcon size={17} aria-hidden="true" />
                </div>
                <h3 className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{card.label}</h3>
                <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{card.desc}</p>
              </Surface>
            );
          })}
        </div>

        {import.meta.env.DEV ? (
          <div className="mt-6">
            <p className="mb-3 text-[13px] font-semibold text-[var(--nimi-text-muted)]">Dev Tools</p>
            <Surface tone="card" material="solid" elevation="base" padding="lg" className="parentos-radius-xl p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14 bg-[color-mix(in_srgb,var(--nimi-status-info)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]">
                  <Database size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">
                    {seedStatus === 'seeding' ? `导入中... ${seedLabel}` : '导入测试数据'}
                  </h3>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">
                    {seedStatus === 'done' ? seedResult
                      : seedStatus === 'error' ? seedResult
                      : '从 mock fixtures 导入 3 个孩子及全部测试数据到 SQLite'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSeedMock}
                  disabled={seedStatus === 'seeding'}
                  className={cn(
                    buttonVariants({ tone: seedStatus === 'error' ? 'ghost' : 'primary', size: 'sm' }),
                    'shrink-0 gap-1.5 disabled:opacity-50',
                    seedStatus === 'error' && 'border border-[color-mix(in_srgb,var(--nimi-status-danger)_40%,var(--nimi-border-subtle))] text-[var(--nimi-status-danger)]',
                  )}
                >
                  <Upload size={14} aria-hidden="true" />
                  {seedStatus === 'seeding' ? '导入中...'
                    : seedStatus === 'done' ? '已完成'
                    : seedStatus === 'error' ? '重试'
                    : '导入'}
                </button>
              </div>
            </Surface>
          </div>
        ) : null}
      </div>
    </div>
  );
}
