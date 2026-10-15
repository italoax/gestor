const MAX_SIZE = 5 * 1024 * 1024;
export const STATUS_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
]);

// O MIME enviado pelo navegador não comprova o formato do arquivo.
// Esta checagem de assinatura não substitui decodificação nem análise antimalware.
export function validStatusMedia(file: { mimetype: string; buffer: Buffer }) {
  const data = file.buffer;
  if (!Buffer.isBuffer(data) || data.length < 12 || data.length > MAX_SIZE)
    return false;
  switch (file.mimetype.toLowerCase()) {
    case 'image/jpeg':
      return data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/png':
      return data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6));
    case 'image/webp':
      return (
        data.toString('ascii', 0, 4) === 'RIFF' &&
        data.toString('ascii', 8, 12) === 'WEBP'
      );
    case 'video/mp4':
      return (
        data.toString('ascii', 4, 8) === 'ftyp' &&
        data.readUInt32BE(0) >= 16 &&
        data.readUInt32BE(0) <= data.length
      );
    case 'video/webm':
      return (
        data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
        data.subarray(0, 4096).includes(Buffer.from('webm'))
      );
    default:
      return false;
  }
}
