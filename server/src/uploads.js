import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { v4 as uuid } from 'uuid';

export function createUploadMiddleware(baseDir) {
  const uploadsDir = path.join(baseDir, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  });

  async function saveUploadedImage(file) {
    if (!file?.buffer?.length) {
      throw new Error('No image file provided');
    }

    const detected = await fileTypeFromBuffer(file.buffer);
    const allowed = new Map([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/gif', '.gif'],
      ['image/webp', '.webp'],
    ]);

    if (!detected || !allowed.has(detected.mime)) {
      throw new Error('Uploaded file content is not a supported image');
    }

    const filename = `${uuid()}${allowed.get(detected.mime)}`;
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    return { filename, url: `/uploads/${filename}` };
  }

  return { uploadsDir, upload, saveUploadedImage };
}
