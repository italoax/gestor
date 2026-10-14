import multer from 'multer';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const mt = String(file.mimetype || '').toLowerCase();
    if (mt.startsWith('image/') || mt.startsWith('video/'))
      return cb(null, true);
    cb(new Error('Arquivo deve ser imagem ou vídeo.'));
  },
});
function uploadOrFlash(req, res, next) {
  upload.single('media_file')(req, res, (err) => {
    if (!err) return next();
    const msg = err instanceof Error ? err.message : String(err);
    const fmt = msg.includes('File too large')
      ? 'Arquivo muito grande (máx 5 MB).'
      : msg;
    req.flash('error', fmt);
    return res.redirect('/status');
  });
}
export const statusUploadMiddleware = uploadOrFlash;
