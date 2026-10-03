import { Button } from '@nimiplatform/kit/ui';
import { SmartRecognizeButton } from './health-record-modal-shell.js';

export function DentalHistoryActions({
  show,
  onScan,
  onAdd,
  scanTitle,
  scanLabel,
  addLabel,
}: {
  show: boolean;
  onScan: () => void;
  onAdd: () => void;
  scanTitle: string;
  scanLabel: string;
  addLabel: string;
}) {
  if (!show) return null;
  return (
    <div className="flex items-center justify-end gap-2 mb-3">
      <SmartRecognizeButton onClick={onScan} title={scanTitle}>
        {scanLabel}
      </SmartRecognizeButton>
      <Button
        onClick={onAdd}
        tone="primary"
        size="md"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        {addLabel}
      </Button>
    </div>
  );
}
