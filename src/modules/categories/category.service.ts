import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import {
  CategoryResponseDto,
  CategoryTreeNodeDto,
  CategoryTreeQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
} from './category.dto';
import { CategoryRepository } from './category.repository';
import { cacheService } from '../../common/services/cache.service';

export class CategoryService {
  private readonly repository = new CategoryRepository();

  async findAll(userId: string, query: CategoryQueryDto) {
    const isSystemOnly = query.source === 'SYSTEM';
    const cacheKey = `finwise:cache:categories:system:list:${JSON.stringify(query)}`;

    if (isSystemOnly) {
      const cached = await cacheService.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await this.repository.findAll(userId, query);

    if (isSystemOnly) {
      await cacheService.set(cacheKey, result, 3600); // Cache for 1 hour
    }

    return result;
  }

  async findTree(userId: string, query: CategoryTreeQueryDto) {
    const isSystemOnly = query.source === 'SYSTEM';
    const cacheKey = `finwise:cache:categories:system:tree:${JSON.stringify(query)}`;

    if (isSystemOnly) {
      const cached = await cacheService.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const categories = await this.repository.findAllForTree(userId, query);
    const nodes = new Map<string, CategoryTreeNodeDto>();

    for (const category of categories) {
      nodes.set(category.id, { ...category, children: [] });
    }

    const roots: CategoryTreeNodeDto[] = [];
    for (const category of categories) {
      const node = nodes.get(category.id);
      if (!node) {
        continue;
      }

      const parent = category.parentId ? nodes.get(category.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    let finalRoots = roots;
    if (query.search) {
      const search = query.search.toLocaleLowerCase();
      const prune = (node: CategoryTreeNodeDto): CategoryTreeNodeDto | null => {
        const children = node.children
          .map(prune)
          .filter((child): child is CategoryTreeNodeDto => child !== null);

        if (node.name.toLocaleLowerCase().includes(search) || children.length > 0) {
          return { ...node, children };
        }

        return null;
      };

      finalRoots = roots
        .map(prune)
        .filter((node): node is CategoryTreeNodeDto => node !== null);
    }

    if (isSystemOnly) {
      await cacheService.set(cacheKey, finalRoots, 3600); // Cache for 1 hour
    }

    return finalRoots;
  }

  async findById(userId: string, id: string) {
    const category = await this.repository.findById(userId, id);

    if (!category) {
      throw new AppError('Category not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return category;
  }

  async create(userId: string, data: CreateCategoryDto) {
    await this.ensureUniqueName(userId, data.name, data.type);

    if (data.parentId) {
      await this.ensureValidParent(userId, data.parentId, data.type);
    }

    try {
      return await this.repository.create(userId, data);
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async update(userId: string, id: string, data: UpdateCategoryDto) {
    const category = await this.findById(userId, id);
    this.ensureMutable(category);

    const nextType = data.type ?? category.type;
    const nextName = data.name ?? category.name;
    const nextParentId = data.parentId !== undefined ? data.parentId : category.parentId;

    if (data.name !== undefined || data.type !== undefined) {
      await this.ensureUniqueName(userId, nextName, nextType, id);
    }

    if (data.type !== undefined && data.type !== category.type) {
      const hasDependencies = await this.repository.hasDependencies(id);
      if (hasDependencies) {
        throw new AppError(
          'Category type cannot be changed while it has children, transactions, or budgets',
          409,
          ERROR_CODE.CATEGORY_IN_USE,
        );
      }
    }

    if (nextParentId) {
      await this.ensureValidParent(userId, nextParentId, nextType);

      if (await this.repository.wouldCreateCycle(id, nextParentId)) {
        throw new AppError(
          'Category hierarchy cannot contain a cycle',
          409,
          ERROR_CODE.CATEGORY_CYCLE,
        );
      }
    }

    try {
      return await this.repository.update(id, data);
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async archive(userId: string, id: string) {
    const category = await this.findById(userId, id);
    this.ensureUserOwned(category);

    if (category.isArchived) {
      return category;
    }

    const archived = await this.repository.archiveBranch(userId, id);
    if (!archived) {
      throw new AppError('Category not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return archived;
  }

  async restore(userId: string, id: string) {
    const category = await this.findById(userId, id);
    this.ensureUserOwned(category);

    if (!category.isArchived) {
      return category;
    }

    if (category.parentId) {
      await this.ensureValidParent(userId, category.parentId, category.type);
    }

    return this.repository.restore(id);
  }

  private async ensureValidParent(
    userId: string,
    parentId: string,
    type: CategoryResponseDto['type'],
  ) {
    const parent = await this.repository.findById(userId, parentId);

    if (!parent || parent.isArchived || parent.type !== type) {
      throw new AppError(
        'Parent category must be visible, active, and have the same transaction type',
        409,
        ERROR_CODE.CATEGORY_PARENT_INVALID,
      );
    }

    return parent;
  }

  private async ensureUniqueName(
    userId: string,
    name: string,
    type: CategoryResponseDto['type'],
    excludeId?: string,
  ) {
    const category = await this.repository.findByName(userId, name, type, excludeId);

    if (category) {
      throw new AppError(
        'Category name already exists for this transaction type',
        409,
        ERROR_CODE.DUPLICATE_ENTRY,
      );
    }
  }

  private ensureMutable(category: CategoryResponseDto) {
    this.ensureUserOwned(category);

    if (category.isArchived) {
      throw new AppError(
        'Restore the category before updating it',
        409,
        ERROR_CODE.CATEGORY_ARCHIVED,
      );
    }
  }

  private ensureUserOwned(category: CategoryResponseDto) {
    if (category.isSystem) {
      throw new AppError(
        'System categories are read-only',
        403,
        ERROR_CODE.CATEGORY_SYSTEM_PROTECTED,
      );
    }
  }

  private handleUniqueConstraint(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(
        'Category name already exists for this transaction type',
        409,
        ERROR_CODE.DUPLICATE_ENTRY,
      );
    }
  }
}

