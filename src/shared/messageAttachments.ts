export const MAX_MESSAGE_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export type MessageAttachmentType = 'image' | 'video' | 'audio' | 'document';

const formats: [MessageAttachmentType, string, string[]][] = [
  ['image', 'image/jpeg', ['jpg', 'jpeg']],
  ['image', 'image/png', ['png']],
  ['image', 'image/gif', ['gif']],
  ['image', 'image/webp', ['webp']],
  ['video', 'video/mp4', ['mp4', 'm4v']],
  ['video', 'video/webm', ['webm']],
  ['video', 'video/quicktime', ['mov']],
  ['audio', 'audio/mpeg', ['mp3']],
  ['audio', 'audio/ogg', ['ogg', 'opus']],
  ['audio', 'audio/wav', ['wav']],
  ['audio', 'audio/aac', ['aac']],
  ['audio', 'audio/mp4', ['m4a']],
  ['document', 'application/pdf', ['pdf']],
  ['document', 'text/plain', ['txt']],
  ['document', 'text/csv', ['csv']],
  ['document', 'application/msword', ['doc']],
  ['document', 'application/vnd.ms-excel', ['xls']],
  ['document', 'application/vnd.ms-powerpoint', ['ppt']],
  [
    'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ['docx'],
  ],
  [
    'document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ['xlsx'],
  ],
  [
    'document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ['pptx'],
  ],
];
const aliases: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-m4a': 'audio/mp4',
  'application/ogg': 'audio/ogg',
};

export function messageAttachmentFormat(mime: string, filename: string) {
  const raw = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const canonical = aliases[raw] || raw;
  const extension = String(filename || '')
    .split('.')
    .at(-1)
    ?.toLowerCase();
  const match = formats.find(([, type, extensions]) =>
    canonical && canonical !== 'application/octet-stream'
      ? type === canonical
      : extensions.includes(extension || ''),
  );
  return match ? { type: match[0], mime: match[1] } : null;
}

export function messageAttachmentAccept(type: string) {
  return formats
    .filter(([kind]) => kind === type)
    .flatMap(([, mime, extensions]) => [
      mime,
      ...extensions.map((ext) => `.${ext}`),
    ])
    .join(',');
}
