import { Prisma, SettingCategory, SettingType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { SystemSettingQueryDto } from './system-setting.dto';

export class SystemSettingRepository {
  async findAll(query?: SystemSettingQueryDto) {
    const where: Prisma.SystemSettingWhereInput = {};

    if (query?.category) {
      where.category = query.category;
    }

    if (query?.isPublic !== undefined) {
      where.isPublic = query.isPublic;
    }

    if (query?.search) {
      where.OR = [
        { key: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return prisma.systemSetting.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  async findByKey(key: string) {
    return prisma.systemSetting.findUnique({
      where: { key },
    });
  }

  async findPublicSettings() {
    return prisma.systemSetting.findMany({
      where: { isPublic: true },
      orderBy: { key: 'asc' },
    });
  }

  async updateSetting(key: string, value: string, updatedBy?: string) {
    return prisma.systemSetting.update({
      where: { key },
      data: {
        value,
        updatedBy: updatedBy ?? null,
      },
    });
  }

  async upsertSetting(data: {
    key: string;
    value: string;
    type: SettingType;
    category: SettingCategory;
    description: string;
    isEditable?: boolean;
    isPublic?: boolean;
    updatedBy?: string;
  }) {
    return prisma.systemSetting.upsert({
      where: { key: data.key },
      update: {
        value: data.value,
        type: data.type,
        category: data.category,
        description: data.description,
        isEditable: data.isEditable ?? true,
        isPublic: data.isPublic ?? false,
        updatedBy: data.updatedBy ?? null,
      },
      create: {
        key: data.key,
        value: data.value,
        type: data.type,
        category: data.category,
        description: data.description,
        isEditable: data.isEditable ?? true,
        isPublic: data.isPublic ?? false,
        updatedBy: data.updatedBy ?? null,
      },
    });
  }
}
