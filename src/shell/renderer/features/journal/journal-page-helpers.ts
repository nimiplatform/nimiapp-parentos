import type { JournalEntryRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


/* ── Types ── */

export type SceneTab = 'quick' | 'deep' | 'review';
export type CaptureMode = 'text' | 'voice';
export type VoiceDraftStatus =
  | 'idle'
  | 'recording'
  | 'ready'
  | 'transcribing'
  | 'transcribed'
  | 'transcription-failed';
export type TagSuggestionStatus = 'idle' | 'suggesting' | 'ready' | 'failed';
export type KeepsakeReason =
  | 'commemorative'
  | 'first-time'
  | 'achievement'
  | 'persistence'
  | 'character'
  | 'family-moment'
  | 'other';

export interface VoiceDraft {
  status: VoiceDraftStatus;
  blob: Blob | null;
  mimeType: string | null;
  previewUrl: string | null;
  transcript: string;
  error: string | null;
  /** Captured amplitude samples (0-1) for the static preview waveform. */
  levelSamples: number[];
  /** Recording duration in milliseconds, captured at stop time. */
  durationMs: number;
}

export const EMPTY_VOICE_DRAFT: VoiceDraft = {
  status: 'idle',
  blob: null,
  mimeType: null,
  previewUrl: null,
  transcript: '',
  error: null,
  levelSamples: [],
  durationMs: 0,
};

export interface PhotoDraft {
  file: File;
  previewUrl: string;
}

export const KEEPSAKE_REASON_OPTIONS: Array<{ value: KeepsakeReason; label: string }> = [
  { value: 'commemorative', label: i18nText('Journal.keepsakeReason.commemorative') },
  { value: 'first-time', label: i18nText('Journal.keepsakeReason.firstTime') },
  { value: 'achievement', label: i18nText('Journal.keepsakeReason.achievement') },
  { value: 'persistence', label: i18nText('Journal.keepsakeReason.persistence') },
  { value: 'character', label: i18nText('Journal.keepsakeReason.character') },
  { value: 'family-moment', label: i18nText('Journal.keepsakeReason.familyMoment') },
  { value: 'other', label: i18nText('Journal.keepsakeReason.other') },
];

export function getKeepsakeReasonLabel(reason: KeepsakeReason | null | undefined) {
  return KEEPSAKE_REASON_OPTIONS.find((item) => item.value === reason)?.label ?? null;
}

/* ── Scene config ── */

export const SCENE_TABS: Array<{ key: SceneTab; emoji: string; label: string; sub: string }> = [
  { key: 'quick', emoji: '⚡️', label: i18nText('Journal.scene.quickLabel'), sub: i18nText('Journal.scene.quickSub') },
  { key: 'deep', emoji: '🔍', label: i18nText('Journal.scene.deepLabel'), sub: i18nText('Journal.scene.deepSub') },
  { key: 'review', emoji: '🌙', label: i18nText('Journal.scene.reviewLabel'), sub: i18nText('Journal.scene.reviewSub') },
];

/** Map scene tabs to existing observation mode IDs */
export const SCENE_MODE_MAP: Record<SceneTab, string> = {
  quick: 'quick-capture',
  deep: 'focused-observation',
  review: 'daily-reflection',
};

export type EmojiCategory = 'frequent' | 'smileys' | 'gestures' | 'people' | 'animals' | 'food' | 'activity' | 'objects' | 'symbols';

export interface EmojiCategoryDef {
  key: EmojiCategory;
  icon: string;
  label: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategoryDef[] = [
  {
    key: 'frequent', icon: '🕐', label: i18nText('Journal.emojiCategory.frequent'),
    emojis: [
      '😊', '😂', '🥰', '😍', '🤗', '😢', '😡', '😴',
      '🎉', '👏', '💪', '🌟', '❤️', '🎈', '🎨', '🏃',
      '📚', '🎵', '🧩', '🍼', '🌈', '🦋', '🐱', '🌸',
    ],
  },
  {
    key: 'smileys', icon: '😀', label: i18nText('Journal.emojiCategory.smileys'),
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗',
      '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝',
      '🤑', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔', '🫡',
      '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒',
      '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴',
      '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴',
      '😵', '🤯', '🥳', '🥸', '😎', '🤓', '🧐', '😕',
      '🫤', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺',
      '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
      '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱',
      '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️',
      '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
      '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
      '😾', '🙈', '🙉', '🙊', '💌', '💘', '💝', '💖',
      '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️‍🔥',
      '❤️‍🩹', '❤️', '🩷', '🧡', '💛', '💚', '💙', '🩵',
      '💜', '🤎', '🖤', '🩶', '🤍', '💋', '💯', '💢',
      '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '🗨️',
      '🗯️', '💭', '💤', '🫧',
    ],
  },
  {
    key: 'gestures', icon: '👋', label: i18nText('Journal.emojiCategory.gestures'),
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳',
      '🫴', '🫷', '🫸', '👌', '🤌', '🤏', '✌️', '🤞',
      '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕',
      '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏',
      '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶',
      '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴',
      '👀', '👁️', '👅', '👄', '🫦',
    ],
  },
  {
    key: 'people', icon: '👶', label: i18nText('Journal.emojiCategory.people'),
    emojis: [
      '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔',
      '👩', '🧓', '👴', '👵', '🙍', '🙎', '🙅', '🙆',
      '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️',
      '💂', '🥷', '👷', '🫅', '🤴', '👸', '👳', '👲',
      '🧕', '🤵', '👰', '🤰', '🫃', '🫄', '🤱', '👼',
      '🎅', '🤶', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜',
      '🧝', '🧞', '🧟', '🧌', '💆', '💇', '🚶', '🧍',
      '🧎', '🏃', '💃', '🕺', '🕴️', '👯', '🧖', '🧗',
      '🤸', '⛹️', '🏋️', '🚴', '🚵', '🤼', '🤽', '🤾',
      '🤺', '⛷️', '🏂', '🏌️', '🏄', '🚣', '🏊', '🤹',
      '🧘', '👪', '👨‍👩‍👦', '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '🫂',
    ],
  },
  {
    key: 'animals', icon: '🐶', label: i18nText('Journal.emojiCategory.animals'),
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
      '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸',
      '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦',
      '🐤', '🐣', '🐥', '🪿', '🦆', '🐦‍⬛', '🦅', '🦉',
      '🦇', '🐺', '🐗', '🐴', '🦄', '🫎', '🐝', '🪱',
      '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳',
      '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖',
      '🦕', '🐙', '🦑', '🪼', '🦐', '🦞', '🦀', '🐡',
      '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🪸', '🐊',
      '🐅', '🐆', '🦓', '🫏', '🦍', '🦧', '🦣', '🐘',
      '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃',
      '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐',
      '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶',
      '🪽', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩',
      '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥',
      '🐁', '🐀', '🐿️', '🦔', '🐾', '🐉', '🐲',
      '🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿',
      '☘️', '🍀', '🎍', '🪴', '🎋', '🍃', '🍂', '🍁',
      '🪺', '🪹', '🍄', '🐚', '🪸', '🪨', '🌾', '💐',
      '🌷', '🌹', '🥀', '🪻', '🌺', '🌸', '🌼', '🌻',
      '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗',
      '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍',
      '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️',
      '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅', '🌥️',
      '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️',
      '⛄', '🌬️', '💨', '💧', '💦', '🫧', '☔', '☂️',
      '🌊', '🌫️',
    ],
  },
  {
    key: 'food', icon: '🍎', label: i18nText('Journal.emojiCategory.food'),
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇',
      '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥',
      '🥝', '🍅', '🍆', '🥑', '🥦', '🫑', '🥬', '🥒',
      '🌶️', '🫚', '🧄', '🧅', '🥕', '🌽', '🥔', '🍠',
      '🫘', '🥜', '🌰', '🫒', '🥐', '🍞', '🥖', '🫓',
      '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓',
      '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕',
      '🫔', '🌮', '🌯', '🫕', '🥙', '🧆', '🥚', '🍲',
      '🫗', '🥣', '🥗', '🍿', '🧂', '🥫', '🍱', '🍘',
      '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣',
      '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦪',
      '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁',
      '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛',
      '☕', '🫖', '🍵', '🧃', '🥤', '🧋', '🫙', '🍶',
      '🍺', '🍻', '🥂', '🍷', '🫗', '🥃', '🍸', '🍹',
      '🧊', '🥄', '🍴', '🍽️', '🥢', '🧑‍🍳',
    ],
  },
  {
    key: 'activity', icon: '⚽', label: i18nText('Journal.emojiCategory.activity'),
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
      '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
      '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿',
      '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌',
      '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️',
      '🤺', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽',
      '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉',
      '🏅', '🎖️', '🏵️', '🎗️', '🎪', '🤹', '🎭', '🩰',
      '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘',
      '🎷', '🎺', '🪗', '🎸', '🎻', '🪕', '🎲', '♟️',
      '🎯', '🎳', '🎮', '🎰', '🧩',
    ],
  },
  {
    key: 'objects', icon: '💡', label: i18nText('Journal.emojiCategory.objects'),
    emojis: [
      '👓', '🕶️', '🥽', '🧳', '🌂', '☂️', '🎒', '👑',
      '🧢', '🎩', '💍', '💎', '📱', '💻', '⌨️', '🖥️',
      '🖨️', '🖱️', '💾', '📀', '📷', '📸', '📹', '🎥',
      '📽️', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏰', '⏳',
      '📡', '🔋', '🪫', '🔌', '💡', '🔦', '🕯️', '🪔',
      '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📓',
      '📒', '📃', '📜', '📄', '📰', '🗞️', '📑', '🔖',
      '🏷️', '✉️', '📧', '📨', '📩', '📤', '📥', '📦',
      '📫', '📪', '📬', '📭', '📮', '🗳️', '✏️', '✒️',
      '🖊️', '🖋️', '📝', '💼', '📁', '📂', '🗂️', '📅',
      '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋',
      '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️',
      '🗄️', '🗑️', '🔒', '🔓', '🔏', '🔐', '🔑', '🗝️',
      '🔨', '🪓', '⛏️', '⚒️', '🛠️', '🗡️', '⚔️', '🔫',
      '🪃', '🏹', '🛡️', '🪚', '🔧', '🪛', '🔩', '⚙️',
      '🗜️', '⚖️', '🦯', '🔗', '⛓️', '🪝', '🧰', '🧲',
      '🪜', '🧪', '🧫', '🧬', '🔬', '🔭', '📡', '💉',
      '🩸', '💊', '🩹', '🩼', '🩺', '🩻', '🚪', '🛗',
      '🪞', '🪟', '🛏️', '🛋️', '🪑', '🚽', '🪠', '🚿',
      '🛁', '🪤', '🪒', '🧴', '🧷', '🧹', '🧺', '🧻',
      '🪣', '🧼', '🫧', '🪥', '🧽', '🧯', '🛒', '🚬',
      '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '🪬',
      '💈', '⚗️', '🪄', '🎀', '🎁', '🎈', '🎏', '🎐',
      '🎑', '🧧', '🎃', '🎄', '🎆', '🎇', '🧨', '✨',
      '🎊', '🎉', '🎋', '🎍', '🎎', '🎐', '🎌', '🏮',
    ],
  },
  {
    key: 'symbols', icon: '❤️', label: i18nText('Journal.emojiCategory.symbols'),
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓',
      '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️',
      '🕉️', '☸️', '✡️', '🔯', '🪯', '☯️', '☦️', '🛐',
      '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎',
      '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑',
      '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺',
      '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴',
      '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️',
      '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯',
      '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵',
      '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅',
      '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️',
      '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠',
      'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗',
      '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺',
      '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁', '🔣',
      'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒',
      '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
      '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣',
      '⏏️', '▶️', '⏩', '⏭️', '⏯️', '◀️', '⏪', '⏮️',
      '🔼', '⏫', '🔽', '⏬', '⏸️', '⏹️', '⏺️', '⏏️',
      '🎵', '🎶', '🔀', '🔁', '🔂', '▶️', '⏩', '⏪',
      '🔈', '🔉', '🔊', '🔇', '📣', '📢', '🔔', '🔕',
    ],
  },
];

