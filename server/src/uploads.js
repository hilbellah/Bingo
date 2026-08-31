import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { v4 as uuid } from 'uuid';

// Where uploaded images live.
//
// The default used to be server/uploads — inside the deployed source tree,
// which Render rebuilds from scratch on every deploy. Anything uploaded
// through the admin (announcement images, event images, and now website event
// flyers) silently vanished at the next deploy, leaving broken images on the
// booking site and, once flyers are published to wolastoqcasino.ca, on the
// marketing site too.
//
// So: prefer the Render persistent disk mounted at /var/data. UPLOADS_DIR
// overrides it explicitly; the legacy in-tree path stays readable so files
// uploaded before this change still resolve.
export function resolveUploadDirs(baseDir) {
  const legacyDir = path.join(baseDir, '..', 'uploads');
  const configured = (process.env.UPLOADS_DIR || '').trim();

  let uploadsDir = legacyDir;
  if (configured) {
    uploadsDir = path.resolve(configured);
  } else if (fs.existsSync('/var/data')) {
    uploadsDir = path.join('/var/data', 'uploads');
  }

  return { uploadsDir, legacyDir };
}

/**
 * One-time copy of any pre-existing in-tree uploads onto the persistent disk,
 * so URLs handed out before the move keep working after it.
 */
function adoptLegacyUploads(uploadsDir, legacyDir) {
  if (uploadsDir === legacyDir || !fs.existsSync(legacyDir)) return 0;
  let copied = 0;
  for (const name of fs.readdirSync(legacyDir)) {
    const from = path.join(legacyDir, name);
    const to = path.join(uploadsDir, name);
    try {
      if (!fs.statSync(from).isFile() || fs.existsSync(to)) continue;
      fs.copyFileSync(from, to);
      copied++;
    } catch (err) {
      console.warn('[uploads] could not adopt legacy file', name, err?.message);
    }
  }
  if (copied > 0) console.log(`[uploads] copied ${copied} legacy upload(s) to ${uploadsDir}`);
  return copied;
}

export function createUploadMiddleware(baseDir) {
  const { uploadsDir, legacyDir } = resolveUploadDirs(baseDir);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  adoptLegacyUploads(uploadsDir, legacyDir);

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

  return { uploadsDir, legacyUploadsDir: legacyDir, upload, saveUploadedImage };
}
