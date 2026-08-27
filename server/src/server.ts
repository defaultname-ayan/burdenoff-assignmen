import { createYoga } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { config } from './config/index.js';
import { buildContext } from './auth/context.js';
import { schema } from './graphql/schema.js';
import { ErrorCode, isAppError } from './errors/index.js';

export const yoga = createYoga({
  schema,
  context: ({ request }) => buildContext(request),
  graphqlEndpoint: '/graphql',
  landingPage: false,
  logging: process.env['NODE_ENV'] !== 'test',
  cors: {
    origin: process.env['CORS_ORIGIN']?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  },
  maskedErrors: {
    maskError(error: unknown, message: string) {
      if (isAppError(error)) return error;
      const original = (error as { originalError?: unknown }).originalError;
      if (isAppError(original)) return original;

      if (error instanceof GraphQLError) {
        const cause: unknown = error.originalError;
        if (cause === undefined || cause === null || cause instanceof GraphQLError) {
          if (typeof error.extensions['code'] === 'string') return error;
          return new GraphQLError(error.message, {
            nodes: error.nodes,
            source: error.source,
            positions: error.positions,
            path: error.path,
            extensions: { ...error.extensions, code: ErrorCode.BAD_USER_INPUT },
          });
        }
      }

      console.error('[graphql] unexpected error', error);
      return Object.assign(new Error(message), {
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      });
    },
  },
});

if (import.meta.main) {
  const server = Bun.serve({
    port: config.port,
    fetch: yoga,
  });
  console.log(
    `GraphQL ready at http://localhost:${server.port}/graphql  (business hours ${config.businessStartHour}:00-${config.businessEndHour}:00 ${config.businessTimezone})`,
  );
}
