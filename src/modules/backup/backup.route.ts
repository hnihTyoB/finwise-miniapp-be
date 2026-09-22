import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { backupController } from './backup.controller';

const router = Router();

// Hỗ trợ upload file sao lưu JSON lên đến 50MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});

router.use(authMiddleware);

// Endpoint xuất file sao lưu
router.get('/export', (req, res, next) => backupController.exportBackup(req, res, next));
router.post('/export', (req, res, next) => backupController.exportBackup(req, res, next));

// Endpoint phân tích & xem trước file sao lưu (Step 2 Preview)
router.post('/preview', upload.single('file'), (req, res, next) =>
  backupController.previewBackup(req, res, next),
);

// Endpoint thực hiện nạp & hợp nhất dữ liệu (Step 4 Execute)
router.post('/import', upload.single('file'), (req, res, next) =>
  backupController.importBackup(req, res, next),
);

export default router;
