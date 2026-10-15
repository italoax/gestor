import multer from 'multer';
import {
  STATUS_MEDIA_TYPES,
  validStatusMedia,
} from '../services/statusMedia.ts';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 20,
    parts: 21,
    fieldSize: 64 * 1024,
  },
  fileFilter(_req, file, cb) {
    const mt = String(file.mimetype || '').toLowerCase();
    if (STATUS_MEDIA_TYPES.has(mt)) return cb(null, true);
    cb(new Error('Arquivo deve ser imagem ou vídeo.'));
  },
});
function uploadOrFlash(req, res, next) {
  upload.single('media_file')(req, res, (err) => {
    if (!err && (!req.file || validStatusMedia(req.file))) return next();
    const fmt =
      err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo muito grande (máx 5 MB).'
        : 'Arquivo inválido. Envie uma imagem JPEG, PNG, GIF ou WebP, ou um vídeo MP4 ou WebM (máx 5 MB).';
    req.flash('error', fmt);
    return res.redirect('/status');
  });
}
export const statusUploadMiddleware = uploadOrFlash;
