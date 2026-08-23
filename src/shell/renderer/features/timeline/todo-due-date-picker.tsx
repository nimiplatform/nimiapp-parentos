import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DatePickerPanel,
  clampToMax,
  formatDateValue,
  parseDateValue,
} from '@nimiplatform/kit/ui';
import { getLocalToday } from '../../engine/reminder-engine.js';
import { i18nText } from '../../i18n/index.js';

const CALENDAR_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

function formatChipLabel(dueDate: string): string {
  const today = getLocalToday();
  if (!dueDate) return i18nText('Timeline.customTodo.due.today');
  if (dueDate === today) return i18nText('Timeline.customTodo.due.today');
  const d = parseDateValue(dueDate);
  return i18nText('Timeline.relativeDateFallback', {
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
}

type TodoDueDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  maxDate?: string;
};

export function TodoDueDatePicker({ value, onChange, maxDate = '2100-12-31' }: TodoDueDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const parsedMax = maxDate ? parseDateValue(maxDate) : null;
  const today = getLocalToday();
  const active = Boolean(value) && value !== today;
  // Empty value means "today" (see formatChipLabel); DatePickerPanel would
  // otherwise default its draft selection to maxDate.
  const panelValue = value || today;

  useEffect(() => {
    if (!mounted || open) return;
    const timer = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(timer);
  }, [mounted, open]);

  useEffect(() => {
    if (!mounted) return;
    const handler = (event: MouseEvent) => {
      if (
        wrapRef.current && !wrapRef.current.contains(event.target as Node) &&
        panelRef.current && !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escHandler);
    };
  }, [mounted]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  };

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors hover:bg-[#f3f4f6]"
        style={{
          color: active ? '#3BB88A' : '#64748b',
          background: active ? 'rgba(59, 184, 138, 0.10)' : 'transparent',
          border: 'none',
        }}
      >
        {CALENDAR_ICON}
        <span>{formatChipLabel(value)}</span>
      </button>

      {mounted && createPortal(
        <div data-todo-composer-popover>
          <DatePickerPanel
            ref={panelRef}
            anchorRef={wrapRef}
            open={open}
            value={panelValue}
            maxDate={parsedMax}
            onChange={(next) => {
              const clamped = clampToMax(parseDateValue(next), parsedMax);
              onChange(formatDateValue(clamped));
              setOpen(false);
            }}
            onClear={active ? () => { onChange(''); setOpen(false); } : undefined}
            onClose={() => setOpen(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
