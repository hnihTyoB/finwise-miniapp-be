import dns from 'dns';
import { AppError } from '../errors/app-error';
import { ERROR_CODE } from '../errors/error-code';

/**
 * Patterns hostname bị chặn tĩnh (kiểm tra sau khi URL được parse):
 *  - localhost                 — loopback name (case-insensitive)
 *  - 127.x.x.x                — IPv4 loopback
 *  - 10.x.x.x                 — RFC-1918 private class A
 *  - 172.16–31.x.x            — RFC-1918 private class B
 *  - 192.168.x.x              — RFC-1918 private class C
 *  - 169.254.x.x              — IPv4 link-local (APIPA / AWS EC2 metadata)
 *  - 0.0.0.0                  — unspecified address
 *  - [::1]                    — IPv6 loopback (Node URL parser preserves brackets)
 *  - [fd…]                    — IPv6 ULA fd::/8
 *  - [::ffff:…]               — IPv4-mapped IPv6
 */
const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^\[fd[0-9a-f]{2}:/i,
  /^\[::ffff:/i,
];

const ALLOWED_SCHEMES: string[] = ['http:', 'https:'];

/**
 * Kiểm tra xem chuỗi có phải là địa chỉ IP (IPv4 hoặc IPv6) không.
 */
export function isIpAddress(str: string): boolean {
  if (!str) return false;
  const clean = str.replace(/^\[|\]$/g, '').trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(clean)) return true;
  if (clean.includes(':')) return true;
  return false;
}

/**
 * Kiểm tra xem một địa chỉ IP (IPv4 hoặc IPv6 dạng chuỗi) có thuộc dải private/reserved/restricted không.
 * Nếu chuỗi không phải là IP address (vd: domain name), trả về false.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return false;

  // Clean brackets if passed
  const cleanIp = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();

  // If not an IP literal (e.g. domain name), return false
  if (!isIpAddress(cleanIp)) {
    return false;
  }

  // IPv4 Checks
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(cleanIp) || (cleanIp.startsWith('::ffff:') && cleanIp.includes('.'))) {
    const ipv4 = cleanIp.startsWith('::ffff:') ? cleanIp.substring(7) : cleanIp;
    const parts = ipv4.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed IP literal is treated as unsafe
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (RFC-1918 Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-Local / APIPA / Cloud Metadata e.g. 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (RFC-1918 Private: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (RFC-1918 Private)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (Shared Address Space / CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved / Future Use)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 Checks
  if (cleanIp.includes(':')) {
    if (cleanIp === '::1' || cleanIp === '::') return true;
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true; // Unique Local Address (ULA) fc00::/7
    if (cleanIp.startsWith('fe80:')) return true; // Link-Local fe80::/10
    if (cleanIp.startsWith('ff')) return true; // Multicast ff00::/8

    // IPv4-mapped IPv6 (e.g., ::ffff:7f00:1 or ::ffff:127.0.0.1)
    if (cleanIp.startsWith('::ffff:')) {
      const rest = cleanIp.slice(7);
      if (rest.includes('.')) {
        return isPrivateIp(rest);
      }
      // If in hex format e.g. ::ffff:c0a8:101
      const hexParts = rest.split(':');
      if (hexParts.length === 2) {
        const p1 = parseInt(hexParts[0], 16);
        const p2 = parseInt(hexParts[1], 16);
        const ipMapped = `${(p1 >> 8) & 255}.${p1 & 255}.${(p2 >> 8) & 255}.${p2 & 255}`;
        return isPrivateIp(ipMapped);
      }
    }
  }

  return false;
}

/**
 * Đồng bộ: Parse và validate URL tĩnh (Scheme + Hostname Patterns).
 * @throws AppError(400, INVALID_URL) nếu URL không hợp lệ hoặc sai scheme
 * @throws AppError(403, PRIVATE_IP_BLOCKED) nếu hostname trỏ vào mạng nội bộ
 */
