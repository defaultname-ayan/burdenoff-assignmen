import type { PrismaClient, User } from '@prisma/client';

export interface UserLoader {
  load(id: string): Promise<User | null>;
}

export function createUserLoader(prisma: PrismaClient): UserLoader {
  const cache = new Map<string, Promise<User | null>>();
  let pending: string[] = [];
  let scheduled: Promise<Map<string, User>> | null = null;

  function flush(): Promise<Map<string, User>> {
    if (scheduled !== null) return scheduled;
    scheduled = Promise.resolve().then(async () => {
      const ids = pending;
      pending = [];
      scheduled = null;
      if (ids.length === 0) return new Map<string, User>();
      const users = await prisma.user.findMany({ where: { id: { in: ids } } });
      return new Map(users.map((user) => [user.id, user]));
    });
    return scheduled;
  }

  return {
    async load(id: string): Promise<User | null> {
      const cached = cache.get(id);
      if (cached !== undefined) return cached;

      pending.push(id);
      const promise = flush().then((batch) => batch.get(id) ?? null);
      cache.set(id, promise);
      return promise;
    },
  };
}
