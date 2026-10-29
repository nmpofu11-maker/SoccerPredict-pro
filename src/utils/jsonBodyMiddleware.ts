import express from 'express';

export const DEFAULT_JSON_BODY_LIMIT = '15mb';

export function resolveJsonBodyLimit(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.JSON_BODY_LIMIT?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_JSON_BODY_LIMIT;
}

interface BodyParserHttpError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
  body?: unknown;
}

export function registerJsonBodyParsers(
  app: express.Application,
  limit: string | number = resolveJsonBodyLimit(),
): void {
  app.use(express.json({ limit }));
  app.use(express.urlencoded({ extended: true, limit }));

  const bodyParserErrorHandler: express.ErrorRequestHandler = (
    err: BodyParserHttpError,
    _req,
    res,
    next,
  ) => {
    if (!err) {
      next();
      return;
    }

    const status = err.status ?? err.statusCode;
    if (err.type === 'entity.too.large' || status === 413) {
      res.status(413).json({
        status: 'error',
        error: 'Payload too large',
        message: `Request body exceeds maximum allowed size (${String(limit)}).`,
      });
      return;
    }

    if (err instanceof SyntaxError && 'body' in err && status === 400) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid JSON payload',
        message: 'Request body contains malformed JSON.',
      });
      return;
    }

    next(err);
  };

  app.use(bodyParserErrorHandler);
}
