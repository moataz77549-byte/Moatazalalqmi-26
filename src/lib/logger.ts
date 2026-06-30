type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: any;
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: any) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    };

    if (this.isProduction) {
      // In production, output structured JSON for log aggregators (like Railway/Datadog)
      console.log(JSON.stringify(entry));
    } else {
      // In development, output human-readable logs
      const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[32m';
      console.log(`${color}[${entry.timestamp}] [${level.toUpperCase()}]\x1b[0m ${message}`, context || '', error || '');
    }
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, any>, error?: any) {
    this.log('error', message, context, error);
  }

  debug(message: string, context?: Record<string, any>) {
    if (!this.isProduction) {
      this.log('debug', message, context);
    }
  }
}

export const logger = new Logger();
