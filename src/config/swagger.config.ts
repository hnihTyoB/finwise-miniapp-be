import { SwaggerUiOptions } from 'swagger-ui-express';

export const swaggerOptions: SwaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { background-color: #1a1a2e; }
    .swagger-ui .topbar-wrapper .link img { display: none; }
    .swagger-ui .topbar-wrapper .link::after { content: 'FinWise API'; color: white; font-size: 1.2rem; font-weight: bold; }
  `,
  customSiteTitle: 'FinWise API Docs',
};

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'FinWise API',
    version: '1.0.0',
    description: 'Backend API cho FinWise - Sổ tay Chi tiêu & Báo cáo Tài chính (Zalo Mini App). API cung cấp xác thực, quản lý người dùng, ví, danh mục, giao dịch, chuyển tiền, ngân sách, mục tiêu tiết kiệm và Trợ lý Tài chính AI.',
    contact: { name: 'FinWise Team' },
  },
  servers: [
    { url: '/api/v1', description: 'Development server' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Sử dụng header Authorization: Bearer <accessToken>',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Sử dụng header X-API-Key: fw_live_<secret_key> cho hệ thống bên ngoài',
      },
    },
    schemas: {
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalPages: { type: 'integer', example: 3 },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Error message' },
          code: { type: 'string', example: 'NOT_FOUND' },
        },
      },
      Role: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'ADMIN' },
          description: { type: 'string', nullable: true },
          isSystem: { type: 'boolean', example: true },
        },
      },
      Permission: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'USER_READ' },
          description: { type: 'string', nullable: true },
          resource: { type: 'string', example: 'USER' },
          action: { type: 'string', example: 'READ' },
          isSystem: { type: 'boolean', example: true },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', format: 'uri', nullable: true },
          avatarPositionX: { type: 'integer', minimum: 0, maximum: 100, example: 50 },
          avatarPositionY: { type: 'integer', minimum: 0, maximum: 100, example: 50 },
          phoneNumber: { type: 'string', nullable: true, example: '0912345678' },
          roleId: { type: 'string', format: 'uuid' },
          role: { $ref: '#/components/schemas/Role' },
          permissions: { type: 'array', items: { type: 'string' } },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SystemSetting: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          key: { type: 'string', example: 'system.maintenance.enabled' },
          value: { type: 'string', example: 'false' },
          type: { type: 'string', enum: ['STRING', 'NUMBER', 'BOOLEAN', 'JSON'], example: 'BOOLEAN' },
          category: { type: 'string', enum: ['GENERAL', 'SECURITY', 'NOTIFICATION', 'AI', 'SYSTEM'], example: 'SYSTEM' },
          description: { type: 'string', nullable: true, example: 'Bật/tắt chế độ bảo trì hệ thống' },
          isEditable: { type: 'boolean', example: true },
          isPublic: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UpdateSystemSettingBody: {
        type: 'object',
        required: ['value'],
        properties: {
          value: { description: 'Giá trị cấu hình mới', example: true },
          description: { type: 'string', example: 'Mô tả tham số' },
        },
      },
      MaintenanceModeBody: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Hệ thống đang bảo trì để nâng cấp định kỳ.' },
          startAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-08-23T22:00:00Z' },
          endAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-08-23T23:00:00Z' },
        },
      },
      PublicSystemConfig: {
        type: 'object',
        properties: {
          appName: { type: 'string', example: 'FinWise' },
          appVersion: { type: 'string', example: '1.0.0' },
          maintenance: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', example: false },
              message: { type: 'string', example: 'Hệ thống đang bảo trì để nâng cấp.' },
              startAt: { type: 'string', format: 'date-time', nullable: true },
              endAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
          features: {
            type: 'object',
            properties: {
              inAppNotificationEnabled: { type: 'boolean', example: true },
              aiAssistantEnabled: { type: 'boolean', example: true },
              aiForecastingEnabled: { type: 'boolean', example: true },
              aiAnomaliesEnabled: { type: 'boolean', example: true },
              aiQueryEnabled: { type: 'boolean', example: true },
            },
          },
        },
      },
      NotificationOverview: {
        type: 'object',
        properties: {
          totalNotifications: { type: 'integer', example: 1250 },
          totalSent: { type: 'integer', example: 1200 },
          totalFailed: { type: 'integer', example: 35 },
          totalPending: { type: 'integer', example: 15 },
          totalRead: { type: 'integer', example: 980 },
          totalUnread: { type: 'integer', example: 220 },
          deliverySuccessRate: { type: 'number', example: 97.2 },
          channelBreakdown: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                channel: { type: 'string', example: 'IN_APP' },
                sent: { type: 'integer', example: 800 },
                failed: { type: 'integer', example: 10 },
                total: { type: 'integer', example: 810 },
              },
            },
          },
          typeBreakdown: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', example: 'TRANSACTION_ALERT' },
                count: { type: 'integer', example: 600 },
              },
            },
          },
        },
      },
      AdminNotificationDelivery: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          notificationId: { type: 'string', format: 'uuid' },
          channel: { type: 'string', enum: ['IN_APP', 'EMAIL', 'PUSH', 'ZALO'], example: 'EMAIL' },
          status: { type: 'string', enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'], example: 'SENT' },
          attemptCount: { type: 'integer', example: 1 },
          lastAttemptAt: { type: 'string', format: 'date-time', nullable: true },
          failureReason: { type: 'string', nullable: true },
          sentAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              fullName: { type: 'string', nullable: true },
            },
          },
          notification: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string', example: 'Cảnh báo hạn mức' },
              message: { type: 'string', example: 'Bạn đã sử dụng 85% hạn mức ngân sách Ăn uống.' },
              type: { type: 'string', example: 'BUDGET_WARNING' },
            },
          },
        },
      },
      NotificationTemplate: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', example: 'BUDGET_WARNING' },
          channel: { type: 'string', enum: ['IN_APP', 'EMAIL', 'PUSH', 'ZALO'], example: 'IN_APP' },
          language: { type: 'string', enum: ['vi', 'en'], example: 'vi' },
          titleTemplate: { type: 'string', example: 'Cảnh báo: Ngân sách {{budgetName}} đã đạt {{usagePercentage}}%' },
          bodyTemplate: { type: 'string', example: 'Bạn đã chi tiêu {{spentAmount}} / {{budgetAmount}} cho hạng mục {{budgetName}}.' },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UpdateNotificationTemplateBody: {
        type: 'object',
        properties: {
          titleTemplate: { type: 'string', example: 'Tiêu đề mẫu có biến {{variable}}' },
          bodyTemplate: { type: 'string', example: 'Nội dung mẫu có biến {{variable}}' },
          isActive: { type: 'boolean', example: true },
        },
      },
      NotificationChannelConfig: {
        type: 'object',
        properties: {
          inAppEnabled: { type: 'boolean', example: true },
          emailEnabled: { type: 'boolean', example: true },
          zaloEnabled: { type: 'boolean', example: false },
          pushEnabled: { type: 'boolean', example: false },
        },
      },
      AiFeatureStatus: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'ai.assistant.enabled' },
          name: { type: 'string', example: 'Trợ lý tài chính AI Assistant' },
          description: { type: 'string', example: 'Trò chuyện và tư vấn tài chính cá nhân' },
          enabled: { type: 'boolean', example: true },
          status: { type: 'string', enum: ['ENABLED', 'DISABLED', 'DEGRADED'], example: 'ENABLED' },
          provider: { type: 'string', example: 'Google Gemini' },
          model: { type: 'string', example: 'gemini-1.5-flash' },
          settingKey: { type: 'string', example: 'ai.assistant.enabled' },
        },
      },
      AiUsageSummary: {
        type: 'object',
        properties: {
          isUsageAvailable: { type: 'boolean', example: true },
          period: { type: 'string', enum: ['today', 'week', 'month'], example: 'today' },
          totalRequests: { type: 'integer', example: 450 },
          successRequests: { type: 'integer', example: 442 },
          failedRequests: { type: 'integer', example: 8 },
          successRate: { type: 'number', example: 98.2 },
          promptTokens: { type: 'integer', example: 120500 },
          completionTokens: { type: 'integer', example: 64200 },
          totalTokens: { type: 'integer', example: 184700 },
          avgLatencyMs: { type: 'integer', example: 680 },
          rateLimitEvents: { type: 'integer', example: 3 },
          byFeature: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                feature: { type: 'string', example: 'CHAT' },
                total: { type: 'integer', example: 250 },
                success: { type: 'integer', example: 248 },
                totalTokens: { type: 'integer', example: 110000 },
                avgLatencyMs: { type: 'integer', example: 720 },
              },
            },
          },
        },
      },
      AiRequestLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid', nullable: true },
          feature: { type: 'string', example: 'CHAT' },
          provider: { type: 'string', example: 'GOOGLE_GEMINI' },
          model: { type: 'string', example: 'gemini-1.5-flash' },
          promptTokens: { type: 'integer', example: 250 },
          completionTokens: { type: 'integer', example: 140 },
          totalTokens: { type: 'integer', example: 390 },
          latencyMs: { type: 'integer', example: 520 },
          status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'RATE_LIMITED'], example: 'SUCCESS' },
          errorMessage: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AiRateLimitConfig: {
        type: 'object',
        properties: {
          maxRequests: { type: 'integer', example: 20 },
          windowMs: { type: 'integer', example: 900000 },
        },
      },

      InvalidUrlError: {
        type: 'object',
        description: 'URL không hợp lệ hoặc sử dụng scheme không được phép (chỉ http/https). Trả về khi validateUrl() parse thất bại hoặc scheme khác http/https (file://, ftp://, javascript:, data:, …).',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Only HTTP and HTTPS URLs are allowed (got "file:")' },
          code: { type: 'string', enum: ['INVALID_URL'], example: 'INVALID_URL' },
        },
      },
      PrivateIpBlockedError: {
        type: 'object',
        description: 'URL trỏ vào địa chỉ nội bộ / private bị chặn theo chính sách SSRF. Bao gồm: localhost, 127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x (link-local/AWS metadata), 0.0.0.0, ::1, fd::/8 (ULA), ::ffff: (IPv4-mapped).',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Private, local or link-local IP addresses are not allowed' },
          code: { type: 'string', enum: ['PRIVATE_IP_BLOCKED'], example: 'PRIVATE_IP_BLOCKED' },
        },
      },

      CreateUserBody: {
        type: 'object',
        required: ['email', 'password', 'roleId'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@finwise.local' },
          password: { type: 'string', minLength: 8, example: 'Admin@123456' },
          roleId: { type: 'string', format: 'uuid', example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
        },
      },
      UpdateUserBody: {
        type: 'object',
        properties: {
          isActive: { type: 'boolean' },
          roleId: { type: 'string', format: 'uuid' },
        },
      },
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@finwise.local' },
          password: { type: 'string', example: 'Admin@123456' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
        },
      },
      TokenPair: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      Session: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          deviceName: { type: 'string', example: 'Chrome trên Windows' },
          ipAddress: { type: 'string', example: '127.0.0.1' },
          createdAt: { type: 'string', format: 'date-time' },
          isCurrent: { type: 'boolean', example: false },
        },
      },
      RefreshBody: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      LogoutBody: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      RegisterBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@gmail.com' },
          password: { type: 'string', minLength: 8, example: 'User@123456' },
          fullName: { type: 'string', example: 'Nguyen Van A' },
        },
      },
      UpdateProfileBody: {
        type: 'object',
        properties: {
          fullName: { type: 'string', example: 'Nguyen Van B' },
          avatarUrl: { type: 'string', format: 'uri', nullable: true, example: 'https://example.com/avatar.jpg' },
          avatarPositionX: { type: 'integer', minimum: 0, maximum: 100, example: 50 },
          avatarPositionY: { type: 'integer', minimum: 0, maximum: 100, example: 50 },
          phoneNumber: { type: 'string', example: '0912345678' },
        },
      },
      CreatePresignedUploadBody: {
        type: 'object',
        required: ['purpose', 'fileName', 'contentType', 'fileSize'],
        properties: {
          purpose: { type: 'string', enum: ['avatar'], example: 'avatar' },
          fileName: { type: 'string', maxLength: 255, example: 'avatar.png' },
          contentType: {
            type: 'string',
            enum: ['image/jpeg', 'image/png', 'image/webp'],
            example: 'image/png',
          },
          fileSize: { type: 'integer', minimum: 1, example: 245760 },
        },
      },
      PresignedUpload: {
        type: 'object',
        required: ['uploadUrl', 'publicUrl', 'objectKey', 'expiresIn', 'requiredHeaders'],
        properties: {
          uploadUrl: { type: 'string', format: 'uri' },
          publicUrl: { type: 'string', format: 'uri' },
          objectKey: { type: 'string', example: 'avatars/user-id/random-id.png' },
          expiresIn: { type: 'integer', example: 300 },
          requiredHeaders: {
            type: 'object',
            properties: {
              'Content-Type': { type: 'string', example: 'image/png' },
            },
          },
        },
      },
      UpdatePasswordBody: {
        type: 'object',
        required: ['newPassword'],
        properties: {
          oldPassword: { type: 'string', example: 'OldPassword@123' },
          newPassword: { type: 'string', minLength: 8, example: 'NewPassword@123' },
        },
      },
      ForgotPasswordBody: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@gmail.com' },
        },
      },
      ResetPasswordBody: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string', format: 'uuid', example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
          newPassword: { type: 'string', minLength: 8, example: 'NewPassword@123' },
        },
      },
      ResendVerificationBody: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@gmail.com' },
        },
      },
      Wallet: {
        type: 'object',
        required: [
          'id',
          'name',
          'balance',
          'currency',
          'isDefault',
          'isArchived',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Cash' },
          balance: {
            type: 'string',
            pattern: '^-?\\d+(\\.\\d{1,2})?$',
            example: '1500000.00',
            description: 'Decimal string to preserve monetary precision',
          },
          currency: { type: 'string', minLength: 3, maxLength: 3, example: 'VND' },
          icon: { type: 'string', nullable: true, example: 'wallet' },
          color: { type: 'string', nullable: true, example: '#2563EB' },
          description: { type: 'string', nullable: true, example: 'Daily spending wallet' },
          isDefault: { type: 'boolean', example: true },
          isArchived: { type: 'boolean', example: false },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateWalletBody: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'Cash' },
          balance: {
            type: 'string',
            pattern: '^-?(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '1500000.00',
          },
          currency: { type: 'string', minLength: 3, maxLength: 3, default: 'VND' },
          icon: { type: 'string', nullable: true, maxLength: 100 },
          color: {
            type: 'string',
            nullable: true,
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
          description: { type: 'string', nullable: true, maxLength: 500 },
          isDefault: { type: 'boolean', default: false },
        },
      },
      UpdateWalletBody: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          balance: {
            type: 'string',
            pattern: '^-?(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
          },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          icon: { type: 'string', nullable: true, maxLength: 100 },
          color: {
            type: 'string',
            nullable: true,
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
          description: { type: 'string', nullable: true, maxLength: 500 },
        },
      },
      WalletResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/Wallet' },
            },
          },
        ],
      },
      Category: {
        type: 'object',
        required: [
          'id',
          'name',
          'type',
          'isSystem',
          'isArchived',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          name: { type: 'string', example: 'Groceries' },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          icon: { type: 'string', nullable: true, example: 'shopping-basket' },
          color: { type: 'string', nullable: true, example: '#FB923C' },
          isSystem: {
            type: 'boolean',
            description: 'System categories are shared and read-only.',
          },
          isArchived: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CategoryTreeNode: {
        allOf: [
          { $ref: '#/components/schemas/Category' },
          {
            type: 'object',
            required: ['children'],
            properties: {
              children: {
                type: 'array',
                items: { $ref: '#/components/schemas/CategoryTreeNode' },
              },
            },
          },
        ],
      },
      CreateCategoryBody: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'Coffee' },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          icon: { type: 'string', nullable: true, maxLength: 100 },
          color: {
            type: 'string',
            nullable: true,
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
        },
      },
      UpdateCategoryBody: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          icon: { type: 'string', nullable: true, maxLength: 100 },
          color: {
            type: 'string',
            nullable: true,
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
        },
      },
      CategoryResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/Category' },
            },
          },
        ],
      },
      TransactionWallet: {
        type: 'object',
        required: ['id', 'name', 'currency'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Cash' },
          currency: { type: 'string', minLength: 3, maxLength: 3, example: 'VND' },
        },
      },
      TransactionCategory: {
        type: 'object',
        required: ['id', 'name', 'type'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Groceries' },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          icon: { type: 'string', nullable: true },
          color: { type: 'string', nullable: true },
        },
      },
      Transaction: {
        type: 'object',
        required: [
          'id',
          'walletId',
          'categoryId',
          'amount',
          'type',
          'date',
          'createdAt',
          'updatedAt',
          'wallet',
          'category',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          walletId: { type: 'string', format: 'uuid' },
          categoryId: { type: 'string', format: 'uuid' },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '125000.00',
            description: 'Positive decimal string to preserve monetary precision.',
          },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          description: {
            type: 'string',
            nullable: true,
            example: 'Weekly groceries',
          },
          receiptUrl: {
            type: 'string',
            nullable: true,
            example: '/api/v1/transactions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/receipt',
            description: 'Authenticated receipt download endpoint.',
          },
          location: { type: 'string', nullable: true, example: 'District 1' },
          date: { type: 'string', format: 'date', example: '2026-08-15' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          wallet: { $ref: '#/components/schemas/TransactionWallet' },
          category: { $ref: '#/components/schemas/TransactionCategory' },
        },
      },
      CreateTransactionBody: {
        type: 'object',
        required: ['walletId', 'categoryId', 'amount', 'type', 'date'],
        properties: {
          walletId: { type: 'string', format: 'uuid' },
          categoryId: { type: 'string', format: 'uuid' },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '125000.00',
          },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          description: { type: 'string', nullable: true, maxLength: 500 },
          location: { type: 'string', nullable: true, maxLength: 255 },
          date: { type: 'string', format: 'date', example: '2026-08-15' },
        },
      },
      UpdateTransactionBody: {
        type: 'object',
        minProperties: 1,
        properties: {
          walletId: { type: 'string', format: 'uuid' },
          categoryId: { type: 'string', format: 'uuid' },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
          },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          description: { type: 'string', nullable: true, maxLength: 500 },
          location: { type: 'string', nullable: true, maxLength: 255 },
          date: { type: 'string', format: 'date', example: '2026-08-15' },
        },
      },
      TransactionResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/Transaction' },
            },
          },
        ],
      },
      TransferWallet: {
        type: 'object',
        required: ['id', 'name', 'currency', 'icon', 'color'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Daily wallet' },
          currency: { type: 'string', minLength: 3, maxLength: 3, example: 'VND' },
          icon: { type: 'string', nullable: true, example: 'wallet' },
          color: { type: 'string', nullable: true, example: '#8B7CF6' },
        },
      },
      Transfer: {
        type: 'object',
        required: [
          'id',
          'sourceWalletId',
          'destinationWalletId',
          'amount',
          'note',
          'transferredAt',
          'createdAt',
          'updatedAt',
          'sourceWallet',
          'destinationWallet',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          sourceWalletId: { type: 'string', format: 'uuid' },
          destinationWalletId: { type: 'string', format: 'uuid' },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '500000.00',
            description: 'Positive decimal string in the shared wallet currency.',
          },
          note: { type: 'string', nullable: true, maxLength: 500 },
          transferredAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          sourceWallet: { $ref: '#/components/schemas/TransferWallet' },
          destinationWallet: { $ref: '#/components/schemas/TransferWallet' },
        },
      },
      CreateTransferBody: {
        type: 'object',
        required: [
          'sourceWalletId',
          'destinationWalletId',
          'amount',
          'transferredAt',
        ],
        properties: {
          sourceWalletId: { type: 'string', format: 'uuid' },
          destinationWalletId: { type: 'string', format: 'uuid' },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '500000.00',
          },
          note: { type: 'string', nullable: true, maxLength: 500 },
          transferredAt: { type: 'string', format: 'date-time' },
        },
      },
      TransferResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/Transfer' },
            },
          },
        ],
      },
      BudgetCategory: {
        type: 'object',
        required: ['id', 'name', 'type'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Groceries' },
          type: { type: 'string', enum: ['EXPENSE'] },
          icon: { type: 'string', nullable: true },
          color: { type: 'string', nullable: true },
        },
      },
      BudgetUsage: {
        type: 'object',
        required: [
          'spentAmount',
          'remainingAmount',
          'usagePercentage',
          'transactionCount',
          'timeStatus',
          'status',
        ],
        properties: {
          spentAmount: {
            type: 'string',
            example: '850000.00',
            description: 'Sum of matching EXPENSE transactions from startDate through endDate, inclusive.',
          },
          remainingAmount: {
            type: 'string',
            example: '150000.00',
            description: 'Budget amount minus spending; negative when the budget is exceeded.',
          },
          usagePercentage: {
            type: 'string',
            example: '85.00',
            description: 'Current usage percentage with two decimal places.',
          },
          transactionCount: { type: 'integer', example: 12 },
          lastTransactionAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          timeStatus: {
            type: 'string',
            enum: ['UPCOMING', 'ACTIVE', 'ENDED'],
          },
          status: {
            type: 'string',
            enum: ['ON_TRACK', 'NEAR_LIMIT', 'EXCEEDED'],
            description: 'NEAR_LIMIT starts at alertThreshold; EXCEEDED means spending is greater than amount.',
          },
        },
      },
      Budget: {
        type: 'object',
        required: [
          'id',
          'name',
          'amount',
          'currency',
          'type',
          'period',
          'startDate',
          'endDate',
          'alertThreshold',
          'isArchived',
          'createdAt',
          'updatedAt',
          'usage',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Monthly groceries' },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '1000000.00',
          },
          currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'VND' },
          type: { type: 'string', enum: ['OVERALL', 'CATEGORY'] },
          period: {
            type: 'string',
            enum: ['CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY'],
          },
          categoryId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Required for CATEGORY and null for OVERALL.',
          },
          startDate: { type: 'string', format: 'date' },
          endDate: {
            type: 'string',
            format: 'date',
            description: 'Inclusive final business date.',
          },
          alertThreshold: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,2})?$',
            example: '80.00',
          },
          isArchived: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          category: {
            allOf: [{ $ref: '#/components/schemas/BudgetCategory' }],
            nullable: true,
          },
          usage: { $ref: '#/components/schemas/BudgetUsage' },
        },
      },
      CreateBudgetBody: {
        type: 'object',
        required: ['name', 'amount', 'type', 'period', 'startDate'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            example: 'Monthly groceries',
          },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '1000000.00',
          },
          currency: {
            type: 'string',
            pattern: '^[A-Za-z]{3}$',
            default: 'VND',
          },
          type: { type: 'string', enum: ['OVERALL', 'CATEGORY'] },
          period: {
            type: 'string',
            enum: ['CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY'],
          },
          categoryId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Required for CATEGORY; the category must be active and have type EXPENSE.',
          },
          startDate: { type: 'string', format: 'date' },
          endDate: {
            type: 'string',
            format: 'date',
            description: 'Required only for CUSTOM. Omit for recurring periods.',
          },
          alertThreshold: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,2})?$',
            default: '80',
            example: '80',
          },
        },
      },
      UpdateBudgetBody: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
          },
          currency: { type: 'string', pattern: '^[A-Za-z]{3}$' },
          type: { type: 'string', enum: ['OVERALL', 'CATEGORY'] },
          period: {
            type: 'string',
            enum: ['CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY'],
          },
          categoryId: { type: 'string', format: 'uuid', nullable: true },
          startDate: { type: 'string', format: 'date' },
          endDate: {
            type: 'string',
            format: 'date',
            description: 'Accepted only when the resulting period is CUSTOM.',
          },
          alertThreshold: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,2})?$',
          },
        },
      },
      BudgetResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/Budget' },
            },
          },
        ],
      },
      SavingGoalProgress: {
        type: 'object',
        required: [
          'savedAmount',
          'remainingAmount',
          'progressPercentage',
          'contributionCount',
          'daysRemaining',
          'isOverdue',
        ],
        properties: {
          savedAmount: {
            type: 'string',
            pattern: '^\\d+(\\.\\d{2})$',
            example: '5000000.00',
          },
          remainingAmount: {
            type: 'string',
            pattern: '^\\d+(\\.\\d{2})$',
            example: '15000000.00',
          },
          progressPercentage: {
            type: 'string',
            pattern: '^\\d+(\\.\\d{2})$',
            example: '25.00',
            description: 'May exceed 100 when contributions exceed the target.',
          },
          contributionCount: { type: 'integer', example: 5 },
          lastContributionAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          daysRemaining: {
            type: 'integer',
            minimum: 0,
            description: 'Whole calendar-day estimate, clamped to zero.',
          },
          isOverdue: { type: 'boolean' },
        },
      },
      SavingGoal: {
        type: 'object',
        required: [
          'id',
          'name',
          'targetAmount',
          'currency',
          'targetDate',
          'status',
          'isArchived',
          'createdAt',
          'updatedAt',
          'progress',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Buy a laptop' },
          targetAmount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '20000000.00',
          },
          currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'VND' },
          targetDate: { type: 'string', format: 'date' },
          description: { type: 'string', nullable: true },
          icon: { type: 'string', nullable: true },
          color: { type: 'string', nullable: true, example: '#2563EB' },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'PAUSED', 'COMPLETED'],
            description: 'COMPLETED is managed automatically from contribution totals.',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          isArchived: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          progress: { $ref: '#/components/schemas/SavingGoalProgress' },
        },
      },
      CreateSavingGoalBody: {
        type: 'object',
        required: ['name', 'targetAmount', 'targetDate'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          targetAmount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '20000000.00',
          },
          currency: {
            type: 'string',
            pattern: '^[A-Za-z]{3}$',
            default: 'VND',
          },
          targetDate: {
            type: 'string',
            format: 'date',
            description: 'Must be in the future.',
          },
          description: { type: 'string', nullable: true, maxLength: 500 },
          icon: { type: 'string', nullable: true, maxLength: 100 },
          color: {
            type: 'string',
            nullable: true,
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
        },
      },
      UpdateSavingGoalBody: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          targetAmount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
          },
          currency: { type: 'string', pattern: '^[A-Za-z]{3}$' },
          targetDate: {
            type: 'string',
            format: 'date',
            description: 'Must be in the future.',
          },
          description: { type: 'string', nullable: true, maxLength: 500 },
          icon: { type: 'string', nullable: true, maxLength: 100 },
          color: {
            type: 'string',
            nullable: true,
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'PAUSED'],
            description: 'Clients cannot set COMPLETED directly.',
          },
        },
      },
      SavingContribution: {
        type: 'object',
        required: [
          'id',
          'savingGoalId',
          'amount',
          'contributedAt',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          savingGoalId: { type: 'string', format: 'uuid' },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '1000000.00',
          },
          contributedAt: { type: 'string', format: 'date-time' },
          note: { type: 'string', nullable: true, maxLength: 500 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateSavingContributionBody: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            example: '1000000.00',
          },
          contributedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Defaults to now and cannot be in the future.',
          },
          note: { type: 'string', nullable: true, maxLength: 500 },
        },
      },
      UpdateSavingContributionBody: {
        type: 'object',
        minProperties: 1,
        properties: {
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
          },
          contributedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Cannot be in the future.',
          },
          note: { type: 'string', nullable: true, maxLength: 500 },
        },
      },
      SavingGoalResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/SavingGoal' },
            },
          },
        ],
      },
      SavingContributionMutation: {
        type: 'object',
        required: ['contribution', 'goal'],
        properties: {
          contribution: { $ref: '#/components/schemas/SavingContribution' },
          goal: { $ref: '#/components/schemas/SavingGoal' },
        },
      },
      NotificationDelivery: {
        type: 'object',
        required: ['channel', 'status', 'attemptCount'],
        properties: {
          channel: {
            type: 'string',
            enum: ['EMAIL', 'ZALO', 'PUSH'],
          },
          status: {
            type: 'string',
            enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED'],
          },
          attemptCount: { type: 'integer', minimum: 0 },
          sentAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Notification: {
        type: 'object',
        required: [
          'id',
          'type',
          'priority',
          'title',
          'message',
          'channels',
          'readAt',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: {
            type: 'string',
            enum: [
              'BUDGET_NEAR_LIMIT',
              'BUDGET_EXCEEDED',
              'SAVING_GOAL_NEAR_TARGET',
              'SAVING_GOAL_ACHIEVED',
              'SAVING_GOAL_DUE_SOON',
              'RECURRING_PAYMENT_DUE',
              'UNUSUAL_TRANSACTION',
              'USER_REMINDER',
              'SYSTEM',
            ],
          },
          priority: {
            type: 'string',
            enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
          },
          title: { type: 'string', maxLength: 160 },
          message: { type: 'string' },
          channels: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['IN_APP', 'EMAIL', 'ZALO', 'PUSH'],
            },
          },
          data: { type: 'object', nullable: true, additionalProperties: true },
          actionUrl: { type: 'string', nullable: true },
          sourceType: {
            type: 'string',
            nullable: true,
            enum: ['BUDGET', 'SAVING_GOAL', 'TRANSACTION', 'REMINDER', 'SYSTEM'],
          },
          sourceId: { type: 'string', format: 'uuid', nullable: true },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          deliveries: {
            type: 'array',
            items: { $ref: '#/components/schemas/NotificationDelivery' },
          },
        },
      },
      NotificationSetting: {
        type: 'object',
        required: [
          'channels',
          'budgetAlertsEnabled',
          'savingGoalAlertsEnabled',
          'reminderAlertsEnabled',
          'unusualTxnAlertsEnabled',
        ],
        properties: {
          channels: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['IN_APP', 'EMAIL', 'ZALO', 'PUSH'],
            },
          },
          budgetAlertsEnabled: { type: 'boolean' },
          savingGoalAlertsEnabled: { type: 'boolean' },
          reminderAlertsEnabled: { type: 'boolean' },
          unusualTxnAlertsEnabled: { type: 'boolean' },
        },
      },
      UpdateNotificationSettingBody: {
        type: 'object',
        minProperties: 1,
        description: 'Partial update; omitted properties retain their current values.',
        properties: {
          channels: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['IN_APP', 'EMAIL', 'ZALO', 'PUSH'],
            },
          },
          budgetAlertsEnabled: { type: 'boolean' },
          savingGoalAlertsEnabled: { type: 'boolean' },
          reminderAlertsEnabled: { type: 'boolean' },
          unusualTxnAlertsEnabled: { type: 'boolean' },
        },
      },
      Reminder: {
        type: 'object',
        required: [
          'id',
          'type',
          'title',
          'remindAt',
          'frequency',
          'repeatInterval',
          'isActive',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['GENERAL', 'RECURRING_PAYMENT'] },
          title: { type: 'string', maxLength: 160 },
          message: { type: 'string', nullable: true, maxLength: 2000 },
          remindAt: { type: 'string', format: 'date-time' },
          frequency: {
            type: 'string',
            enum: ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
          },
          repeatInterval: { type: 'integer', minimum: 1, maximum: 365 },
          endAt: { type: 'string', format: 'date-time', nullable: true },
          nextTriggerAt: { type: 'string', format: 'date-time', nullable: true },
          lastTriggeredAt: { type: 'string', format: 'date-time', nullable: true },
          actionUrl: { type: 'string', nullable: true, maxLength: 500 },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateReminderBody: {
        type: 'object',
        required: ['title', 'remindAt'],
        properties: {
          type: {
            type: 'string',
            enum: ['GENERAL', 'RECURRING_PAYMENT'],
            default: 'GENERAL',
          },
          title: { type: 'string', minLength: 1, maxLength: 160 },
          message: { type: 'string', nullable: true, maxLength: 2000 },
          remindAt: { type: 'string', format: 'date-time' },
          frequency: {
            type: 'string',
            enum: ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
            default: 'ONCE',
          },
          repeatInterval: {
            type: 'integer',
            minimum: 1,
            maximum: 365,
            default: 1,
          },
          endAt: { type: 'string', format: 'date-time', nullable: true },
          actionUrl: {
            type: 'string',
            nullable: true,
            description: 'App-relative path or HTTPS URL.',
          },
          isActive: { type: 'boolean', default: true },
        },
      },
      UpdateReminderBody: {
        type: 'object',
        minProperties: 1,
        description: 'Partial update; omitted properties retain their current values.',
        properties: {
          type: { type: 'string', enum: ['GENERAL', 'RECURRING_PAYMENT'] },
          title: { type: 'string', minLength: 1, maxLength: 160 },
          message: { type: 'string', nullable: true, maxLength: 2000 },
          remindAt: { type: 'string', format: 'date-time' },
          frequency: {
            type: 'string',
            enum: ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
          },
          repeatInterval: { type: 'integer', minimum: 1, maximum: 365 },
          endAt: { type: 'string', format: 'date-time', nullable: true },
          actionUrl: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
        },
      },
      RecurringTransactionSchedule: {
        type: 'object',
        required: ['id', 'walletId', 'categoryId', 'amount', 'type', 'frequency', 'repeatInterval', 'anchorDate', 'missedRunPolicy', 'isActive'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          walletId: { type: 'string', format: 'uuid' },
          categoryId: { type: 'string', format: 'uuid' },
          amount: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$', example: '250000.00' },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          description: { type: 'string', nullable: true, maxLength: 500 },
          location: { type: 'string', nullable: true, maxLength: 255 },
          frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
          repeatInterval: { type: 'integer', minimum: 1, maximum: 365 },
          anchorDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date', nullable: true },
          nextRunAt: { type: 'string', format: 'date', nullable: true },
          missedRunPolicy: { type: 'string', enum: ['SKIP', 'CATCH_UP'] },
          lastRunAt: { type: 'string', format: 'date-time', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateRecurringTransactionBody: {
        type: 'object',
        required: ['walletId', 'categoryId', 'amount', 'type', 'frequency', 'anchorDate'],
        properties: {
          walletId: { type: 'string', format: 'uuid' },
          categoryId: { type: 'string', format: 'uuid' },
          amount: { type: 'string', example: '250000.00' },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          description: { type: 'string', nullable: true, maxLength: 500 },
          location: { type: 'string', nullable: true, maxLength: 255 },
          frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
          repeatInterval: { type: 'integer', minimum: 1, maximum: 365, default: 1 },
          anchorDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date', nullable: true },
          missedRunPolicy: { type: 'string', enum: ['SKIP', 'CATCH_UP'], default: 'SKIP' },
          isActive: { type: 'boolean', default: true },
        },
      },
      RecurringTransactionResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          { type: 'object', properties: { data: { $ref: '#/components/schemas/RecurringTransactionSchedule' } } },
        ],
      },
      NotificationResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/Notification' },
            },
          },
        ],
      },
      ReminderResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/Reminder' },
            },
          },
        ],
      },
      ReportPeriod: {
        type: 'object',
        required: ['preset', 'from', 'to', 'timeZone', 'generatedAt'],
        properties: {
          preset: {
            type: 'string',
            enum: ['DAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM'],
          },
          from: {
            type: 'string',
            format: 'date-time',
            description: 'Inclusive report boundary.',
          },
          to: {
            type: 'string',
            format: 'date-time',
            description: 'Exclusive report boundary.',
          },
          timeZone: {
            type: 'string',
            enum: ['Asia/Ho_Chi_Minh'],
            description: 'Business timezone used to resolve calendar boundaries.',
          },
          generatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ReportMoneyFlow: {
        type: 'object',
        required: ['currency', 'income', 'expense', 'netCashFlow', 'transactionCount'],
        properties: {
          currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'VND' },
          income: { type: 'string', example: '20000000.00' },
          expense: { type: 'string', example: '12000000.00' },
          netCashFlow: { type: 'string', example: '8000000.00' },
          transactionCount: { type: 'integer', example: 32 },
        },
      },
      ReportFinancialMetric: {
        allOf: [
          { $ref: '#/components/schemas/ReportMoneyFlow' },
          {
            type: 'object',
            required: ['currentBalance', 'savingsRate', 'expenseToIncomeRatio'],
            properties: {
              currentBalance: { type: 'string', example: '42000000.00' },
              savingsRate: {
                type: 'string',
                nullable: true,
                example: '40.00',
                description: 'netCashFlow / income * 100; null when income is zero.',
              },
              expenseToIncomeRatio: {
                type: 'string',
                nullable: true,
                example: '60.00',
                description: 'expense / income * 100; null when income is zero.',
              },
            },
          },
        ],
      },
      ReportWallet: {
        type: 'object',
        required: ['id', 'name', 'currency', 'balance', 'isDefault', 'isArchived'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Cash' },
          currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'VND' },
          balance: { type: 'string', example: '5000000.00' },
          isDefault: { type: 'boolean' },
          isArchived: { type: 'boolean' },
        },
      },
      ReportBudgetTypeSummary: {
        type: 'object',
        required: [
          'currency',
          'type',
          'budgetCount',
          'budgetAmount',
          'spentAmount',
          'remainingAmount',
          'usagePercentage',
          'onTrackCount',
          'nearLimitCount',
          'exceededCount',
        ],
        properties: {
          currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'VND' },
          type: { type: 'string', enum: ['OVERALL', 'CATEGORY'] },
          budgetCount: { type: 'integer' },
          budgetAmount: { type: 'string', example: '15000000.00' },
          spentAmount: { type: 'string', example: '9000000.00' },
          remainingAmount: { type: 'string', example: '6000000.00' },
          usagePercentage: { type: 'string', example: '60.00' },
          onTrackCount: { type: 'integer' },
          nearLimitCount: { type: 'integer' },
          exceededCount: { type: 'integer' },
        },
      },
      ReportSavingGoalSummary: {
        type: 'object',
        required: [
          'totalGoals',
          'activeCount',
          'pausedCount',
          'completedCount',
          'byCurrency',
        ],
        properties: {
          totalGoals: { type: 'integer' },
          activeCount: { type: 'integer' },
          pausedCount: { type: 'integer' },
          completedCount: { type: 'integer' },
          byCurrency: {
            type: 'array',
            items: {
              type: 'object',
              required: [
                'currency',
                'targetAmount',
                'savedAmount',
                'remainingAmount',
                'contributedInPeriod',
                'progressPercentage',
              ],
              properties: {
                currency: { type: 'string', pattern: '^[A-Z]{3}$' },
                targetAmount: { type: 'string' },
                savedAmount: { type: 'string' },
                remainingAmount: { type: 'string' },
                contributedInPeriod: { type: 'string' },
                progressPercentage: { type: 'string' },
              },
            },
          },
        },
      },
      FinancialOverviewReport: {
        type: 'object',
        required: ['period', 'metricsByCurrency', 'wallets', 'budgets', 'savingGoals'],
        properties: {
          period: { $ref: '#/components/schemas/ReportPeriod' },
          metricsByCurrency: {
            type: 'array',
            items: { $ref: '#/components/schemas/ReportFinancialMetric' },
          },
          wallets: {
            type: 'object',
            required: ['totalWallets', 'archivedWallets', 'items'],
            properties: {
              totalWallets: { type: 'integer' },
              archivedWallets: { type: 'integer' },
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/ReportWallet' },
              },
            },
          },
          budgets: {
            type: 'object',
            required: ['totalBudgets', 'byType'],
            properties: {
              totalBudgets: { type: 'integer' },
              byType: {
                type: 'array',
                items: { $ref: '#/components/schemas/ReportBudgetTypeSummary' },
              },
            },
          },
          savingGoals: { $ref: '#/components/schemas/ReportSavingGoalSummary' },
        },
      },
      CashFlowReport: {
        type: 'object',
        required: ['period', 'granularity', 'totalsByCurrency', 'series'],
        properties: {
          period: { $ref: '#/components/schemas/ReportPeriod' },
          granularity: {
            type: 'string',
            enum: ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'],
          },
          totalsByCurrency: {
            type: 'array',
            items: { $ref: '#/components/schemas/ReportMoneyFlow' },
          },
          series: {
            type: 'array',
            maxItems: 400,
            items: {
              type: 'object',
              required: ['from', 'to', 'metricsByCurrency'],
              properties: {
                from: { type: 'string', format: 'date-time' },
                to: { type: 'string', format: 'date-time' },
                metricsByCurrency: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ReportMoneyFlow' },
                },
              },
            },
          },
        },
      },
      SpendingByCategoryReport: {
        type: 'object',
        required: ['period', 'currencies'],
        properties: {
          period: { $ref: '#/components/schemas/ReportPeriod' },
          currencies: {
            type: 'array',
            items: {
              type: 'object',
              required: ['currency', 'totalExpense', 'transactionCount', 'categories'],
              properties: {
                currency: { type: 'string', pattern: '^[A-Z]{3}$' },
                totalExpense: { type: 'string' },
                transactionCount: { type: 'integer' },
                categories: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['category', 'amount', 'percentage', 'transactionCount'],
                    properties: {
                      category: {
                        type: 'object',
                        required: ['id', 'name'],
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          icon: { type: 'string', nullable: true },
                          color: { type: 'string', nullable: true },
                        },
                      },
                      amount: { type: 'string' },
                      percentage: { type: 'string' },
                      transactionCount: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      BudgetPerformanceReport: {
        type: 'object',
        required: ['period', 'summary', 'budgets'],
        properties: {
          period: { $ref: '#/components/schemas/ReportPeriod' },
          summary: {
            type: 'object',
            required: ['totalBudgets', 'byType'],
            properties: {
              totalBudgets: { type: 'integer' },
              byType: {
                type: 'array',
                items: { $ref: '#/components/schemas/ReportBudgetTypeSummary' },
              },
            },
          },
          budgets: {
            type: 'array',
            items: {
              type: 'object',
              required: [
                'id',
                'name',
                'type',
                'currency',
                'period',
                'budgetAmount',
                'spentAmount',
                'remainingAmount',
                'usagePercentage',
                'transactionCount',
                'status',
                'reportFrom',
                'reportTo',
                'budgetFrom',
                'budgetTo',
                'isArchived',
              ],
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                type: { type: 'string', enum: ['OVERALL', 'CATEGORY'] },
                currency: { type: 'string', pattern: '^[A-Z]{3}$' },
                period: {
                  type: 'string',
                  enum: ['CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY'],
                },
                category: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    icon: { type: 'string', nullable: true },
                    color: { type: 'string', nullable: true },
                  },
                },
                budgetAmount: { type: 'string' },
                spentAmount: { type: 'string' },
                remainingAmount: { type: 'string' },
                usagePercentage: { type: 'string' },
                transactionCount: { type: 'integer' },
                status: {
                  type: 'string',
                  enum: ['ON_TRACK', 'NEAR_LIMIT', 'EXCEEDED'],
                },
                reportFrom: { type: 'string', format: 'date-time' },
                reportTo: { type: 'string', format: 'date-time' },
                budgetFrom: { type: 'string', format: 'date-time' },
                budgetTo: { type: 'string', format: 'date-time' },
                isArchived: { type: 'boolean' },
              },
            },
          },
        },
      },
      AIAnalysisScope: {
        type: 'object',
        properties: {
          dateFrom: {
            type: 'string',
            format: 'date-time',
            description: 'Inclusive boundary. Must be supplied together with dateTo.',
          },
          dateTo: {
            type: 'string',
            format: 'date-time',
            description: 'Exclusive boundary. Analysis ranges are limited to 366 days.',
          },
          currency: {
            type: 'string',
            pattern: '^[A-Za-z]{3}$',
            example: 'VND',
          },
        },
      },
      AICategorizeBody: {
        type: 'object',
        required: ['description'],
        properties: {
          description: { type: 'string', minLength: 2, maxLength: 500 },
          amount: {
            type: 'string',
            pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
          },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          merchant: { type: 'string', minLength: 1, maxLength: 200 },
          occurredAt: { type: 'string', format: 'date-time' },
        },
      },
      AIChatBody: {
        allOf: [
          { $ref: '#/components/schemas/AIAnalysisScope' },
          {
            type: 'object',
            required: ['question'],
            properties: {
              question: { type: 'string', minLength: 3, maxLength: 1000 },
            },
          },
        ],
      },
      AIInsightsBody: {
        allOf: [
          { $ref: '#/components/schemas/AIAnalysisScope' },
          {
            type: 'object',
            properties: {
              focus: {
                type: 'string',
                enum: ['ALL', 'SPENDING', 'INCOME', 'CASH_FLOW'],
                default: 'ALL',
              },
            },
          },
        ],
      },
      AIRecommendationsBody: {
        allOf: [
          { $ref: '#/components/schemas/AIAnalysisScope' },
          {
            type: 'object',
            properties: {
              priority: {
                type: 'string',
                enum: ['BALANCED', 'REDUCE_SPENDING', 'GROW_SAVINGS'],
                default: 'BALANCED',
              },
            },
          },
        ],
      },
      AIResponseMeta: {
        type: 'object',
        required: ['provider', 'model', 'usage'],
        properties: {
          provider: { type: 'string', example: 'gemini' },
          model: { type: 'string', example: 'gemini-3.5-flash-lite' },
          usage: {
            type: 'object',
            properties: {
              promptTokens: { type: 'integer', nullable: true },
              completionTokens: { type: 'integer', nullable: true },
              totalTokens: { type: 'integer', nullable: true },
            },
          },
          context: {
            type: 'object',
            properties: {
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' },
              currency: { type: 'string', nullable: true },
              transactionCount: { type: 'integer' },
              totalTransactionCount: { type: 'integer' },
              truncated: { type: 'boolean' },
            },
          },
        },
      },
      AICategory: {
        type: 'object',
        required: ['id', 'name', 'type', 'isSystem'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          isSystem: { type: 'boolean' },
        },
      },
      AICategorizeResult: {
        type: 'object',
        required: ['category', 'confidence', 'reasoning'],
        properties: {
          category: { $ref: '#/components/schemas/AICategory' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
        },
      },
      AIReceiptResult: {
        type: 'object',
        required: [
          'merchant',
          'transactionDate',
          'totalAmount',
          'currency',
          'taxAmount',
          'category',
          'lineItems',
          'rawText',
          'confidence',
          'warnings',
        ],
        properties: {
          merchant: { type: 'string', nullable: true },
          transactionDate: { type: 'string', format: 'date', nullable: true },
          totalAmount: { type: 'string', nullable: true },
          currency: { type: 'string', nullable: true },
          taxAmount: { type: 'string', nullable: true },
          category: {
            allOf: [{ $ref: '#/components/schemas/AICategory' }],
            nullable: true,
          },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number', nullable: true },
                unitPrice: { type: 'string', nullable: true },
                totalAmount: { type: 'string', nullable: true },
              },
            },
          },
          rawText: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      AIChatResult: {
        type: 'object',
        required: ['answer', 'highlights', 'caveats', 'suggestedActions'],
        properties: {
          answer: { type: 'string' },
          highlights: { type: 'array', items: { type: 'string' } },
          caveats: { type: 'array', items: { type: 'string' } },
          suggestedActions: { type: 'array', items: { type: 'string' } },
        },
      },
      AIInsightsResult: {
        type: 'object',
        required: ['summary', 'trends', 'anomalies', 'recommendations'],
        properties: {
          summary: { type: 'string' },
          trends: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                direction: { type: 'string', enum: ['UP', 'DOWN', 'STABLE'] },
                description: { type: 'string' },
                evidence: { type: 'string' },
              },
            },
          },
          anomalies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                description: { type: 'string' },
                evidence: { type: 'string' },
              },
            },
          },
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                description: { type: 'string' },
              },
            },
          },
        },
      },
      AIRecommendationsResult: {
        type: 'object',
        required: ['summary', 'budgetRecommendations', 'savingRecommendations', 'actions'],
        properties: {
          summary: { type: 'string' },
          budgetRecommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                categoryName: { type: 'string', nullable: true },
                currency: { type: 'string' },
                suggestedLimit: { type: 'string' },
                rationale: { type: 'string' },
              },
            },
          },
          savingRecommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                goalName: { type: 'string', nullable: true },
                currency: { type: 'string' },
                suggestedMonthlyContribution: { type: 'string' },
                rationale: { type: 'string' },
              },
            },
          },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                description: { type: 'string' },
              },
            },
          },
        },
      },
      ApiKey: {
        type: 'object',
        required: ['id', 'name', 'keyPrefix', 'permissions', 'ipWhitelist', 'status', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Zapier Accounting Sync' },
          keyPrefix: { type: 'string', example: 'fw_live_a1b2c3d4' },
          permissions: { type: 'array', items: { type: 'string' }, example: ['TRANSACTION_CREATE', 'JOB_CREATE'] },
          ipWhitelist: { type: 'array', items: { type: 'string' }, example: ['203.113.130.1', '198.51.100.2'] },
          status: { type: 'string', enum: ['ACTIVE', 'REVOKED', 'EXPIRED'] },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateApiKeyBody: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'Zapier Accounting Sync' },
          permissions: { type: 'array', items: { type: 'string' }, example: ['TRANSACTION_CREATE', 'WALLET_READ'] },
          ipWhitelist: { type: 'array', items: { type: 'string' }, example: ['203.113.130.1'] },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      CreateApiKeyResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  apiKey: { $ref: '#/components/schemas/ApiKey' },
                  rawKey: { type: 'string', example: 'fw_live_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d' },
                },
              },
              message: { type: 'string' },
            },
          },
        ],
      },
      ApiKeyListResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { $ref: '#/components/schemas/ApiKey' },
              },
            },
          },
        ],
      },
      WebhookEndpoint: {
        type: 'object',
        required: ['id', 'url', 'events', 'status', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri', example: 'https://webhook.site/my-endpoint' },
          description: { type: 'string', nullable: true, example: 'Production Webhook Receiver' },
          events: { type: 'array', items: { type: 'string' }, example: ['job.completed', 'job.failed'] },
          status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateWebhookBody: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', example: 'https://api.external-system.com/webhooks/finwise' },
          description: { type: 'string', maxLength: 255 },
          events: { type: 'array', items: { type: 'string' }, example: ['job.completed', 'job.failed'] },
        },
      },
      UpdateWebhookBody: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          description: { type: 'string', maxLength: 255 },
          events: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
        },
      },
      CreateWebhookResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  endpoint: { $ref: '#/components/schemas/WebhookEndpoint' },
                  secret: { type: 'string', example: 'whsec_9876543210abcdef1234567890' },
                },
              },
              message: { type: 'string' },
            },
          },
        ],
      },
      WebhookListResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { $ref: '#/components/schemas/WebhookEndpoint' },
              },
            },
          },
        ],
      },
      WebhookDelivery: {
        type: 'object',
        required: ['id', 'eventId', 'event', 'status', 'attemptCount', 'maxAttempts', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          eventId: { type: 'string', example: 'evt_12345678-9abc' },
          event: { type: 'string', example: 'job.completed' },
          status: { type: 'string', enum: ['PENDING', 'SUCCESS', 'FAILED'] },
          statusCode: { type: 'integer', nullable: true, example: 200 },
          responseBody: { type: 'string', nullable: true },
          attemptCount: { type: 'integer', example: 1 },
          maxAttempts: { type: 'integer', example: 5 },
          lastAttemptAt: { type: 'string', format: 'date-time', nullable: true },
          nextRetryAt: { type: 'string', format: 'date-time', nullable: true },
          errorMessage: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      WebhookDeliveryListResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { $ref: '#/components/schemas/WebhookDelivery' },
              },
            },
          },
        ],
      },
      AsyncJob: {
        type: 'object',
        required: ['id', 'userId', 'type', 'status', 'attempt', 'maxAttempts', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          type: { type: 'string', example: 'REPORT_EXPORT' },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
          input: { type: 'object', additionalProperties: true },
          result: { type: 'object', additionalProperties: true, nullable: true },
          error: { type: 'string', nullable: true },
          attempt: { type: 'integer', example: 1 },
          maxAttempts: { type: 'integer', example: 3 },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateAsyncJobBody: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', example: 'REPORT_EXPORT' },
          input: { type: 'object', additionalProperties: true },
        },
      },
      AsyncJobResponse: {
        allOf: [
          { $ref: '#/components/schemas/SuccessResponse' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/AsyncJob' },
              message: { type: 'string' },
            },
          },
        ],
      },
    },
    parameters: {
      PageParam: { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
      LimitParam: { in: 'query', name: 'limit', schema: { type: 'integer', default: 20, maximum: 100 } },
      OrderParam: { in: 'query', name: 'order', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
      NotificationIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      ReminderIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      RecurringTransactionIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      WalletIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Wallet ID',
      },
      CategoryIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Category ID',
      },
      TransactionIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Transaction ID',
      },
      TransferIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Transfer ID',
      },
      BudgetIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Budget ID',
      },
      SavingGoalIdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Saving goal ID',
      },
      SavingContributionIdParam: {
        in: 'path',
        name: 'contributionId',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Saving contribution ID',
      },
      ReportPeriodParam: {
        in: 'query',
        name: 'period',
        schema: {
          type: 'string',
          enum: ['DAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM'],
          default: 'MONTH',
        },
      },
      ReportDateFromParam: {
        in: 'query',
        name: 'dateFrom',
        schema: { type: 'string', format: 'date-time' },
        description: 'Required only for CUSTOM; inclusive boundary.',
      },
      ReportDateToParam: {
        in: 'query',
        name: 'dateTo',
        schema: { type: 'string', format: 'date-time' },
        description: 'Required only for CUSTOM; exclusive boundary. Custom ranges are limited to 1830 days.',
      },
      ReportWalletParam: {
        in: 'query',
        name: 'walletId',
        schema: { type: 'string', format: 'uuid' },
        description: 'Optional owned wallet scope.',
      },
      ReportCurrencyParam: {
        in: 'query',
        name: 'currency',
        schema: { type: 'string', pattern: '^[A-Za-z]{3}$', example: 'VND' },
        description: 'Optional ISO-style currency filter. Monetary totals are never mixed across currencies.',
      },
    },
    responses: {
      Unauthorized: { description: 'Chưa đăng nhập', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      Forbidden: { description: 'Không có quyền', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      NotFound: { description: 'Không tìm thấy', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      Validation: { description: 'Dữ liệu không hợp lệ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      Conflict: { description: 'Xung đột dữ liệu', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      AIRateLimit: { description: 'Đã vượt giới hạn yêu cầu AI theo người dùng', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      AIInvalidResponse: { description: 'Phản hồi AI không vượt qua kiểm tra cấu trúc', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      AIUnavailable: { description: 'AI chưa được cấu hình hoặc tạm thời không khả dụng', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    },
  },
  tags: [
    { name: 'System', description: 'Health check và cấu hình hệ thống' },
    { name: 'Auth', description: 'Authentication endpoints' },
    { name: 'API Keys', description: 'Tích hợp API Key cho hệ thống bên ngoài' },
    { name: 'Webhooks', description: 'Đăng ký Webhook endpoints, chữ ký HMAC, retry BullMQ' },
    { name: 'Jobs', description: 'Khởi tạo và theo dõi Async Jobs xử lý nền với Webhook callback' },
    { name: 'Uploads', description: 'Authenticated direct-to-R2 uploads' },
    { name: 'Users', description: 'User account management (Admin only)' },
    { name: 'Wallets', description: 'Authenticated user wallet management' },
    {
      name: 'Categories',
      description: 'Shared system categories and authenticated user category management',
    },
    {
      name: 'Transactions',
      description: 'Authenticated transaction management and receipt uploads',
    },
    {
      name: 'Transfers',
      description: 'Authenticated wallet-to-wallet transfers with atomic balance updates',
    },
    {
      name: 'Budgets',
      description: 'Authenticated budget limits, real-time usage, and threshold alerts',
    },
    {
      name: 'Saving Goals',
      description: 'Authenticated saving goals, progress, and contribution history',
    },
    {
      name: 'Reports',
      description: 'Authenticated financial reports and analytics grouped safely by currency',
    },
    {
      name: 'AI Financial Assistant',
      description: 'Gemini-backed categorization, receipt extraction, financial Q&A, insights, and recommendations',
    },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Public Health check (Minimal)',
        description: 'Kiểm tra trạng thái sẵn sàng của service cho Load Balancer. Không trả về thông tin nhạy cảm.',
        responses: {
          200: {
            description: 'Hệ thống hoạt động bình thường',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time', example: '2026-08-23T10:15:21Z' },
                  },
                },
              },
            },
          },
          503: {
            description: 'Dịch vụ gặp sự cố kết nối cơ sở dữ liệu',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    status: { type: 'string', example: 'error' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health/detail': {
      get: {
        tags: ['System'],
        summary: 'Detailed Health check (Admin only)',
        description: 'Kiểm tra trạng thái chi tiết của Server, Memory usage, Database latency và Cache. Yêu cầu quyền SYSTEM_CONFIG_READ.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Thông tin sức khỏe chi tiết của hệ thống',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptime: { type: 'number', example: 120.45 },
                    memory: {
                      type: 'object',
                      properties: {
                        rss: { type: 'string', example: '85.50 MB' },
                        heapTotal: { type: 'string', example: '45.20 MB' },
                        heapUsed: { type: 'string', example: '22.10 MB' },
                      },
                    },
                    database: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'up' },
                        latencyMs: { type: 'number', example: 5 },
                      },
                    },
                    cache: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'up' },
                        type: { type: 'string', example: 'redis' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          503: {
            description: 'Lỗi cơ sở dữ liệu',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng ký tài khoản mới (chỉ cho phép gmail.com)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterBody' } } } },
        responses: {
          201: {
            description: 'Đăng ký thành công, vui lòng kiểm tra email để kích hoạt tài khoản',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Verification email sent' } } },
                  ],
                },
              },
            },
          },
          400: { description: 'Email đã tồn tại hoặc không phải gmail.com', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/verify-email': {
      get: {
        tags: ['Auth'],
        summary: 'Xác thực kích hoạt email',
        parameters: [{ in: 'query', name: 'token', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Mã xác thực gửi qua email' }],
        responses: {
          200: {
            description: 'Kích hoạt tài khoản thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Email verified successfully' } } },
                  ],
                },
              },
            },
          },
          400: { description: 'Token không hợp lệ hoặc đã hết hạn', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng nhập và nhận token',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginBody' } } } },
        responses: {
          200: {
            description: 'Đăng nhập thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { data: { $ref: '#/components/schemas/LoginResponse' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/resend-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Gửi lại email xác thực kích hoạt tài khoản',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ResendVerificationBody' } } } },
        responses: {
          200: {
            description: 'Gửi lại email xác thực thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Verification email sent successfully' } } },
                  ],
                },
              },
            },
          },
          400: { description: 'Tài khoản đã được xác thực trước đó', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Yêu cầu đặt lại mật khẩu (quên mật khẩu)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ForgotPasswordBody' } } } },
        responses: {
          200: {
            description: 'Đã gửi link khôi phục mật khẩu qua email',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Password reset link sent to your email' } } },
                  ],
                },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Đặt lại mật khẩu mới bằng token khôi phục',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordBody' } } } },
        responses: {
          200: {
            description: 'Đặt lại mật khẩu mới thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Password has been reset successfully' } } },
                  ],
                },
              },
            },
          },
          400: { description: 'Token không hợp lệ hoặc đã hết hạn', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/uploads/presign': {
      post: {
        tags: ['Uploads'],
        summary: 'Create a presigned PUT URL for a direct browser upload',
        description: 'Currently restricted to authenticated avatar uploads (JPEG, PNG, or WebP).',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePresignedUploadBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Presigned PUT URL created',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/PresignedUpload' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
          503: {
            description: 'Cloudflare R2 is not configured',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/profile': {
      put: {
        tags: ['Auth'],
        summary: 'Cập nhật thông tin cá nhân',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileBody' } } } },
        responses: {
          200: {
            description: 'Cập nhật thông tin thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Profile updated successfully' },
                        data: { $ref: '#/components/schemas/User' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/password': {
      put: {
        tags: ['Auth'],
        summary: 'Cập nhật mật khẩu',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdatePasswordBody' } } } },
        responses: {
          200: {
            description: 'Cập nhật mật khẩu thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Password updated successfully' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Lấy thông tin người dùng hiện tại',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Thông tin tài khoản đang đăng nhập',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { data: { $ref: '#/components/schemas/User' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Làm mới token',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshBody' } } } },
        responses: {
          200: {
            description: 'Cặp token mới',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { data: { $ref: '#/components/schemas/TokenPair' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng xuất',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LogoutBody' } } } },
        responses: {
          200: {
            description: 'Đăng xuất thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Logged out successfully' } } },
                  ],
                },
              },
            },
          },
          400: { description: 'Token không tồn tại', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/auth/sessions': {
      get: {
        tags: ['Auth'],
        summary: 'Lấy danh sách các phiên đăng nhập đang hoạt động',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách các phiên đăng nhập đang hoạt động',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Session' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      delete: {
        tags: ['Auth'],
        summary: 'Đăng xuất khỏi tất cả các thiết bị khác',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Đăng xuất tất cả thiết bị khác thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'All other sessions revoked successfully' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/sessions/{id}': {
      delete: {
        tags: ['Auth'],
        summary: 'Hủy/Đăng xuất một phiên đăng nhập cụ thể',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID của phiên đăng nhập (RefreshToken ID) cần xóa',
          },
        ],
        responses: {
          200: {
            description: 'Đăng xuất thiết bị thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'Session revoked successfully' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api-keys': {
      get: {
        tags: ['API Keys'],
        summary: 'Danh sách API Keys của người dùng',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách API Keys',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiKeyListResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Tạo API Key mới (trả về raw key chỉ 1 lần duy nhất)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateApiKeyBody' } } },
        },
        responses: {
          201: {
            description: 'Tạo API Key thành công',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateApiKeyResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/api-keys/{id}': {
      delete: {
        tags: ['API Keys'],
        summary: 'Thu hồi / Xóa API Key',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Thu hồi API Key thành công',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/webhooks': {
      get: {
        tags: ['Webhooks'],
        summary: 'Danh sách Webhook Endpoints của người dùng',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách Webhook Endpoints',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookListResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Webhooks'],
        summary: 'Đăng ký Webhook Endpoint mới (kèm SSRF validation & HMAC secret)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateWebhookBody' } } },
        },
        responses: {
          201: {
            description: 'Đăng ký Webhook Endpoint thành công',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateWebhookResponse' } } },
          },
          400: {
            description: 'URL không hợp lệ hoặc trỏ về Private IP (SSRF blocked)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/webhooks/{id}': {
      put: {
        tags: ['Webhooks'],
        summary: 'Cập nhật cấu hình Webhook Endpoint',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateWebhookBody' } } },
        },
        responses: {
          200: {
            description: 'Cập nhật thành công',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Webhooks'],
        summary: 'Xóa Webhook Endpoint',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Xóa Webhook Endpoint thành công',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/webhooks/{id}/deliveries': {
      get: {
        tags: ['Webhooks'],
        summary: 'Xem lịch sử gửi webhook và trạng thái retry BullMQ',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Lịch sử phát tán Webhook',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookDeliveryListResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/webhooks/{id}/test': {
      post: {
        tags: ['Webhooks'],
        summary: 'Gửi thử nghiệm event ping qua Webhook',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Đã đưa test event vào hàng đợi phân phối',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/webhooks/{id}/deliveries/{deliveryId}/retry': {
      post: {
        tags: ['Webhooks'],
        summary: 'Phát lại (Retry / Re-deliver) thủ công một lượt Webhook Delivery',
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Webhook Endpoint ID' },
          { in: 'path', name: 'deliveryId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Webhook Delivery ID cần phát lại' },
        ],
        responses: {
          200: {
            description: 'Đã đưa webhook delivery vào hàng đợi phát lại ngay lập tức',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/jobs': {
      get: {
        tags: ['Jobs'],
        summary: 'Danh sách Async Jobs của người dùng',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách Async Jobs',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/AsyncJob' } } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Jobs'],
        summary: 'Khởi tạo Async Job xử lý nền (hỗ trợ gọi bằng API Key hoặc JWT)',
        description: 'Khi job hoàn thành (hoặc thất bại), hệ thống sẽ gửi callback tới tất cả Webhook Endpoint đang kích hoạt của tài khoản.',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAsyncJobBody' } } },
        },
        responses: {
          202: {
            description: 'Job đã được chấp nhận và đưa vào hàng đợi xử lý',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AsyncJobResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Truy vấn trạng thái và kết quả Async Job',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Thông tin trạng thái Job',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AsyncJobResponse' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'Danh sách tài khoản',
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'email', schema: { type: 'string' }, description: 'Tìm theo email' },
          { in: 'query', name: 'fullName', schema: { type: 'string' }, description: 'Tìm theo tên' },
          { in: 'query', name: 'roleName', schema: { type: 'string', enum: ['ADMIN', 'MANAGER', 'USER'] }, description: 'Lọc theo role' },
          { in: 'query', name: 'isActive', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Lọc theo trạng thái' },
          { in: 'query', name: 'sortBy', schema: { type: 'string', enum: ['createdAt', 'email', 'fullName'], default: 'createdAt' } },
          { $ref: '#/components/parameters/OrderParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Danh sách user có phân trang',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Tạo tài khoản mới',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUserBody' } } } },
        responses: {
          201: {
            description: 'Tài khoản đã tạo',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { data: { $ref: '#/components/schemas/User' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Chi tiết tài khoản theo ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Thông tin user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { data: { $ref: '#/components/schemas/User' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Users'],
        summary: 'Cập nhật tài khoản',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUserBody' } } } },
        responses: {
          200: {
            description: 'Cập nhật thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { data: { $ref: '#/components/schemas/User' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Xóa mềm tài khoản',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Xóa mềm tài khoản thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    { type: 'object', properties: { message: { type: 'string', example: 'User soft deleted successfully' } } },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/wallets': {
      get: {
        tags: ['Wallets'],
        summary: 'List wallets owned by the current user',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'includeArchived',
            schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
          {
            in: 'query',
            name: 'sortBy',
            schema: {
              type: 'string',
              enum: ['name', 'balance', 'createdAt', 'updatedAt'],
              default: 'createdAt',
            },
          },
          { $ref: '#/components/parameters/OrderParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated wallet list',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Wallet' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Wallets'],
        summary: 'Create a wallet',
        description: 'The first active wallet is automatically set as the default wallet.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateWalletBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Wallet created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WalletResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/wallets/{id}': {
      get: {
        tags: ['Wallets'],
        summary: 'Get a wallet owned by the current user',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WalletIdParam' }],
        responses: {
          200: {
            description: 'Wallet details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WalletResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      put: {
        tags: ['Wallets'],
        summary: 'Update a wallet',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WalletIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateWalletBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Wallet updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WalletResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Wallets'],
        summary: 'Archive a wallet',
        description: 'This operation preserves transaction history. A default wallet cannot be archived.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WalletIdParam' }],
        responses: {
          200: {
            description: 'Wallet archived',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/WalletResponse' },
                    {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Wallet archived successfully' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/wallets/{id}/default': {
      patch: {
        tags: ['Wallets'],
        summary: 'Set a wallet as default',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WalletIdParam' }],
        responses: {
          200: {
            description: 'Default wallet updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WalletResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/wallets/{id}/restore': {
      patch: {
        tags: ['Wallets'],
        summary: 'Restore an archived wallet',
        description: 'The restored wallet becomes default only if no active default wallet exists.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WalletIdParam' }],
        responses: {
          200: {
            description: 'Wallet restored',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WalletResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'List visible categories',
        description: 'Returns shared system categories and categories owned by the current user.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string', minLength: 1, maxLength: 100 },
          },
          {
            in: 'query',
            name: 'type',
            schema: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          },
          {
            in: 'query',
            name: 'source',
            schema: {
              type: 'string',
              enum: ['ALL', 'SYSTEM', 'USER'],
              default: 'ALL',
            },
          },
          {
            in: 'query',
            name: 'parentId',
            description: 'A category UUID, or "root" for categories without a parent.',
            schema: {
              type: 'string',
              example: 'root',
            },
          },
          {
            in: 'query',
            name: 'includeArchived',
            schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
          {
            in: 'query',
            name: 'sortBy',
            schema: {
              type: 'string',
              enum: ['name', 'createdAt', 'updatedAt'],
              default: 'createdAt',
            },
          },
          { $ref: '#/components/parameters/OrderParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated category list',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Category' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Categories'],
        summary: 'Create a user category',
        description: 'The parent must be visible, active, and have the same transaction type.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCategoryBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Category created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/categories/tree': {
      get: {
        tags: ['Categories'],
        summary: 'Get categories as a tree',
        description: 'Search results retain matching nodes and their ancestors.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string', minLength: 1, maxLength: 100 },
          },
          {
            in: 'query',
            name: 'type',
            schema: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          },
          {
            in: 'query',
            name: 'source',
            schema: {
              type: 'string',
              enum: ['ALL', 'SYSTEM', 'USER'],
              default: 'ALL',
            },
          },
          {
            in: 'query',
            name: 'includeArchived',
            schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
        ],
        responses: {
          200: {
            description: 'Category tree',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/CategoryTreeNode' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/categories/{id}': {
      get: {
        tags: ['Categories'],
        summary: 'Get a visible category',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CategoryIdParam' }],
        responses: {
          200: {
            description: 'Category details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      put: {
        tags: ['Categories'],
        summary: 'Update a user category',
        description: 'System and archived categories are read-only. Restore an archived category first.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CategoryIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateCategoryBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Category updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Archive a user category branch',
        description: 'Archives the selected category and all user-owned descendants.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CategoryIdParam' }],
        responses: {
          200: {
            description: 'Category branch archived',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/CategoryResponse' },
                    {
                      type: 'object',
                      properties: {
                        message: {
                          type: 'string',
                          example: 'Category archived successfully',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/categories/{id}/restore': {
      patch: {
        tags: ['Categories'],
        summary: 'Restore an archived user category',
        description: 'Its parent, when present, must already be active.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/CategoryIdParam' }],
        responses: {
          200: {
            description: 'Category restored',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List transactions',
        description: 'Searches descriptions, locations, wallet names, and category names. All filters are combined.',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string', minLength: 1, maxLength: 200 },
          },
          {
            in: 'query',
            name: 'walletId',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            in: 'query',
            name: 'categoryId',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            in: 'query',
            name: 'type',
            schema: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          },
          {
            in: 'query',
            name: 'dateFrom',
            description: 'Inclusive lower date bound.',
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'dateTo',
            description: 'Inclusive upper date bound.',
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'minAmount',
            schema: {
              type: 'string',
              pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            },
          },
          {
            in: 'query',
            name: 'maxAmount',
            schema: {
              type: 'string',
              pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$',
            },
          },
          {
            in: 'query',
            name: 'sortBy',
            schema: {
              type: 'string',
              enum: ['amount', 'date', 'description', 'createdAt', 'updatedAt'],
              default: 'date',
            },
          },
          { $ref: '#/components/parameters/OrderParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated transaction list',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Transaction' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Transactions'],
        summary: 'Create a transaction',
        description: 'The wallet balance is updated atomically. Supports JWT or API Key (TRANSACTION_CREATE permission).',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateTransactionBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Transaction created and wallet balance updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransactionResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/transactions/{id}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get a transaction',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TransactionIdParam' }],
        responses: {
          200: {
            description: 'Transaction details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransactionResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      put: {
        tags: ['Transactions'],
        summary: 'Update a transaction',
        description: 'Any old wallet impact is reversed and the new impact is applied in one serializable database transaction.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TransactionIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateTransactionBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Transaction and affected wallet balances updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransactionResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Transactions'],
        summary: 'Delete a transaction',
        description: 'Reverses the wallet impact and deletes the transaction atomically, then removes its receipt file.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TransactionIdParam' }],
        responses: {
          200: {
            description: 'Transaction deleted and wallet balance restored',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        message: {
                          type: 'string',
                          example: 'Transaction deleted successfully',
                        },
                        data: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/transactions/{id}/receipt': {
      put: {
        tags: ['Transactions'],
        summary: 'Upload or replace a receipt',
        description: 'Accepts one JPEG, PNG, WebP, or PDF file. The default maximum size is 5 MB.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TransactionIdParam' }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['receipt'],
                properties: {
                  receipt: {
                    type: 'string',
                    format: 'binary',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Receipt uploaded',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransactionResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          413: {
            description: 'Receipt file is too large',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      get: {
        tags: ['Transactions'],
        summary: 'View or download a receipt',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TransactionIdParam' }],
        responses: {
          200: {
            description: 'Receipt binary',
            content: {
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'image/webp': { schema: { type: 'string', format: 'binary' } },
              'application/pdf': { schema: { type: 'string', format: 'binary' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Transactions'],
        summary: 'Delete a receipt',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TransactionIdParam' }],
        responses: {
          200: {
            description: 'Receipt deleted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransactionResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/transfers': {
      get: {
        tags: ['Transfers'],
        summary: 'List wallet transfers',
        description: 'Searches notes and source/destination wallet names. A wallet filter matches either side of the transfer.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string', minLength: 1, maxLength: 200 },
          },
          {
            in: 'query',
            name: 'walletId',
            schema: { type: 'string', format: 'uuid' },
            description: 'Matches either the source or destination wallet.',
          },
          {
            in: 'query',
            name: 'dateFrom',
            description: 'Inclusive lower transferredAt bound.',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            in: 'query',
            name: 'dateTo',
            description: 'Inclusive upper transferredAt bound.',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            in: 'query',
            name: 'sortBy',
            schema: {
              type: 'string',
              enum: ['amount', 'transferredAt', 'createdAt'],
              default: 'transferredAt',
            },
          },
          { $ref: '#/components/parameters/OrderParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated transfer history',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Transfer' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Transfers'],
        summary: 'Transfer money between wallets',
        description: 'Requires two distinct active wallets owned by the user, the same currency, and sufficient source balance. The transfer record and both balance changes commit atomically in a serializable transaction.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateTransferBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Transfer created and both wallet balances updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransferResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/transfers/{id}': {
      delete: {
        tags: ['Transfers'],
        summary: 'Delete and reverse a transfer',
        description: 'Deletes an owned transfer and reverses both wallet balance changes atomically. Archived wallets may still receive the reversal to preserve accounting history.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TransferIdParam' }],
        responses: {
          200: {
            description: 'Transfer deleted and both wallet balance changes reversed',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/TransferResponse' },
                    {
                      type: 'object',
                      properties: {
                        message: {
                          type: 'string',
                          example: 'Transfer deleted successfully',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/budgets': {
      get: {
        tags: ['Budgets'],
        summary: 'List budgets with real-time usage',
        description: 'Every item aggregates matching EXPENSE transactions with the same currency from startDate through endDate, inclusive.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string', minLength: 1, maxLength: 200 },
          },
          {
            in: 'query',
            name: 'type',
            schema: { type: 'string', enum: ['OVERALL', 'CATEGORY'] },
          },
          {
            in: 'query',
            name: 'period',
            schema: {
              type: 'string',
              enum: ['CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY'],
            },
          },
          {
            in: 'query',
            name: 'currency',
            schema: { type: 'string', pattern: '^[A-Za-z]{3}$' },
          },
          {
            in: 'query',
            name: 'categoryId',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            in: 'query',
            name: 'activeAt',
            description: 'Returns budgets whose inclusive business-date interval contains this date.',
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'includeArchived',
            schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
          {
            in: 'query',
            name: 'sortBy',
            schema: {
              type: 'string',
              enum: [
                'name',
                'amount',
                'startDate',
                'endDate',
                'createdAt',
                'updatedAt',
              ],
              default: 'startDate',
            },
          },
          { $ref: '#/components/parameters/OrderParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated budgets with current usage and alert status',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Budget' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Budgets'],
        summary: 'Create a budget',
        description: 'WEEKLY, MONTHLY, and YEARLY calculate endDate from startDate. CATEGORY budgets only accept an active visible EXPENSE category.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateBudgetBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Budget created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BudgetResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/budgets/{id}': {
      get: {
        tags: ['Budgets'],
        summary: 'Get a budget with real-time usage',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/BudgetIdParam' }],
        responses: {
          200: {
            description: 'Budget details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BudgetResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      put: {
        tags: ['Budgets'],
        summary: 'Update a budget',
        description: 'Archived budgets are read-only until restored. Changing a recurring period recalculates endDate.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/BudgetIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateBudgetBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Budget updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BudgetResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Budgets'],
        summary: 'Archive a budget',
        description: 'Preserves the budget and its historical usage.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/BudgetIdParam' }],
        responses: {
          200: {
            description: 'Budget archived',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/BudgetResponse' },
                    {
                      type: 'object',
                      properties: {
                        message: {
                          type: 'string',
                          example: 'Budget archived successfully',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/budgets/{id}/restore': {
      patch: {
        tags: ['Budgets'],
        summary: 'Restore an archived budget',
        description: 'For CATEGORY budgets, the referenced category must still be active.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/BudgetIdParam' }],
        responses: {
          200: {
            description: 'Budget restored',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BudgetResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/reports/overview': {
      get: {
        tags: ['Reports'],
        summary: 'Get a consolidated financial overview',
        description: 'Combines income, expenses, net cash flow, current wallet balances, overlapping budget performance, and non-archived saving goal progress. Preset periods use Asia/Ho_Chi_Minh calendar boundaries.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/ReportPeriodParam' },
          { $ref: '#/components/parameters/ReportDateFromParam' },
          { $ref: '#/components/parameters/ReportDateToParam' },
          { $ref: '#/components/parameters/ReportWalletParam' },
          { $ref: '#/components/parameters/ReportCurrencyParam' },
        ],
        responses: {
          200: {
            description: 'Consolidated financial overview',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/FinancialOverviewReport' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/reports/cash-flow': {
      get: {
        tags: ['Reports'],
        summary: 'Get income, expense, and net cash-flow time series',
        description: 'AUTO uses hourly buckets for a day, daily buckets for a week or month, monthly buckets for a year, and a range-appropriate resolution for CUSTOM. Explicit resolutions are limited to 400 points.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/ReportPeriodParam' },
          { $ref: '#/components/parameters/ReportDateFromParam' },
          { $ref: '#/components/parameters/ReportDateToParam' },
          { $ref: '#/components/parameters/ReportWalletParam' },
          { $ref: '#/components/parameters/ReportCurrencyParam' },
          {
            in: 'query',
            name: 'granularity',
            schema: {
              type: 'string',
              enum: ['AUTO', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'],
              default: 'AUTO',
            },
          },
        ],
        responses: {
          200: {
            description: 'Cash-flow totals and zero-filled time series',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/CashFlowReport' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/reports/spending-by-category': {
      get: {
        tags: ['Reports'],
        summary: 'Get expense distribution by category',
        description: 'Returns direct transaction categories ordered by expense amount, with percentages calculated independently for each currency.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/ReportPeriodParam' },
          { $ref: '#/components/parameters/ReportDateFromParam' },
          { $ref: '#/components/parameters/ReportDateToParam' },
          { $ref: '#/components/parameters/ReportWalletParam' },
          { $ref: '#/components/parameters/ReportCurrencyParam' },
        ],
        responses: {
          200: {
            description: 'Spending distribution grouped by currency and category',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/SpendingByCategoryReport' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/reports/budget-performance': {
      get: {
        tags: ['Reports'],
        summary: 'Get budget utilization and status',
        description: 'Includes budgets overlapping the report window. Spending is calculated only for the overlap [reportFrom, reportTo) and can be narrowed by wallet or currency; budget amounts remain their configured full-period values.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/ReportPeriodParam' },
          { $ref: '#/components/parameters/ReportDateFromParam' },
          { $ref: '#/components/parameters/ReportDateToParam' },
          { $ref: '#/components/parameters/ReportWalletParam' },
          { $ref: '#/components/parameters/ReportCurrencyParam' },
        ],
        responses: {
          200: {
            description: 'Budget summaries and per-budget performance',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/BudgetPerformanceReport' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/ai-assistant/categorize': {
      post: {
        tags: ['AI Financial Assistant'],
        summary: 'Suggest a transaction category',
        description: 'Chooses only from active system categories and categories owned by the authenticated user. The suggestion does not create or update a transaction.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AICategorizeBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Validated category suggestion',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AICategorizeResult' },
                        meta: { $ref: '#/components/schemas/AIResponseMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
          429: { $ref: '#/components/responses/AIRateLimit' },
          502: { $ref: '#/components/responses/AIInvalidResponse' },
          503: { $ref: '#/components/responses/AIUnavailable' },
        },
      },
    },
    '/ai-assistant/receipts/extract': {
      post: {
        tags: ['AI Financial Assistant'],
        summary: 'Extract structured data from a receipt',
        description: 'Accepts one JPEG, PNG, WebP, or PDF in the receipt field. The file is processed in memory, sent to the configured AI provider, and is not persisted by this endpoint.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['receipt'],
                properties: {
                  receipt: { type: 'string', format: 'binary' },
                  languageHint: { type: 'string', minLength: 2, maxLength: 20 },
                  currencyHint: { type: 'string', pattern: '^[A-Za-z]{3}$' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Validated receipt extraction; values should still be checked by the user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AIReceiptResult' },
                        meta: { $ref: '#/components/schemas/AIResponseMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          413: { $ref: '#/components/responses/Validation' },
          422: { $ref: '#/components/responses/Validation' },
          429: { $ref: '#/components/responses/AIRateLimit' },
          502: { $ref: '#/components/responses/AIInvalidResponse' },
          503: { $ref: '#/components/responses/AIUnavailable' },
        },
      },
    },
    '/ai-assistant/chat': {
      post: {
        tags: ['AI Financial Assistant'],
        summary: 'Ask a natural-language question about personal finances',
        description: 'Stateless Q&A over owned financial data. Defaults to the latest 90 days. Personal profile fields, receipt URLs, and locations are excluded from AI context.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AIChatBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Financial answer and supporting highlights',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AIChatResult' },
                        meta: { $ref: '#/components/schemas/AIResponseMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
          429: { $ref: '#/components/responses/AIRateLimit' },
          502: { $ref: '#/components/responses/AIInvalidResponse' },
          503: { $ref: '#/components/responses/AIUnavailable' },
        },
      },
    },
    '/ai-assistant/insights/analyze': {
      post: {
        tags: ['AI Financial Assistant'],
        summary: 'Analyze trends and unusual financial activity',
        description: 'Uses exact database aggregates plus a bounded recent-transaction sample. The response metadata reports when that sample was truncated.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AIInsightsBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Trends, evidence-backed anomalies, and recommendations',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AIInsightsResult' },
                        meta: { $ref: '#/components/schemas/AIResponseMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
          429: { $ref: '#/components/responses/AIRateLimit' },
          502: { $ref: '#/components/responses/AIInvalidResponse' },
          503: { $ref: '#/components/responses/AIUnavailable' },
        },
      },
    },
    '/ai-assistant/recommendations': {
      post: {
        tags: ['AI Financial Assistant'],
        summary: 'Recommend budget and saving adjustments',
        description: 'Returns advisory suggestions only and never changes budgets, saving goals, contributions, or wallet balances.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AIRecommendationsBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Budget, saving, and prioritized action suggestions',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AIRecommendationsResult' },
                        meta: { $ref: '#/components/schemas/AIResponseMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
          429: { $ref: '#/components/responses/AIRateLimit' },
          502: { $ref: '#/components/responses/AIInvalidResponse' },
          503: { $ref: '#/components/responses/AIUnavailable' },
        },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List in-app notifications',
        description: 'Returns non-expired notifications selected for the IN_APP channel. Results are newest first.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'type',
            schema: {
              type: 'string',
              enum: [
                'BUDGET_NEAR_LIMIT',
                'BUDGET_EXCEEDED',
                'SAVING_GOAL_NEAR_TARGET',
                'SAVING_GOAL_ACHIEVED',
                'SAVING_GOAL_DUE_SOON',
                'RECURRING_PAYMENT_DUE',
                'UNUSUAL_TRANSACTION',
                'USER_REMINDER',
                'SYSTEM',
              ],
            },
          },
          {
            in: 'query',
            name: 'priority',
            schema: {
              type: 'string',
              enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
            },
          },
          {
            in: 'query',
            name: 'isRead',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated notification inbox',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Notification' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Get unread notification count',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Unread in-app notification count',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: { count: { type: 'integer' } },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all in-app notifications as read',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Number of notifications updated',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: { count: { type: 'integer' } },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/notifications/settings': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notification preferences',
        description: 'Returns IN_APP-only defaults until the user saves preferences.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Notification preferences',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/NotificationSetting' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      put: {
        tags: ['Notifications'],
        summary: 'Update notification preferences',
        description: 'EMAIL is delivered when SMTP and a user email are available. ZALO and PUSH are queued but marked skipped until their provider adapters are configured.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateNotificationSettingBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated notification preferences',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/NotificationSetting' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark a notification as read',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/NotificationIdParam' }],
        responses: {
          200: {
            description: 'Updated notification',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/NotificationResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/notifications/{id}': {
      delete: {
        tags: ['Notifications'],
        summary: 'Delete an owned in-app notification',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/NotificationIdParam' }],
        responses: {
          200: { description: 'Notification deleted' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/recurring-transactions': {
      get: {
        tags: ['Recurring Transactions'],
        summary: 'List owned recurring transaction schedules',
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'isActive', schema: { type: 'string', enum: ['true', 'false'] } },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: { description: 'Paginated recurring schedules' },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Recurring Transactions'],
        summary: 'Create an opt-in recurring transaction schedule',
        description: 'Creates entries in the FinWise ledger only; it never initiates an external payment.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateRecurringTransactionBody' } } },
        },
        responses: {
          201: { description: 'Schedule created', content: { 'application/json': { schema: { $ref: '#/components/schemas/RecurringTransactionResponse' } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/recurring-transactions/{id}': {
      get: {
        tags: ['Recurring Transactions'], summary: 'Get an owned recurring schedule', security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/RecurringTransactionIdParam' }],
        responses: { 200: { description: 'Schedule details' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
      patch: {
        tags: ['Recurring Transactions'], summary: 'Update future occurrences of a schedule', security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/RecurringTransactionIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                description: 'Partial schedule/template update; existing posted transactions are unchanged.',
              },
            },
          },
        },
        responses: { 200: { description: 'Schedule updated' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' }, 422: { $ref: '#/components/responses/Validation' } },
      },
      delete: {
        tags: ['Recurring Transactions'], summary: 'Soft-delete a schedule without deleting posted transactions', security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/RecurringTransactionIdParam' }],
        responses: { 200: { description: 'Schedule removed' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/recurring-transactions/{id}/pause': {
      post: {
        tags: ['Recurring Transactions'], summary: 'Pause future posting', security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/RecurringTransactionIdParam' }],
        responses: { 200: { description: 'Schedule paused' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/recurring-transactions/{id}/resume': {
      post: {
        tags: ['Recurring Transactions'], summary: 'Resume with the configured missed-run policy', security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/RecurringTransactionIdParam' }],
        responses: { 200: { description: 'Schedule resumed' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' }, 422: { $ref: '#/components/responses/Validation' } },
      },
    },
    '/recurring-transactions/{id}/preview': {
      get: {
        tags: ['Recurring Transactions'], summary: 'Preview deterministic future dates', security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/RecurringTransactionIdParam' }, { in: 'query', name: 'count', schema: { type: 'integer', minimum: 1, maximum: 24, default: 6 } }],
        responses: { 200: { description: 'Future occurrence dates' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/recurring-transactions/{id}/history': {
      get: {
        tags: ['Recurring Transactions'], summary: 'List posted and failed occurrences', security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/RecurringTransactionIdParam' }, { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' }],
        responses: { 200: { description: 'Paginated execution history' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/subscriptions/convert-to-recurring-transaction': {
      post: {
        tags: ['Recurring Transactions'], summary: 'Convert a discovered subscription into an opt-in expense schedule', security: [{ BearerAuth: [] }],
        responses: { 201: { description: 'Recurring schedule created or reused' }, 401: { $ref: '#/components/responses/Unauthorized' }, 422: { $ref: '#/components/responses/Validation' } },
      },
    },
    '/reminders': {
      get: {
        tags: ['Reminders'],
        summary: 'List user reminders',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'type',
            schema: { type: 'string', enum: ['GENERAL', 'RECURRING_PAYMENT'] },
          },
          {
            in: 'query',
            name: 'isActive',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
          { in: 'query', name: 'dueFrom', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'dueTo', schema: { type: 'string', format: 'date-time' } },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated reminders',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Reminder' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Reminders'],
        summary: 'Create a reminder',
        description: 'Recurring schedules preserve the UTC wall-clock fields supplied by the client. Past recurring start dates advance to the next future occurrence.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateReminderBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Reminder created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReminderResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/reminders/{id}': {
      get: {
        tags: ['Reminders'],
        summary: 'Get an owned reminder',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ReminderIdParam' }],
        responses: {
          200: {
            description: 'Reminder details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReminderResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      put: {
        tags: ['Reminders'],
        summary: 'Update or enable/disable a reminder',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ReminderIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateReminderBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Reminder updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReminderResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Reminders'],
        summary: 'Delete an owned reminder',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ReminderIdParam' }],
        responses: {
          200: { description: 'Reminder deleted' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/saving-goals': {
      get: {
        tags: ['Saving Goals'],
        summary: 'List saving goals with contribution progress',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string', minLength: 1, maxLength: 200 },
          },
          {
            in: 'query',
            name: 'status',
            schema: {
              type: 'string',
              enum: ['ACTIVE', 'PAUSED', 'COMPLETED'],
            },
          },
          {
            in: 'query',
            name: 'dueFrom',
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'dueTo',
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'includeArchived',
            schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
          {
            in: 'query',
            name: 'sortBy',
            schema: {
              type: 'string',
              enum: [
                'name',
                'targetAmount',
                'targetDate',
                'createdAt',
                'updatedAt',
              ],
              default: 'targetDate',
            },
          },
          {
            in: 'query',
            name: 'order',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
          },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated saving goals with aggregated progress',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/SavingGoal' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Saving Goals'],
        summary: 'Create a saving goal',
        description: 'Creates an ACTIVE goal. Contributions are tracked separately and do not change wallet balances.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateSavingGoalBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Saving goal created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SavingGoalResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/saving-goals/{id}': {
      get: {
        tags: ['Saving Goals'],
        summary: 'Get a saving goal with progress',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/SavingGoalIdParam' }],
        responses: {
          200: {
            description: 'Saving goal details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SavingGoalResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      put: {
        tags: ['Saving Goals'],
        summary: 'Update a saving goal',
        description: 'Archived goals are read-only. COMPLETED is derived from total contributions; clients may only pause or resume a goal. Currency is locked after the first contribution.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/SavingGoalIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateSavingGoalBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Saving goal updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SavingGoalResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Saving Goals'],
        summary: 'Archive a saving goal',
        description: 'Keeps the goal and all contribution history for reporting.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/SavingGoalIdParam' }],
        responses: {
          200: {
            description: 'Saving goal archived',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SavingGoalResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/saving-goals/{id}/restore': {
      patch: {
        tags: ['Saving Goals'],
        summary: 'Restore an archived saving goal',
        description: 'Recalculates completion status from the preserved contributions.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/SavingGoalIdParam' }],
        responses: {
          200: {
            description: 'Saving goal restored',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SavingGoalResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/saving-goals/{id}/contributions': {
      get: {
        tags: ['Saving Goals'],
        summary: 'List contributions for a saving goal',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/SavingGoalIdParam' },
          {
            in: 'query',
            name: 'dateFrom',
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'dateTo',
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'sortBy',
            schema: {
              type: 'string',
              enum: ['amount', 'contributedAt', 'createdAt', 'updatedAt'],
              default: 'contributedAt',
            },
          },
          { $ref: '#/components/parameters/OrderParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated contribution history',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: {
                            $ref: '#/components/schemas/SavingContribution',
                          },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      post: {
        tags: ['Saving Goals'],
        summary: 'Add a contribution',
        description: 'Allowed only for an active, non-archived, incomplete goal. Progress and completion status update atomically.',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/SavingGoalIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateSavingContributionBody',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Contribution created with refreshed goal progress',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/SavingContributionMutation',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/saving-goals/{id}/contributions/{contributionId}': {
      put: {
        tags: ['Saving Goals'],
        summary: 'Update a saving contribution',
        description: 'Recalculates goal progress and completion status atomically.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/SavingGoalIdParam' },
          { $ref: '#/components/parameters/SavingContributionIdParam' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateSavingContributionBody',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Contribution and goal progress updated',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/SavingContributionMutation',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
      delete: {
        tags: ['Saving Goals'],
        summary: 'Delete a saving contribution',
        description: 'Deletes a correction entry and recalculates goal progress atomically.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/SavingGoalIdParam' },
          { $ref: '#/components/parameters/SavingContributionIdParam' },
        ],
        responses: {
          200: {
            description: 'Contribution deleted and goal progress refreshed',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            goal: {
                              $ref: '#/components/schemas/SavingGoal',
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/Validation' },
        },
      },
    },
    '/system/public-config': {
      get: {
        tags: ['System'],
        summary: 'Lấy cấu hình công khai và trạng thái bảo trì hệ thống',
        description: 'Endpoint công khai không yêu cầu token xác thực, dùng để kiểm tra app maintenance mode và feature flags.',
        responses: {
          200: {
            description: 'Thông tin cấu hình công khai',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/PublicSystemConfig' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/admin/settings': {
      get: {
        tags: ['Admin - System Settings'],
        summary: 'Lấy danh sách tham số cấu hình hệ thống',
        description: 'Yêu cầu quyền SYSTEM_CONFIG_READ.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'category',
            in: 'query',
            schema: { type: 'string', enum: ['GENERAL', 'SECURITY', 'NOTIFICATION', 'AI', 'SYSTEM'] },
            description: 'Lọc theo danh mục cài đặt',
          },
        ],
        responses: {
          200: {
            description: 'Danh sách tham số cấu hình',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/SystemSetting' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden - Không có quyền SYSTEM_CONFIG_READ' },
        },
      },
    },
    '/admin/settings/{key}': {
      get: {
        tags: ['Admin - System Settings'],
        summary: 'Lấy chi tiết một tham số cấu hình theo key',
        description: 'Yêu cầu quyền SYSTEM_CONFIG_READ.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'key',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'system.maintenance.enabled',
          },
        ],
        responses: {
          200: {
            description: 'Chi tiết tham số cấu hình',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/SystemSetting' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Admin - System Settings'],
        summary: 'Cập nhật giá trị tham số cấu hình',
        description: 'Yêu cầu quyền SYSTEM_CONFIG_UPDATE. Tự động ghi nhật ký kiểm toán.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'key',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'notifications.email_enabled',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateSystemSettingBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Cập nhật cấu hình thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/SystemSetting' },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { description: 'Tham số bất biến hoặc giá trị không đúng kiểu' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden - Không có quyền SYSTEM_CONFIG_UPDATE' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/admin/settings/maintenance': {
      put: {
        tags: ['Admin - System Settings'],
        summary: 'Kích hoạt / hủy bỏ chế độ bảo trì hệ thống',
        description: 'Yêu cầu quyền MAINTENANCE_MODE_UPDATE. Tự động ghi nhận nhật ký kiểm toán.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MaintenanceModeBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Cập nhật chế độ bảo trì thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            enabled: { type: 'boolean' },
                            message: { type: 'string' },
                            startAt: { type: 'string', format: 'date-time', nullable: true },
                            endAt: { type: 'string', format: 'date-time', nullable: true },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden - Không có quyền MAINTENANCE_MODE_UPDATE' },
        },
      },
    },
    '/admin/notifications/overview': {
      get: {
        tags: ['Admin - Notifications'],
        summary: 'Lấy số liệu thống kê tổng quan phân phối thông báo',
        description: 'Yêu cầu quyền NOTIFICATION_ADMIN_READ.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Tổng quan gửi tin',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/NotificationOverview' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/notifications/deliveries': {
      get: {
        tags: ['Admin - Notifications'],
        summary: 'Lấy nhật ký lịch sử gửi thông báo đa kênh',
        description: 'Yêu cầu quyền NOTIFICATION_ADMIN_READ. Hỗ trợ phân trang và bộ lọc.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'channel', in: 'query', schema: { type: 'string', enum: ['IN_APP', 'EMAIL', 'PUSH', 'ZALO'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: 'Danh sách nhật ký phân phối',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/AdminNotificationDelivery' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/notifications/deliveries/{id}/retry': {
      post: {
        tags: ['Admin - Notifications'],
        summary: 'Thử lại phân phối thông báo thất bại',
        description: 'Yêu cầu quyền NOTIFICATION_RETRY.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Đã kích hoạt thử lại gửi thông báo thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AdminNotificationDelivery' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/admin/notifications/templates': {
      get: {
        tags: ['Admin - Notifications'],
        summary: 'Lấy danh sách các mẫu thông báo song ngữ',
        description: 'Yêu cầu quyền NOTIFICATION_TEMPLATE_READ.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách mẫu thông báo',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/NotificationTemplate' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/notifications/templates/{id}': {
      put: {
        tags: ['Admin - Notifications'],
        summary: 'Cập nhật mẫu thông báo',
        description: 'Yêu cầu quyền NOTIFICATION_TEMPLATE_UPDATE.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateNotificationTemplateBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Cập nhật mẫu thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/NotificationTemplate' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/admin/notifications/channels': {
      get: {
        tags: ['Admin - Notifications'],
        summary: 'Lấy cấu hình trạng thái các kênh gửi tin',
        description: 'Yêu cầu quyền NOTIFICATION_CONFIG_READ.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Cấu hình kênh',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/NotificationChannelConfig' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
      put: {
        tags: ['Admin - Notifications'],
        summary: 'Cập nhật bật/tắt các kênh gửi tin',
        description: 'Yêu cầu quyền NOTIFICATION_CONFIG_UPDATE.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotificationChannelConfig' },
            },
          },
        },
        responses: {
          200: {
            description: 'Đã cập nhật cấu hình kênh',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/NotificationChannelConfig' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/ai/status': {
      get: {
        tags: ['Admin - AI'],
        summary: 'Lấy trạng thái các tính năng AI và models',
        description: 'Yêu cầu quyền AI_ADMIN_READ.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Trạng thái tính năng AI',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/AiFeatureStatus' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/ai/features/{key}/toggle': {
      put: {
        tags: ['Admin - AI'],
        summary: 'Bật hoặc tắt một tính năng AI',
        description: 'Yêu cầu quyền AI_CONFIG_UPDATE.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'key', in: 'path', required: true, schema: { type: 'string' }, example: 'ai.assistant.enabled' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['enabled'],
                properties: { enabled: { type: 'boolean' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Đã cập nhật trạng thái tính năng AI',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AiFeatureStatus' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/admin/ai/usage': {
      get: {
        tags: ['Admin - AI'],
        summary: 'Lấy số liệu tiêu thụ Token và hiệu suất AI',
        description: 'Yêu cầu quyền AI_USAGE_READ.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['today', 'week', 'month'], default: 'today' } },
        ],
        responses: {
          200: {
            description: 'Số liệu sử dụng AI',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AiUsageSummary' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/ai/logs': {
      get: {
        tags: ['Admin - AI'],
        summary: 'Lấy nhật ký các yêu cầu gọi AI LLM',
        description: 'Yêu cầu quyền AI_LOG_READ.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'feature', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['SUCCESS', 'FAILED', 'RATE_LIMITED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: 'Nhật ký truy vấn AI',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/AiRequestLog' },
                        },
                        meta: { $ref: '#/components/schemas/PaginationMeta' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/ai/rate-limit': {
      get: {
        tags: ['Admin - AI'],
        summary: 'Lấy cấu hình Sliding Window Rate Limit cho AI',
        description: 'Yêu cầu quyền AI_CONFIG_READ.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Cấu hình Rate Limit',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AiRateLimitConfig' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
      put: {
        tags: ['Admin - AI'],
        summary: 'Cập nhật cấu hình Sliding Window Rate Limit cho AI',
        description: 'Yêu cầu quyền AI_CONFIG_UPDATE.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AiRateLimitConfig' },
            },
          },
        },
        responses: {
          200: {
            description: 'Đã lưu cấu hình Rate Limit',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/AiRateLimitConfig' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
  },
};

