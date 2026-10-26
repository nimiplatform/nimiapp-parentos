// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nimiToast } from '@nimiplatform/kit/ui';
import { ReportActionBar } from './reports-action-bar.js';

describe('report export actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(nimiToast, 'success').mockImplementation(() => 'toast');
    vi.spyOn(nimiToast, 'danger').mockImplementation(() => 'toast');
  });

  it('treats cancelling the native save dialog as cancellation, not success', async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<ReportActionBar onSavePdf={save} onSaveImage={save} onOpenProfessional={vi.fn()} />);
    fireEvent.click(screen.getByText('保存报告'));
    fireEvent.click(screen.getByRole('button', { name: '另存为 PDF' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(nimiToast.success).not.toHaveBeenCalled();
    expect(screen.queryByText('分享所选')).toBeNull();
  });

  it('blocks concurrent exports and only confirms the completed local artifact', async () => {
    let complete!: (saved: boolean) => void;
    const pdf = vi.fn(() => new Promise<boolean>((resolve) => { complete = resolve; }));
    const png = vi.fn().mockResolvedValue(true);
    render(<ReportActionBar onSavePdf={pdf} onSaveImage={png} onOpenProfessional={vi.fn()} />);
    fireEvent.click(screen.getByText('保存报告'));
    fireEvent.click(screen.getByRole('button', { name: '另存为 PDF' }));
    fireEvent.click(screen.getByRole('button', { name: '另存为图片' }));
    expect(png).not.toHaveBeenCalled();
    expect(nimiToast.success).not.toHaveBeenCalled();
    complete(true);
    await waitFor(() => expect(nimiToast.success).toHaveBeenCalledOnce());
  });

  it('keeps failure visible without reporting a saved artifact', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Disk full'));
    render(<ReportActionBar onSavePdf={save} onSaveImage={save} onOpenProfessional={vi.fn()} />);
    fireEvent.click(screen.getByText('保存报告'));
    fireEvent.click(screen.getByRole('button', { name: '另存为 PDF' }));
    await waitFor(() => expect(nimiToast.danger).toHaveBeenCalledWith(expect.stringContaining('Disk full')));
    expect(nimiToast.success).not.toHaveBeenCalled();
  });
});
