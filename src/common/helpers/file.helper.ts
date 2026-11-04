import path from 'path';
import fs from 'fs';
import { AppError } from '../errors/app-error';
import { ERROR_CODE } from '../errors/error-code';

export function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Xây dựng đường dẫn file export an toàn chống Path Traversal (CWE-22).
 * Trích xuất an toàn basename và đảm bảo đường dẫn chuẩn hóa luôn nằm bên trong exportDir.
 */
export function buildExportFilePath(exportDir: string, fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    throw new AppError('Invalid export file name', 400, ERROR_CODE.VALIDATION_ERROR);
  }

  // Detect directory traversal or invalid path characters explicitly
  if (
    fileName.includes('..') ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    fileName === '.' ||
    /[\0\r\n]/.test(fileName)
  ) {
    throw new AppError('Invalid export file name: directory traversal detected', 400, ERROR_CODE.VALIDATION_ERROR);
  }

  const resolvedBaseDir = path.resolve(exportDir);
  const resolvedPath = path.resolve(resolvedBaseDir, fileName);

  // Path containment check: ensure resolvedPath is strictly inside resolvedBaseDir
  if (!resolvedPath.startsWith(resolvedBaseDir + path.sep) && resolvedPath !== resolvedBaseDir) {
    throw new AppError('Path traversal detected outside target directory', 403, ERROR_CODE.VALIDATION_ERROR);
  }

  return resolvedPath;
}

export function getFileSizeBytes(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Xóa file an toàn với kiểm tra giới hạn thư mục tùy chọn chống xóa file tùy ý.
 */
export function deleteFile(filePath: string, allowedBaseDir?: string): void {
  try {
    if (!filePath || typeof filePath !== 'string') return;
    const resolvedPath = path.resolve(filePath);

    if (allowedBaseDir) {
      const resolvedBase = path.resolve(allowedBaseDir);
      if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
        return; // Chặn xóa ngoài phạm vi cho phép
      }
    }

    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }
  } catch {
    // ignore
  }
}

