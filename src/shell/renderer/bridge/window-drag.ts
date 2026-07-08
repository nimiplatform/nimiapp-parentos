import {
  hasNimiShellRuntime,
  startWindowDrag,
} from '@nimiplatform/kit/shell/renderer/bridge';

export async function startParentosWindowDrag(): Promise<void> {
  if (!hasNimiShellRuntime()) {
    return;
  }

  try {
    await startWindowDrag();
  } catch {
    // Dragging is best-effort and should not break interaction.
  }
}
