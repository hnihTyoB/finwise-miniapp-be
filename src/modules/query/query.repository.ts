import { prisma } from '../../database/prisma.client';
import { UserEntityContext } from './query-parser';

export class QueryRepository {
  async getUserContext(userId: string): Promise<UserEntityContext> {
    const [categories, wallets] = await Promise.all([
      prisma.category.findMany({
        where: {
          OR: [{ userId }, { userId: null, isSystem: true }],
          isArchived: false,
        },
        select: { id: true, name: true },
      }),
      prisma.wallet.findMany({
        where: { userId, isArchived: false },
        select: { id: true, name: true },
      }),
    ]);

    return {
      categories,
      wallets,
    };
  }
}
