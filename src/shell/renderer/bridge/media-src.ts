import { convertFileSrc } from '@tauri-apps/api/core';

export function toMediaSrc(filePath: string) {
  return convertFileSrc(filePath);
}
