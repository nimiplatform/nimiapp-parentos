import {
  convertShellFileSrc,
  invoke as invokeShellCommand,
  type JsonValue,
} from '@nimiplatform/kit/shell/renderer/bridge';

export async function invoke<T = unknown>(
  command: string,
  payload: unknown = {},
): Promise<T> {
  return await invokeShellCommand(command, payload as JsonValue) as T;
}

export function convertFileSrc(filePath: string): string {
  return convertShellFileSrc(filePath);
}
