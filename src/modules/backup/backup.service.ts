import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { cacheService } from '../../common/services/cache.service';
import { BackupCryptoService } from './backup-crypto';
import {
  BackupDataPayload,
  BackupFileStructure,
  BackupImportResultDto,
  BackupPreviewCategoryMatch,
  BackupPreviewResponseDto,
  BackupPreviewWalletItem,
  ExportBackupOptionsDto,
  ImportBackupDto,
} from './backup.dto';
import { BackupRepository } from './backup.repository';
import {
  backupDataPayloadSchema,
  backupFileStructureSchema,
} from './backup.validation';

export class BackupService {
  private readonly repository = new BackupRepository();

  /**
   * Xuất toàn bộ dữ liệu tài chính của người dùng thành file JSON có checksum và tùy chọn mã hóa
   */
  async exportBackup(userId: string, options?: ExportBackupOptionsDto) {
    const rawData = await this.repository.getUserFullData(userId);

    const payload: BackupDataPayload = {
      wallets: rawData.wallets.map((w) => ({
        id: w.id,
        name: w.name,
        balance: new Prisma.Decimal(w.balance).toFixed(2),
        currency: w.currency,
        icon: w.icon,
        color: w.color,
        description: w.description,
        isDefault: w.isDefault,
        isArchived: w.isArchived,
      })),
      categories: rawData.categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        icon: c.icon,
        color: c.color,
        isSystem: c.isSystem,
        isArchived: c.isArchived,
        parentId: c.parentId,
      })),
      transactions: rawData.transactions.map((t) => ({
        id: t.id,
        walletId: t.walletId,
        categoryId: t.categoryId,
        amount: new Prisma.Decimal(t.amount).toFixed(2),
        type: t.type,
        description: t.description,
        receiptUrl: t.receiptUrl,
        location: t.location,
        date: t.date.toISOString().slice(0, 10),
        createdAt: t.createdAt.toISOString(),
      })),
      transfers: rawData.transfers.map((tf) => ({
        id: tf.id,
        sourceWalletId: tf.sourceWalletId,
        destinationWalletId: tf.destinationWalletId,
        amount: new Prisma.Decimal(tf.amount).toFixed(2),
        note: tf.note,
        transferredAt: tf.transferredAt.toISOString(),
      })),
      budgets: rawData.budgets.map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        name: b.name,
        amount: new Prisma.Decimal(b.amount).toFixed(2),
        currency: b.currency,
        type: b.type,
        period: b.period,
        startDate: b.startDate.toISOString().slice(0, 10),
        endDate: b.endDate.toISOString().slice(0, 10),
        alertThreshold: b.alertThreshold ? new Prisma.Decimal(b.alertThreshold).toFixed(2) : undefined,
        isArchived: b.isArchived,
        isRecurring: b.isRecurring,
        autoRenew: b.autoRenew,
        rolloverMode: b.rolloverMode,
        rolloverAmount: b.rolloverAmount ? new Prisma.Decimal(b.rolloverAmount).toFixed(2) : undefined,
        autoRenewUntil: b.autoRenewUntil ? b.autoRenewUntil.toISOString().slice(0, 10) : null,
      })),
      savingGoals: rawData.savingGoals.map((sg) => ({
        id: sg.id,
        name: sg.name,
        targetAmount: new Prisma.Decimal(sg.targetAmount).toFixed(2),
        currency: sg.currency,
        targetDate: sg.targetDate.toISOString().slice(0, 10),
        description: sg.description,
        icon: sg.icon,
        color: sg.color,
        status: sg.status,
        completedAt: sg.completedAt ? sg.completedAt.toISOString() : null,
        isArchived: sg.isArchived,
        contributions: sg.contributions.map((c) => ({
          id: c.id,
          amount: new Prisma.Decimal(c.amount).toFixed(2),
          contributedAt: c.contributedAt.toISOString(),
          note: c.note,
        })),
      })),
    };

    const exportedAt = new Date().toISOString();
    const canonicalPayloadString = BackupCryptoService.canonicalJsonStringify(payload);

    if (options?.password && options.password.trim().length >= 6) {
      const encryption = BackupCryptoService.encryptWithPassword(
        canonicalPayloadString,
        options.password.trim(),
      );

      const file: BackupFileStructure = {
        version: '1.0',
        appName: 'FinWise',
        exportedAt,
        isEncrypted: true,
        encryption: {
          algorithm: encryption.algorithm,
          kdf: encryption.kdf,
          iterations: encryption.iterations,
          salt: encryption.salt,
          iv: encryption.iv,
          tag: encryption.tag,
        },
        ciphertext: encryption.ciphertext,
        checksum: BackupCryptoService.computeSha256(encryption.ciphertext),
      };

      await this.repository.createAuditLog({
        actorId: userId,
        action: 'BACKUP_EXPORT',
        targetType: 'BACKUP',
        targetId: file.checksum,
        newState: { isEncrypted: true, exportedAt, recordsCount: this.countTotalRecords(payload) },
      });

      return file;
    }

    const checksum = BackupCryptoService.computeSha256(canonicalPayloadString);

    const file: BackupFileStructure = {
      version: '1.0',
      appName: 'FinWise',
      exportedAt,
      isEncrypted: false,
      checksum,
      data: payload,
    };

    await this.repository.createAuditLog({
      actorId: userId,
      action: 'BACKUP_EXPORT',
      targetType: 'BACKUP',
      targetId: file.checksum,
      newState: { isEncrypted: false, exportedAt, recordsCount: this.countTotalRecords(payload) },
    });

    return file;
  }

  /**
   * Phân tích và xem trước nội dung file sao lưu (Step 2 Preview)
   */
  async previewBackup(
    userId: string,
    fileContent: string | Buffer,
    password?: string,
  ): Promise<BackupPreviewResponseDto> {
    const { data, version, exportedAt, isEncrypted, checksum } =
      await this.parseAndValidateBackupFile(fileContent, password);

    const stats = await this.repository.getUserDataStats(userId);
    const existingWallets = await this.repository.getUserActiveWallets(userId);
    const existingCategories = await this.repository.getUserAndSystemCategories(userId);

    const existingWalletMap = new Map(
      existingWallets.map((w) => [w.name.toLowerCase().trim(), w]),
    );

    const previewWallets: BackupPreviewWalletItem[] = data.wallets.map((w) => {
      const match = existingWalletMap.get(w.name.toLowerCase().trim());
      return {
        id: w.id,
        name: w.name,
        balance: w.balance,
        currency: w.currency,
        icon: w.icon,
        color: w.color,
        matchedExistingWalletId: match ? match.id : null,
        matchedExistingWalletName: match ? match.name : null,
      };
    });

    const existingCategoryMap = new Map(
      existingCategories.map((c) => [`${c.name.toLowerCase().trim()}::${c.type}`, c]),
    );

    const categoriesMatching: BackupPreviewCategoryMatch[] = data.categories.map((c) => {
      const matchKey = `${c.name.toLowerCase().trim()}::${c.type}`;
      const match = existingCategoryMap.get(matchKey);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        willMergeWithId: match ? match.id : null,
        willMergeWithName: match ? match.name : null,
        isNew: !match,
      };
    });

    // Ước lượng số lượng giao dịch có thể trùng lặp
    let potentialDuplicatesCount = 0;
    if (stats.transactionsCount > 0 && data.transactions.length > 0) {
      const existingTx = await this.repository.findExistingTransactions(userId);
      const existingKeys = new Set(
        existingTx.map(
          (t) =>
            `${t.date.toISOString().slice(0, 10)}::${new Prisma.Decimal(t.amount).toFixed(2)}::${t.type}::${(t.description || '').trim().toLowerCase()}`,
        ),
      );

      for (const t of data.transactions) {
        const key = `${t.date.slice(0, 10)}::${new Prisma.Decimal(t.amount).toFixed(2)}::${t.type}::${(t.description || '').trim().toLowerCase()}`;
        if (existingKeys.has(key)) {
          potentialDuplicatesCount++;
        }
      }
    }

    return {
      fileVersion: version,
      exportedAt,
      isEncrypted,
      checksum,
      isChecksumValid: true,
      accountStatus: stats.isAccountEmpty ? 'EMPTY' : 'HAS_DATA',
      existingWalletsCount: stats.walletsCount,
      existingTransactionsCount: stats.transactionsCount,
      existingCategoriesCount: stats.categoriesCount,
      existingWallets: existingWallets.map((w) => ({
        id: w.id,
        name: w.name,
        balance: new Prisma.Decimal(w.balance).toFixed(2),
        currency: w.currency,
      })),
      summary: {
        walletsCount: data.wallets.length,
        categoriesCount: data.categories.length,
        transactionsCount: data.transactions.length,
        transfersCount: data.transfers.length,
        budgetsCount: data.budgets.length,
        savingGoalsCount: data.savingGoals.length,
      },
      wallets: previewWallets,
      categoriesMatching,
      potentialDuplicatesCount,
    };
  }

  /**
   * Tiến hành nhập và hợp nhất dữ liệu nguyên tử trong một Transaction duy nhất
   */
  async importBackup(
    userId: string,
    fileContent: string | Buffer,
    options: ImportBackupDto,
    meta?: { ipAddress?: string; userAgent?: string; fileName?: string },
  ): Promise<BackupImportResultDto> {
    const { data, checksum } = await this.parseAndValidateBackupFile(
      fileContent,
      options.password,
    );

    const importedResult = await this.repository.runSerializable(async (tx) => {
      const walletIdMap = new Map<string, string>();
      const categoryIdMap = new Map<string, string>();

      const importedCount = {
        wallets: 0,
        categories: 0,
        transactions: 0,
        transfers: 0,
        budgets: 0,
        savingGoals: 0,
        savingContributions: 0,
      };

      const skippedDuplicates = {
        transactions: 0,
        transfers: 0,
      };

      // ── 1. XỬ LÝ VÍ TIỀN (WALLETS) ──────────────────────────────────────────
      const existingWallets = await this.repository.getUserActiveWallets(userId, tx);
      const existingWalletMap = new Map(existingWallets.map((w) => [w.id, w]));
      const existingWalletMapByName = new Map(
        existingWallets.map((w) => [w.name.toLowerCase().trim(), w]),
      );
      const existingWalletNames = new Set(
        existingWallets.map((w) => w.name.toLowerCase().trim()),
      );

      for (const w of data.wallets) {
        const resolution = options.walletResolutions.find((r) => r.oldWalletId === w.id);
        const existingByName = existingWalletMapByName.get(w.name.toLowerCase().trim());

        const isExplicitMerge =
          resolution?.action === 'MERGE' &&
          resolution.targetWalletId &&
          existingWalletMap.has(resolution.targetWalletId);

        const isImplicitMerge = !resolution && existingByName !== undefined;

        if (isExplicitMerge || isImplicitMerge) {
          const targetId = isExplicitMerge
            ? resolution!.targetWalletId!
            : existingByName!.id;
          walletIdMap.set(w.id, targetId);

          if (isExplicitMerge && options.balanceMode === 'ACCUMULATE') {
            const currentWallet = existingWalletMap.get(targetId)!;
            const updatedBalance = currentWallet.balance.plus(new Prisma.Decimal(w.balance));
            await tx.wallet.update({
              where: { id: targetId },
              data: { balance: updatedBalance },
            });
            currentWallet.balance = updatedBalance;
          }
          // Nếu balanceMode === 'MAINTAIN_CURRENT' hoặc nạp lại cùng ví (isImplicitMerge), giữ nguyên số dư ví hiện tại
        } else {
          // Tạo ví mới độc lập
          let desiredName = (resolution?.newWalletName || w.name).trim();
          if (existingWalletNames.has(desiredName.toLowerCase())) {
            let candidate = `${desiredName} (Nhập)`;
            let counter = 1;
            while (existingWalletNames.has(candidate.toLowerCase())) {
              counter++;
              candidate = `${desiredName} (Nhập ${counter})`;
            }
            desiredName = candidate;
          }
          existingWalletNames.add(desiredName.toLowerCase());

          const initialBalance = new Prisma.Decimal(w.balance);
          const isFirstUserWallet = existingWallets.length === 0 && importedCount.wallets === 0;

          const newWallet = await tx.wallet.create({
            data: {
              userId,
              name: desiredName,
              balance: initialBalance,
              currency: w.currency || 'VND',
              icon: w.icon,
              color: w.color,
              description: w.description,
              isDefault: isFirstUserWallet || (w.isDefault ?? false),
              isArchived: w.isArchived ?? false,
            },
          });

          walletIdMap.set(w.id, newWallet.id);
          existingWalletMap.set(newWallet.id, {
            id: newWallet.id,
            name: newWallet.name,
            balance: newWallet.balance,
            currency: newWallet.currency,
            isDefault: newWallet.isDefault,
          });
          importedCount.wallets++;
        }
      }

      // ── 2. XỬ LÝ DANH MỤC THÔNG MINH (CATEGORIES) ──────────────────────────
      const existingCategories = await this.repository.getUserAndSystemCategories(userId, tx);
      const existingCategoryMap = new Map<string, { id: string; name: string }>();

      for (const cat of existingCategories) {
        existingCategoryMap.set(`${cat.name.toLowerCase().trim()}::${cat.type}`, {
          id: cat.id,
          name: cat.name,
        });
      }

      // Tách danh mục cha (parentId === null) và danh mục con (parentId !== null)
      const rootCategories = data.categories.filter((c) => !c.parentId);
      const childCategories = data.categories.filter((c) => Boolean(c.parentId));

      // Pass 1: Xử lý danh mục gốc
      for (const cat of rootCategories) {
        const key = `${cat.name.toLowerCase().trim()}::${cat.type}`;
        const existing = existingCategoryMap.get(key);

        if (existing) {
          categoryIdMap.set(cat.id, existing.id);
        } else {
          const newCategory = await tx.category.create({
            data: {
              userId,
              name: cat.name.trim(),
              type: cat.type,
              icon: cat.icon,
              color: cat.color,
              isSystem: false,
              isArchived: cat.isArchived ?? false,
              parentId: null,
            },
          });
          categoryIdMap.set(cat.id, newCategory.id);
          existingCategoryMap.set(key, { id: newCategory.id, name: newCategory.name });
          importedCount.categories++;
        }
      }

      // Pass 2: Xử lý danh mục con (phụ thuộc vào parentId đã ánh xạ)
      for (const cat of childCategories) {
        const key = `${cat.name.toLowerCase().trim()}::${cat.type}`;
        const existing = existingCategoryMap.get(key);

        if (existing) {
          categoryIdMap.set(cat.id, existing.id);
        } else {
          const mappedParentId = cat.parentId ? categoryIdMap.get(cat.parentId) ?? null : null;
          const newCategory = await tx.category.create({
            data: {
              userId,
              name: cat.name.trim(),
              type: cat.type,
              icon: cat.icon,
              color: cat.color,
              isSystem: false,
              isArchived: cat.isArchived ?? false,
              parentId: mappedParentId,
            },
          });
          categoryIdMap.set(cat.id, newCategory.id);
          existingCategoryMap.set(key, { id: newCategory.id, name: newCategory.name });
          importedCount.categories++;
        }
      }

      // ── 3. XỬ LÝ GIAO DỊCH & CHỐNG TRÙNG LẶP (TRANSACTIONS) ─────────────────
      const existingTxList = await this.repository.findExistingTransactions(userId, tx);
      const existingTxKeys = new Set(
        existingTxList.map(
          (t) =>
            `${t.walletId}::${t.date.toISOString().slice(0, 10)}::${new Prisma.Decimal(t.amount).toFixed(2)}::${t.type}::${(t.description || '').trim().toLowerCase()}`,
        ),
      );

      // Sắp xếp giao dịch theo thời gian tăng dần
      const sortedTransactions = [...data.transactions].sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      for (const t of sortedTransactions) {
        const targetWalletId = walletIdMap.get(t.walletId);
        const targetCategoryId = categoryIdMap.get(t.categoryId);

        // Bỏ qua nếu không tìm thấy ví hoặc danh mục tương ứng
        if (!targetWalletId || !targetCategoryId) {
          continue;
        }

        const dateStr = t.date.slice(0, 10);
        const amountDec = new Prisma.Decimal(t.amount);
        const descNormalized = (t.description || '').trim().toLowerCase();

        const dedupKey = `${targetWalletId}::${dateStr}::${amountDec.toFixed(2)}::${t.type}::${descNormalized}`;

        if (existingTxKeys.has(dedupKey)) {
          skippedDuplicates.transactions++;
          continue;
        }

        existingTxKeys.add(dedupKey);

        await tx.transaction.create({
          data: {
            userId,
            walletId: targetWalletId,
            categoryId: targetCategoryId,
            amount: amountDec,
            type: t.type,
            description: t.description,
            receiptUrl: t.receiptUrl,
            location: t.location,
            date: new Date(dateStr),
          },
        });

        importedCount.transactions++;
      }

      // ── 4. XỬ LÝ CHUYỂN TIỀN & CHỐNG TRÙNG LẶP (TRANSFERS) ──────────────────
      const existingTransfers = await this.repository.findExistingTransfers(userId, tx);
      const existingTransferKeys = new Set(
        existingTransfers.map(
          (tf) =>
            `${tf.sourceWalletId}::${tf.destinationWalletId}::${tf.transferredAt.toISOString()}::${new Prisma.Decimal(tf.amount).toFixed(2)}`,
        ),
      );

      for (const tf of data.transfers) {
        const srcWalletId = walletIdMap.get(tf.sourceWalletId);
        const dstWalletId = walletIdMap.get(tf.destinationWalletId);

        if (!srcWalletId || !dstWalletId || srcWalletId === dstWalletId) {
          // Nếu ví nguồn hoặc ví đích không tồn tại, hoặc 2 ví bị gộp thành 1, bỏ qua
          continue;
        }

        const transferIso = new Date(tf.transferredAt).toISOString();
        const amountDec = new Prisma.Decimal(tf.amount);
        const dedupKey = `${srcWalletId}::${dstWalletId}::${transferIso}::${amountDec.toFixed(2)}`;

        if (existingTransferKeys.has(dedupKey)) {
          skippedDuplicates.transfers++;
          continue;
        }

        existingTransferKeys.add(dedupKey);

        await tx.transfer.create({
          data: {
            userId,
            sourceWalletId: srcWalletId,
            destinationWalletId: dstWalletId,
            amount: amountDec,
            note: tf.note,
            transferredAt: new Date(tf.transferredAt),
          },
        });

        importedCount.transfers++;
      }

      // ── 5. XỬ LÝ NGÂN SÁCH (BUDGETS) ────────────────────────────────────────
      for (const b of data.budgets) {
        const targetCategoryId = b.categoryId ? categoryIdMap.get(b.categoryId) ?? null : null;
        await tx.budget.create({
          data: {
            userId,
            categoryId: targetCategoryId,
            name: b.name,
            amount: new Prisma.Decimal(b.amount),
            currency: b.currency || 'VND',
            type: b.type,
            period: b.period,
            startDate: new Date(b.startDate),
            endDate: new Date(b.endDate),
            alertThreshold: b.alertThreshold ? new Prisma.Decimal(b.alertThreshold) : undefined,
            isArchived: b.isArchived ?? false,
            isRecurring: b.isRecurring ?? false,
            autoRenew: b.autoRenew ?? false,
            rolloverMode: b.rolloverMode ?? 'RESET',
            rolloverAmount: b.rolloverAmount ? new Prisma.Decimal(b.rolloverAmount) : undefined,
            autoRenewUntil: b.autoRenewUntil ? new Date(b.autoRenewUntil) : null,
          },
        });
        importedCount.budgets++;
      }

      // ── 6. XỬ LÝ MỤC TIÊU TIẾT KIỆM (SAVING GOALS) ──────────────────────────
      for (const sg of data.savingGoals) {
        const createdGoal = await tx.savingGoal.create({
          data: {
            userId,
            name: sg.name,
            targetAmount: new Prisma.Decimal(sg.targetAmount),
            currency: sg.currency || 'VND',
            targetDate: new Date(sg.targetDate),
            description: sg.description,
            icon: sg.icon,
            color: sg.color,
            status: sg.status,
            completedAt: sg.completedAt ? new Date(sg.completedAt) : null,
            isArchived: sg.isArchived ?? false,
          },
        });

        importedCount.savingGoals++;

        if (sg.contributions && sg.contributions.length > 0) {
          for (const c of sg.contributions) {
            await tx.savingContribution.create({
              data: {
                savingGoalId: createdGoal.id,
                amount: new Prisma.Decimal(c.amount),
                contributedAt: new Date(c.contributedAt),
                note: c.note,
              },
            });
            importedCount.savingContributions++;
          }
        }
      }

      // ── 7. GHI VẾT KIỂM TOÁN (AUDIT TRAIL) ──────────────────────────────────
      const importedAt = new Date().toISOString();
      await this.repository.createAuditLog(
        {
          actorId: userId,
          action: 'BACKUP_IMPORT',
          targetType: 'BACKUP',
          targetId: checksum,
          newState: {
            fileName: meta?.fileName || 'backup.json',
            checksum,
            importedCount,
            skippedDuplicates,
            balanceMode: options.balanceMode,
            importedAt,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        },
        tx,
      );

      return {
        success: true,
        importedCount,
        skippedDuplicates,
        balanceMode: options.balanceMode,
        importedAt,
      };
    });

    // Làm mới cache phân tích và báo cáo
    await this.invalidateUserCaches(userId);

    return importedResult;
  }

  /**
   * Đọc, giải mã (nếu cần), kiểm tra mã băm SHA-256 và validate cấu trúc Zod
   */
  async parseAndValidateBackupFile(
    fileContent: string | Buffer,
    password?: string,
  ): Promise<{
    data: BackupDataPayload;
    version: string;
    exportedAt: string;
    isEncrypted: boolean;
    checksum: string;
  }> {
    const rawString = Buffer.isBuffer(fileContent)
      ? fileContent.toString('utf8')
      : fileContent;

    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(rawString);
    } catch {
      throw new AppError(
        'Định dạng tệp tin không hợp lệ. Vui lòng chọn tệp tin JSON sao lưu của FinWise.',
        422,
        ERROR_CODE.BACKUP_FORMAT_INVALID,
      );
    }

    const file = backupFileStructureSchema.parse(jsonParsed);

    if (file.isEncrypted) {
      if (!password || password.trim().length === 0) {
        throw new AppError(
          'Tệp tin đã được mã hóa bằng mật khẩu. Vui lòng cung cấp mật khẩu giải mã.',
          400,
          ERROR_CODE.BACKUP_PASSWORD_REQUIRED,
        );
      }

      if (!file.ciphertext || !file.encryption) {
        throw new AppError(
          'Cấu trúc tệp tin mã hóa bị thiếu dữ liệu.',
          422,
          ERROR_CODE.BACKUP_FORMAT_INVALID,
        );
      }

      const isCiphertextValid = BackupCryptoService.verifySha256(
        file.ciphertext,
        file.checksum,
      );
      if (!isCiphertextValid) {
        throw new AppError(
          'Mã kiểm tra tính toàn vẹn (checksum) không khớp. Tệp tin có thể đã bị sửa đổi trái phép.',
          400,
          ERROR_CODE.BACKUP_CHECKSUM_INVALID,
        );
      }

      const decryptedString = BackupCryptoService.decryptWithPassword(
        file.ciphertext,
        password.trim(),
        file.encryption,
      );

      let decryptedPayload: unknown;
      try {
        decryptedPayload = JSON.parse(decryptedString);
      } catch {
        throw new AppError(
          'Dữ liệu sau khi giải mã không đúng định dạng JSON.',
          422,
          ERROR_CODE.BACKUP_FORMAT_INVALID,
        );
      }

      const validatedData = backupDataPayloadSchema.parse(decryptedPayload);

      return {
        data: validatedData,
        version: file.version,
        exportedAt: file.exportedAt,
        isEncrypted: true,
        checksum: file.checksum,
      };
    }

    // Tệp tin không mã hóa
    if (!file.data) {
      throw new AppError(
        'Tệp tin sao lưu không chứa dữ liệu tài chính (data).',
        422,
        ERROR_CODE.BACKUP_EMPTY_DATA,
      );
    }

    const canonicalDataString = BackupCryptoService.canonicalJsonStringify(file.data);
    const isChecksumValid = BackupCryptoService.verifySha256(
      canonicalDataString,
      file.checksum,
    );

    if (!isChecksumValid) {
      throw new AppError(
        'Mã kiểm tra tính toàn vẹn (checksum) không khớp. Tệp tin có thể đã bị sửa đổi trái phép.',
        400,
        ERROR_CODE.BACKUP_CHECKSUM_INVALID,
      );
    }

    const validatedData = backupDataPayloadSchema.parse(file.data);

    return {
      data: validatedData,
      version: file.version,
      exportedAt: file.exportedAt,
      isEncrypted: false,
      checksum: file.checksum,
    };
  }

  private countTotalRecords(payload: BackupDataPayload): number {
    return (
      payload.wallets.length +
      payload.categories.length +
      payload.transactions.length +
      payload.transfers.length +
      payload.budgets.length +
      payload.savingGoals.length
    );
  }

  private async invalidateUserCaches(userId: string): Promise<void> {
    try {
      await Promise.all([
        cacheService.clearPattern(`finwise:cache:reports:${userId}:*`),
        cacheService.clearPattern(`finwise:cache:budgets:${userId}:*`),
        cacheService.clearPattern(`finwise:cache:wallets:${userId}:*`),
        cacheService.clearPattern(`finwise:cache:categories:${userId}:*`),
      ]);
    } catch (error) {
      console.warn('Lỗi khi xóa cache người dùng sau khi import:', error);
    }
  }
}

export const backupService = new BackupService();