export function validateUrl(url: string): URL {
  if (!url || typeof url !== 'string') {
    throw new AppError('Invalid URL format', 400, ERROR_CODE.INVALID_URL);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Invalid URL format', 400, ERROR_CODE.INVALID_URL);
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    throw new AppError(
      `Only HTTP and HTTPS URLs are allowed (got "${parsed.protocol}")`,
      400,
      ERROR_CODE.INVALID_URL,
    );
  }

  const hostname = parsed.hostname;

  for (const pattern of PRIVATE_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new AppError(
        'Private, local or link-local IP addresses are not allowed',
        403,
        ERROR_CODE.PRIVATE_IP_BLOCKED,
      );
    }
  }

  // Double check if hostname itself is an IP
  if (isPrivateIp(hostname)) {
    throw new AppError(
      'Private, local or link-local IP addresses are not allowed',
      403,
      ERROR_CODE.PRIVATE_IP_BLOCKED,
    );
  }

  return parsed;
}

export type DnsLookupFn = (hostname: string) => Promise<string[]>;

const defaultDnsLookup: DnsLookupFn = async (hostname: string): Promise<string[]> => {
  const records = await dns.promises.lookup(hostname, { all: true });
  return records.map((r) => r.address);
};

/**
 * Bất đồng bộ: Validate URL toàn diện kết hợp DNS Resolution (Chống DNS Rebinding & Public Domains trỏ về Private IP).
 *
 * @param url Chuỗi URL cần validate
 * @param dnsResolver Hàm lookup DNS tùy chọn (cho unit test)
 * @throws AppError(400, INVALID_URL | SSRF_DNS_RESOLVE_FAILED)
 * @throws AppError(403, PRIVATE_IP_BLOCKED)
 */
export async function validateUrlAsync(
  url: string,
  dnsResolver: DnsLookupFn = defaultDnsLookup,
): Promise<URL> {
  const parsed = validateUrl(url);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  // If already an IP address, validateUrl already checked it
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) {
    return parsed;
  }

  let resolvedIps: string[];
  try {
    resolvedIps = await dnsResolver(hostname);
  } catch (_err) {
    throw new AppError(
      `Failed to resolve hostname "${hostname}" via DNS`,
      400,
      ERROR_CODE.SSRF_DNS_RESOLVE_FAILED,
    );
  }

  if (!resolvedIps || resolvedIps.length === 0) {
    throw new AppError(
      `No DNS records found for hostname "${hostname}"`,
      400,
      ERROR_CODE.SSRF_DNS_RESOLVE_FAILED,
    );
  }

  for (const ip of resolvedIps) {
    if (isPrivateIp(ip)) {
      throw new AppError(
        `Hostname "${hostname}" resolves to restricted private IP (${ip})`,
        403,
        ERROR_CODE.PRIVATE_IP_BLOCKED,
      );
    }
  }

  return parsed;
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  maxRedirects?: number;
  timeoutMs?: number;
  dnsResolver?: DnsLookupFn;
}

export interface SafeFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
}

/**
 * Thực hiện HTTP request an toàn chống SSRF:
 * - Kiểm tra DNS trước mỗi hop
 * - Tự động follow redirects (tối đa maxRedirects) nhưng validate nghiêm ngặt từng URL đích
 * - Chặn redirect sang private IP hoặc scheme nguy hiểm
 * - Áp dụng timeout qua AbortController
 */
export async function safeFetch(
  initialUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    maxRedirects = 5,
    timeoutMs = 10000,
    dnsResolver = defaultDnsLookup,
  } = options;

  let currentUrl = initialUrl;
  let redirectCount = 0;

  while (true) {
    const validated = await validateUrlAsync(currentUrl, dnsResolver);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(validated.toString(), {
        method,
        headers,
        body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
        redirect: 'manual', // Do not let runtime auto-follow without our validation
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new AppError(`Request to "${currentUrl}" timed out after ${timeoutMs}ms`, 408, ERROR_CODE.INTERNAL_SERVER_ERROR);
      }
      throw new AppError(`Request to "${currentUrl}" failed: ${err?.message || String(err)}`, 502, ERROR_CODE.INTERNAL_SERVER_ERROR);
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle 3xx Redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new AppError(
          `Too many redirects (limit: ${maxRedirects})`,
          400,
          ERROR_CODE.SSRF_REDIRECT_LOOP,
        );
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new AppError('Redirect response missing Location header', 502, ERROR_CODE.INTERNAL_SERVER_ERROR);
      }

      // Resolve relative or absolute redirect URL
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = nextUrl;
      continue;
    }

    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key.toLowerCase()] = val;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      finalUrl: currentUrl,
    };
  }
}

/**
 * Trích xuất hostname từ URL string.
 * Trả về chuỗi rỗng nếu URL không hợp lệ.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return '';
  }
}