export const CAPTURE_MODES: CaptureMode[] = ['text', 'voice'];

/* ── Helpers ── */

export function describeVoiceStatus(status: VoiceDraftStatus) {
  switch (status) {
    case 'recording':
      return i18nText('Journal.voiceStatus.recording');
    case 'ready':
      return i18nText('Journal.voiceStatus.ready');
    case 'transcribing':
      return i18nText('Journal.voiceStatus.transcribing');
    case 'transcribed':
      return i18nText('Journal.voiceStatus.transcribed');
    case 'transcription-failed':
      return i18nText('Journal.voiceStatus.transcriptionFailed');
    default:
      return i18nText('Journal.voiceStatus.idle');
  }
}

export function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  });
}

export function blobToBase64(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  });
}

export function parseSelectedTags(selectedTags: string | null) {
  if (!selectedTags) return [];
  try {
    const parsed = JSON.parse(selectedTags) as unknown;
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag)) : [];
  } catch {
    return [];
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Convert an ISO timestamp to a local-time "YYYY-MM-DD" key. */
export function getLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.split('T')[0] ?? iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Convert an ISO timestamp to a local-time "HH:MM" label. */
export function getLocalTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.split('T')[1]?.slice(0, 5) ?? '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function groupEntriesByDate(entries: JournalEntryRow[]): [string, JournalEntryRow[]][] {
  const map = new Map<string, JournalEntryRow[]>();
  for (const e of entries) {
    const d = getLocalDateKey(e.recordedAt);
    const list = map.get(d);
    if (list) list.push(e);
    else map.set(d, [e]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function formatDateLabel(iso: string): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  if (iso === today) return i18nText('Common.relative.today');
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${pad2(y.getMonth() + 1)}-${pad2(y.getDate())}`;
  if (iso === yesterday) return i18nText('Common.relative.yesterday');
  const [, m, d] = iso.split('-');
  return i18nText('Common.date.monthDay', { month: parseInt(m!, 10), day: parseInt(d!, 10) });
}

export function getSceneForMode(modeId: string | null): SceneTab {
  if (modeId === 'focused-observation') return 'deep';
  if (modeId === 'daily-reflection') return 'review';
  return 'quick';
}
