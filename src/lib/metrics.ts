import { register, Gauge } from 'prom-client';

const httpRequestDurationMicroseconds = new Gauge({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
});

export const setupMetrics = () => {
  // Register default metrics
  // collectDefaultMetrics({ prefix: 'moataz_ai_' });

  // Example custom metric
  // new Counter({ name: 'app_startup_count', help: 'Counts app startups' }).inc();
};

export const getMetrics = async () => register.metrics();

export const recordRequestDuration = (method: string, route: string, code: number, duration: number) => {
  httpRequestDurationMicroseconds.set({ method, route, code }, duration);
};
