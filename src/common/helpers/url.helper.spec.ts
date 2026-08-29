/**
 * Comprehensive Unit tests for url.helper.ts:
 *  - Static validation (validateUrl)
 *  - IP classification (isPrivateIp)
 *  - Async DNS Resolution (validateUrlAsync)
 *  - Safe Fetch with Redirect SSRF Defense (safeFetch)
 */
import {
  validateUrl,
  validateUrlAsync,
  isPrivateIp,
  safeFetch,
  extractDomain,
} from './url.helper';
import { AppError } from '../errors/app-error';

function expectAppError(fn: () => unknown): AppError {
  let threw: unknown;
  try {
    fn();
  } catch (err) {
    threw = err;
  }
  if (!(threw instanceof AppError)) {
    throw new Error(
      `Expected AppError to be thrown, but got: ${threw instanceof Error ? threw.constructor.name + ': ' + threw.message : String(threw)}`,
    );
  }
  return threw;
}

async function expectAppErrorAsync(fn: () => Promise<unknown>): Promise<AppError> {
  let threw: unknown;
  try {
    await fn();
  } catch (err) {
    threw = err;
  }
  if (!(threw instanceof AppError)) {
    throw new Error(
      `Expected AppError to be thrown asynchronously, but got: ${threw instanceof Error ? threw.constructor.name + ': ' + threw.message : String(threw)}`,
    );
  }
  return threw;
}

// ─── isPrivateIp ─────────────────────────────────────────────────────────────

describe('isPrivateIp()', () => {
  describe('IPv4 checks', () => {
    it.each([
      ['0.0.0.0', true],
      ['10.0.0.1', true],
      ['10.255.255.255', true],
      ['127.0.0.1', true],
      ['127.255.255.254', true],
      ['169.254.169.254', true],
      ['172.16.0.1', true],
      ['172.24.1.1', true],
      ['172.31.255.255', true],
      ['192.168.1.1', true],
      ['100.64.0.1', true],
      ['198.18.0.1', true],
      ['224.0.0.1', true],
      ['240.0.0.1', true],
      ['8.8.8.8', false],
      ['1.1.1.1', false],
      ['172.15.255.255', false],
      ['172.32.0.1', false],
      ['192.167.1.1', false],
      ['192.169.1.1', false],
    ])('should classify %s as private=%s', (ip, expected) => {
      expect(isPrivateIp(ip)).toBe(expected);
    });
  });

  describe('IPv6 checks', () => {
    it.each([
      ['::1', true],
      ['::', true],
      ['fc00::1', true],
      ['fd12:3456:789a::1', true],
      ['fe80::1', true],
      ['ff02::1', true],
      ['::ffff:127.0.0.1', true],
      ['::ffff:192.168.1.1', true],
      ['::ffff:8.8.8.8', false],
      ['2001:4860:4860::8888', false],
      ['2606:4700:4700::1111', false],
    ])('should classify %s as private=%s', (ip, expected) => {
      expect(isPrivateIp(ip)).toBe(expected);
    });
  });
});

// ─── validateUrl (Static) ───────────────────────────────────────────────────

describe('validateUrl()', () => {
  describe('valid public URLs', () => {
    it('should return parsed URL for a valid http URL', () => {
      const result = validateUrl('http://example.com/path?q=1');
      expect(result).toBeInstanceOf(URL);
      expect(result.hostname).toBe('example.com');
    });

    it('should return parsed URL for a valid https URL', () => {
      const result = validateUrl('https://api.finwise.app/v1/health');
      expect(result).toBeInstanceOf(URL);
      expect(result.protocol).toBe('https:');
    });
  });

  describe('malformed / blocked schemes', () => {
    it.each(['', 'not-a-url', '//example.com', 'file:///etc/passwd', 'ftp://secret.net', 'data:text/plain,hi'])(
      'should reject invalid scheme/format for: %s',
      (url) => {
        const err = expectAppError(() => validateUrl(url));
        expect(err.code).toBe('INVALID_URL');
      },
    );
  });

  describe('private IP hostname patterns', () => {
    it.each([
      'http://localhost:3000',
      'http://127.0.0.1/admin',
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[fd00::1]/',
    ])('should reject private IP URL: %s', (url) => {
      const err = expectAppError(() => validateUrl(url));
      expect(err.code).toBe('PRIVATE_IP_BLOCKED');
    });
  });
});

// ─── validateUrlAsync (DNS Resolution) ──────────────────────────────────────

