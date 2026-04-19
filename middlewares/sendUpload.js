import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/**
 * Parses multipart body for POST /api/send when Content-Type is multipart.
 * JSON requests skip multer (body already from express.json).
 */
export function sendUploadMaybe(req, res, next) {
  if (req.is('multipart/form-data')) {
    return upload.single('file')(req, res, next);
  }
  next();
}
