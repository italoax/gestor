import multer from 'multer';
import type { Request, Response } from 'express';
import { MAX_MESSAGE_ATTACHMENT_SIZE } from '../shared/messageAttachments.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MESSAGE_ATTACHMENT_SIZE,
    files: 1,
    fields: 80,
    parts: 81,
    fieldSize: 64 * 1024,
  },
}).single('media_file');

export function readClientMessageUpload(
  request: Request,
  response: Response,
): Promise<void> {
  return new Promise((resolve, reject) => {
    upload(request, response, (error) => {
      if (!error) return resolve();
      reject(
        new Error(
          error instanceof multer.MulterError &&
            error.code === 'LIMIT_FILE_SIZE'
            ? 'Arquivo muito grande (máx. 5 MB).'
            : 'Não foi possível receber o anexo. Selecione um único arquivo de até 5 MB.',
        ),
      );
    });
  });
}