describe('validateUrlAsync()', () => {
  it('should pass when domain resolves to public IP', async () => {
    const mockDns = jest.fn().mockResolvedValue(['93.184.216.34']);
    const result = await validateUrlAsync('https://example.com/api', mockDns);
    expect(result).toBeInstanceOf(URL);
    expect(mockDns).toHaveBeenCalledWith('example.com');
  });

  it('should reject when domain resolves to 127.0.0.1 (DNS Rebinding)', async () => {
    const mockDns = jest.fn().mockResolvedValue(['127.0.0.1']);
    const err = await expectAppErrorAsync(() =>
      validateUrlAsync('https://rebound.attacker.com/steal', mockDns),
    );
    expect(err.code).toBe('PRIVATE_IP_BLOCKED');
    expect(err.statusCode).toBe(403);
  });

  it('should reject when domain resolves to multiple IPs including one private IP', async () => {
    const mockDns = jest.fn().mockResolvedValue(['93.184.216.34', '10.0.0.5']);
    const err = await expectAppErrorAsync(() =>
      validateUrlAsync('https://multi-ip.attacker.com/', mockDns),
    );
    expect(err.code).toBe('PRIVATE_IP_BLOCKED');
    expect(err.statusCode).toBe(403);
  });

  it('should reject when domain resolves to AWS metadata IP (169.254.169.254)', async () => {
    const mockDns = jest.fn().mockResolvedValue(['169.254.169.254']);
    const err = await expectAppErrorAsync(() =>
      validateUrlAsync('http://meta.attacker.com/secret', mockDns),
    );
    expect(err.code).toBe('PRIVATE_IP_BLOCKED');
  });

  it('should throw SSRF_DNS_RESOLVE_FAILED when DNS resolution fails', async () => {
    const mockDns = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    const err = await expectAppErrorAsync(() =>
      validateUrlAsync('https://non-existent-domain-xyz.com', mockDns),
    );
    expect(err.code).toBe('SSRF_DNS_RESOLVE_FAILED');
    expect(err.statusCode).toBe(400);
  });
});

// ─── safeFetch (Redirect SSRF Protection) ────────────────────────────────────

describe('safeFetch()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should fetch successfully from safe endpoint', async () => {
    const mockDns = jest.fn().mockResolvedValue(['93.184.216.34']);
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    const res = await safeFetch('https://example.com/data', {
      dnsResolver: mockDns,
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(res.finalUrl).toBe('https://example.com/data');
  });

  it('should follow safe redirect hop to another public domain', async () => {
    const mockDns = jest
      .fn()
      .mockImplementation(async (host) => {
        if (host === 'short.url') return ['104.21.5.5'];
        if (host === 'destination.com') return ['93.184.216.34'];
        return ['1.1.1.1'];
      });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        statusText: 'Found',
        headers: new Headers({ Location: 'https://destination.com/target' }),
        text: async () => '',
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        text: async () => 'Success!',
      } as any);

    const res = await safeFetch('https://short.url/link', {
      dnsResolver: mockDns,
    });

    expect(res.status).toBe(200);
    expect(res.body).toBe('Success!');
    expect(res.finalUrl).toBe('https://destination.com/target');
  });

  it('should block redirect when target points to a private IP (SSRF Redirect Attack)', async () => {
    const mockDns = jest
      .fn()
      .mockImplementation(async (host) => {
        if (host === 'innocent.com') return ['104.21.5.5'];
        if (host === 'internal.corp') return ['192.168.1.100'];
        return ['127.0.0.1'];
      });

    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 302,
      statusText: 'Found',
      headers: new Headers({ Location: 'http://internal.corp/admin' }),
      text: async () => '',
    } as any);

    const err = await expectAppErrorAsync(() =>
      safeFetch('https://innocent.com/redirect', { dnsResolver: mockDns }),
    );

    expect(err.code).toBe('PRIVATE_IP_BLOCKED');
    expect(err.statusCode).toBe(403);
  });

  it('should block redirect loop exceeding maxRedirects', async () => {
    const mockDns = jest.fn().mockResolvedValue(['104.21.5.5']);

    global.fetch = jest.fn().mockResolvedValue({
      status: 302,
      statusText: 'Found',
      headers: new Headers({ Location: 'https://loop.com/next' }),
      text: async () => '',
    } as any);

    const err = await expectAppErrorAsync(() =>
      safeFetch('https://loop.com/start', {
        maxRedirects: 3,
        dnsResolver: mockDns,
      }),
    );

    expect(err.code).toBe('SSRF_REDIRECT_LOOP');
    expect(err.statusCode).toBe(400);
  });
});

// ─── extractDomain ────────────────────────────────────────────────────────────

describe('extractDomain()', () => {
  it('should return hostname for a valid URL', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com');
  });

  it('should return empty string for malformed URL', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });
});
