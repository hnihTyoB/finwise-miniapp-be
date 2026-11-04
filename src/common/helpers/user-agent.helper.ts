import crypto from 'crypto';

/**
 * Parses raw User-Agent string to a friendly format (e.g. Chrome trên Windows)
 * Áp dụng giới hạn độ dài ký tự chống cạn kiệt bộ nhớ / CPU.
 */
export function parseUserAgent(uaString: string | undefined): string {
  if (!uaString || typeof uaString !== 'string') return 'Thiết bị không xác định';

  const boundedUa = uaString.slice(0, 512);
  let os = 'Hệ điều hành không xác định';
  let browser = 'Trình duyệt không xác định';

  const uaLower = boundedUa.toLowerCase();

  // Parse OS
  if (uaLower.includes('windows')) {
    os = 'Windows';
  } else if (uaLower.includes('macintosh') || uaLower.includes('mac os x')) {
    os = 'macOS';
  } else if (uaLower.includes('iphone') || uaLower.includes('ipad') || uaLower.includes('ipod')) {
    os = 'iOS';
  } else if (uaLower.includes('android')) {
    os = 'Android';
  } else if (uaLower.includes('linux')) {
    os = 'Linux';
  }

  // Parse Browser
  if (uaLower.includes('zalo')) {
    browser = 'Zalo Mini App';
  } else if (uaLower.includes('edg')) {
    browser = 'Edge';
  } else if (uaLower.includes('chrome') && !uaLower.includes('opr') && !uaLower.includes('opios')) {
    browser = 'Chrome';
  } else if (uaLower.includes('safari') && !uaLower.includes('chrome') && !uaLower.includes('crios')) {
    browser = 'Safari';
  } else if (uaLower.includes('firefox') || uaLower.includes('fxios')) {
    browser = 'Firefox';
  } else if (uaLower.includes('opera') || uaLower.includes('opr')) {
    browser = 'Opera';
  }

  return `${browser} trên ${os}`;
}

/**
 * Sinh Device Hash từ raw User-Agent string bằng SHA-256 thay thế MD5 đã lỗi thời.
 */
export function generateDeviceHash(uaString: string | undefined): string {
  const cleanUa = typeof uaString === 'string' ? uaString.slice(0, 512) : 'unknown';
  return crypto.createHash('sha256').update(cleanUa).digest('hex').slice(0, 32);
}
