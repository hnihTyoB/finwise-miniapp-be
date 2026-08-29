import { WorkerEnv } from './types/worker-env';
import { getPrismaClient } from './database/prisma.client';

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (pathname === '/' || pathname === '/health' || pathname === '/api/v1/health') {
      const startTime = Date.now();
      let dbStatus: string;
      let dbLatencyMs = 0;
      let userCount = 0;
      let errorDetail: string | null = null;

      try {
        const prisma = getPrismaClient(env);
        const dbStart = Date.now();
        userCount = await prisma.user.count();
        dbLatencyMs = Date.now() - dbStart;
        dbStatus = 'connected';
      } catch (err: any) {
        dbStatus = 'error';
        errorDetail = err.message || String(err);
      }

      const responsePayload = {
        status: dbStatus === 'connected' ? 'ok' : 'degraded',
        service: 'finwise-miniapp-be',
        timestamp: new Date().toISOString(),
        hyperdrive: {
          configured: Boolean(env.HYPERDRIVE),
          status: dbStatus,
          latencyMs: dbLatencyMs,
          userCount: dbStatus === 'connected' ? userCount : undefined,
          error: errorDetail,
        },
        uptimeMs: Date.now() - startTime,
      };

      return new Response(JSON.stringify(responsePayload, null, 2), {
        status: dbStatus === 'connected' ? 200 : 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(
      JSON.stringify({
        message: 'FinWise Cloudflare Hyperdrive Edge Service',
        path: pathname,
        hyperdrive: Boolean(env.HYPERDRIVE),
        endpoints: ['/health', '/api/v1/health'],
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  },
};
