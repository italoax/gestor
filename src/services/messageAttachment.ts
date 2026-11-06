import {
  MAX_MESSAGE_ATTACHMENT_SIZE,
  messageAttachmentFormat,
} from '../shared/messageAttachments.ts';
import { validStatusMedia } from './statusMedia.ts';

export interface MessageAttachmentFile {
  mimetype: string;
  originalname: string;
  buffer: Buffer;
}

export function prepareMessageAttachment(
  file: MessageAttachmentFile,
  selectedType: string,
) {
  if (!Buffer.isBuffer(file.buffer) || !file.buffer.length)
    return { error: 'O arquivo está vazio. Selecione outro anexo.' } as const;
  if (file.buffer.length > MAX_MESSAGE_ATTACHMENT_SIZE)
    return { error: 'Arquivo muito grande (máx. 5 MB).' } as const;
  const format = messageAttachmentFormat(file.mimetype, file.originalname);
  if (!format || format.type !== selectedType)
    return {
      error: 'O arquivo não corresponde ao tipo de anexo selecionado.',
    } as const;

  const data = file.buffer;
  const starts = (bytes: number[]) =>
    data.subarray(0, bytes.length).equals(Buffer.from(bytes));
  const mp4 = () =>
    data.length >= 16 &&
    data.toString('ascii', 4, 8) === 'ftyp' &&
    data.readUInt32BE(0) >= 16 &&
    data.readUInt32BE(0) <= data.length;
  let valid = false;
  if (format.type === 'image' || format.type === 'video') {
    valid =
      format.mime === 'video/quicktime'
        ? mp4()
        : validStatusMedia({ mimetype: format.mime, buffer: data });
  } else if (format.type === 'audio') {
    switch (format.mime) {
      case 'audio/mpeg':
        valid =
          data.toString('ascii', 0, 3) === 'ID3' ||
          (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
        break;
      case 'audio/ogg':
        valid = data.toString('ascii', 0, 4) === 'OggS';
        break;
      case 'audio/wav':
        valid =
          data.toString('ascii', 0, 4) === 'RIFF' &&
          data.toString('ascii', 8, 12) === 'WAVE';
        break;
      case 'audio/aac':
        valid =
          data.length >= 2 && data[0] === 0xff && (data[1] & 0xf6) === 0xf0;
        break;
      case 'audio/mp4':
        valid = mp4();
        break;
    }
  } else if (format.mime === 'application/pdf') {
    valid = data.toString('ascii', 0, 5) === '%PDF-';
  } else if (format.mime.startsWith('text/')) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
      valid = !data.includes(0);
    } catch {
      /* Invalid text file. */
    }
  } else if (format.mime.includes('openxmlformats')) {
    valid = starts([0x50, 0x4b, 0x03, 0x04]);
  } else {
    valid = starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (!valid)
    return { error: 'Arquivo inválido. Selecione outro anexo.' } as const;
  return {
    type: format.type,
    dataUrl: `data:${format.mime};base64,${data.toString('base64')}`,
  } as const;
}
