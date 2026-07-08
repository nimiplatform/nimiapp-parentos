import { invoke } from './shell-command.js';

export interface SavedChildAvatar {
  path: string;
}

export function saveChildAvatar(params: {
  childId: string;
  mimeType: string;
  imageBase64: string;
}) {
  return invoke<SavedChildAvatar>('save_child_avatar', params);
}
