import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  CategoryQueryDto,
  CategoryResponseDto,
  CategoryTreeQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './category.dto';

const categorySelect = {
  id: true,
  parentId: true,
  name: true,
  type: true,
  icon: true,
  color: true,
  isSystem: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

function visibleWhere(userId: string): Prisma.CategoryWhereInput {
  return {
    OR: [
      { userId },
      { isSystem: true, userId: null },
    ],
  };
}

function sourceWhere(
  userId: string,
  source: CategoryQueryDto['source'],
): Prisma.CategoryWhereInput {
  if (source === 'SYSTEM') {
    return { isSystem: true, userId: null };
  }

  if (source === 'USER') {
    return { isSystem: false, userId };
  }

  return visibleWhere(userId);
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const shouldRetry = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2034'
        && attempt < maxAttempts;

      if (!shouldRetry) {
        throw error;
      }
    }
  }

  throw new Error('Serializable transaction retry limit reached');
}

export class CategoryRepository {
  async findAll(userId: string, query: CategoryQueryDto) {
    const {
      search,
      type,
      source,
      parentId,
      includeArchived,
      sortBy,
      order,
      page,
      limit,
    } = query;
    const where: Prisma.CategoryWhereInput = {
      AND: [
        sourceWhere(userId, source),
        ...(search
          ? [{ name: { contains: search, mode: Prisma.QueryMode.insensitive } }]
          : []),
        ...(type ? [{ type }] : []),
        ...(parentId !== undefined ? [{ parentId }] : []),
        ...(includeArchived ? [] : [{ isArchived: false }]),
      ],
    };
    const skip = (page - 1) * limit;

    const [categories, total] = await prisma.$transaction([
      prisma.category.findMany({
        where,
        select: categorySelect,
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
      }),
      prisma.category.count({ where }),
    ]);

    return {
      data: categories,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findAllForTree(userId: string, query: CategoryTreeQueryDto) {
    return prisma.category.findMany({
      where: {
        AND: [
          sourceWhere(userId, query.source),
          ...(query.type ? [{ type: query.type }] : []),
          ...(query.includeArchived ? [] : [{ isArchived: false }]),
        ],
      },
      select: categorySelect,
      orderBy: [
        { name: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  findById(userId: string, id: string) {
    return prisma.category.findFirst({
      where: {
        id,
        AND: [visibleWhere(userId)],
      },
      select: categorySelect,
    });
  }

  findByName(
    userId: string,
    name: string,
    type: CategoryResponseDto['type'],
    excludeId?: string,
  ) {
    return prisma.category.findFirst({
      where: {
        name: { equals: name, mode: Prisma.QueryMode.insensitive },
        type,
        AND: [visibleWhere(userId)],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  create(userId: string, data: CreateCategoryDto) {
    return prisma.category.create({
      data: {
        userId,
        name: data.name,
        type: data.type,
        parentId: data.parentId,
        icon: data.icon,
        color: data.color,
      },
      select: categorySelect,
    });
  }

  update(id: string, data: UpdateCategoryDto) {
    return prisma.category.update({
      where: { id },
      data,
      select: categorySelect,
    });
  }

  async hasDependencies(id: string) {
    const [children, transactions, budgets] = await prisma.$transaction([
      prisma.category.count({ where: { parentId: id } }),
      prisma.transaction.count({ where: { categoryId: id } }),
      prisma.budget.count({ where: { categoryId: id } }),
    ]);

    return children > 0 || transactions > 0 || budgets > 0;
  }

  async wouldCreateCycle(categoryId: string, parentId: string) {
    const visited = new Set<string>();
    let currentId: string | null = parentId;

    while (currentId !== null) {
      if (currentId === categoryId) {
        return true;
      }

      if (visited.has(currentId)) {
        return true;
      }
      visited.add(currentId);

      const category: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = category?.parentId ?? null;
    }

    return false;
  }

  async archiveBranch(userId: string, id: string) {
    return runSerializableTransaction(async (transaction) => {
      const target = await transaction.category.findFirst({
        where: { id, userId, isSystem: false },
        select: categorySelect,
      });

      if (!target || target.isArchived) {
        return target;
      }

      const categories = await transaction.category.findMany({
        where: { userId, isSystem: false },
        select: { id: true, parentId: true },
      });
      const ids = new Set([id]);
      let added = true;

      while (added) {
        added = false;
        for (const category of categories) {
          if (
            category.parentId !== null
            && ids.has(category.parentId)
            && !ids.has(category.id)
          ) {
            ids.add(category.id);
            added = true;
          }
        }
      }

      await transaction.category.updateMany({
        where: { id: { in: [...ids] }, userId },
        data: { isArchived: true },
      });

      return transaction.category.findUniqueOrThrow({
        where: { id },
        select: categorySelect,
      });
    });
  }

  restore(id: string) {
    return prisma.category.update({
      where: { id },
      data: { isArchived: false },
      select: categorySelect,
    });
  }
}
