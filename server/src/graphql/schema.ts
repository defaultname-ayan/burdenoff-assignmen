import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { GraphQLSchema } from 'graphql';
import { resolvers } from './resolvers/index.js';

function loadTypeDefs(): string {
  const schemaDir = join(import.meta.dir, 'schema');
  return readdirSync(schemaDir)
    .filter((file) => file.endsWith('.graphql'))
    .sort()
    .map((file) => readFileSync(join(schemaDir, file), 'utf8'))
    .join('\n');
}

export const schema: GraphQLSchema = makeExecutableSchema({
  typeDefs: loadTypeDefs(),
  resolvers,
});
