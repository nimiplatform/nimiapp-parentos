import {
  convertShellFileSrc,
  invoke as invokeShellCommand,
  type JsonValue,
} from '@nimiplatform/kit/shell/renderer/bridge';

export type ParentOSShellCommandExecutor = {
  readonly invoke: <T = unknown>(command: string, payload?: unknown) => Promise<T>;
  readonly convertFileSrc: (filePath: string) => string;
};

let shellCommandExecutor: ParentOSShellCommandExecutor | null = null;

export function bindParentOSShellCommandExecutor(
  executor: ParentOSShellCommandExecutor | null,
): void {
  shellCommandExecutor = executor;
}

export async function invoke<T = unknown>(
  command: string,
  payload: unknown = {},
): Promise<T> {
  if (shellCommandExecutor) {
    return await shellCommandExecutor.invoke<T>(command, payload);
  }
  return await invokeShellCommand(command, payload as JsonValue) as T;
}

export function convertFileSrc(filePath: string): string {
  if (shellCommandExecutor) {
    return shellCommandExecutor.convertFileSrc(filePath);
  }
  return convertShellFileSrc(filePath);
}
