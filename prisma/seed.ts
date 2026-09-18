import {
  PrismaClient,
  TransactionType,
  BudgetType,
  BudgetPeriod,
  SavingGoalStatus,
  NotificationType,
  NotificationPriority,
  NotificationChannel,
  NotificationSourceType,
  ReminderType,
  ReminderFrequency,
  SettingType,
  SettingCategory,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { uuidv7 } from 'uuidv7';


const prisma = new PrismaClient();
const businessDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  // 1. Seed Roles
  const roles = [
    { name: 'SUPER_ADMIN', description: 'Siêu quản trị viên hệ thống — toàn quyền', isSystem: true },
    { name: 'ADMIN', description: 'Quản trị viên toàn quyền hệ thống', isSystem: true },
    { name: 'MANAGER', description: 'Quản lý vận hành và giám sát', isSystem: true },
    { name: 'USER', description: 'Người dùng tiêu chuẩn', isSystem: true },
  ];
  const roleMap: Record<string, string> = {};

  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description, isSystem: r.isSystem },
      create: { id: uuidv7(), name: r.name, description: r.description, isSystem: r.isSystem },
    });
    roleMap[r.name] = role.id;
    console.log(`Role ${r.name} upserted with ID ${role.id}`);
  }

  // 2. Seed Permissions
  const permissionsData: Array<{
    name: string;
    resource: string;
    action: string;
    description: string;
    isSystem: boolean;
  }> = [
    // USER
    { name: 'USER_READ', resource: 'USER', action: 'READ', description: 'Xem danh sách và chi tiết người dùng', isSystem: true },
    { name: 'USER_CREATE', resource: 'USER', action: 'CREATE', description: 'Tạo tài khoản người dùng mới', isSystem: true },
    { name: 'USER_UPDATE', resource: 'USER', action: 'UPDATE', description: 'Cập nhật thông tin và vai trò người dùng', isSystem: true },
    { name: 'USER_DELETE', resource: 'USER', action: 'DELETE', description: 'Xóa mềm tài khoản người dùng', isSystem: true },
    // ROLE
    { name: 'ROLE_READ', resource: 'ROLE', action: 'READ', description: 'Xem danh sách và chi tiết vai trò', isSystem: true },
    { name: 'ROLE_CREATE', resource: 'ROLE', action: 'CREATE', description: 'Tạo vai trò mới trong hệ thống', isSystem: true },
    { name: 'ROLE_UPDATE', resource: 'ROLE', action: 'UPDATE', description: 'Cập nhật thông tin vai trò', isSystem: true },
    { name: 'ROLE_DELETE', resource: 'ROLE', action: 'DELETE', description: 'Xóa vai trò tùy chỉnh', isSystem: true },
    // PERMISSION
    { name: 'PERMISSION_READ', resource: 'PERMISSION', action: 'READ', description: 'Xem danh sách quyền hạn hệ thống', isSystem: true },
    { name: 'ROLE_PERMISSION_ASSIGN', resource: 'PERMISSION', action: 'ASSIGN', description: 'Gán hoặc thu hồi quyền hạn của vai trò', isSystem: true },
    // AUDIT_LOG
    { name: 'AUDIT_LOG_READ', resource: 'AUDIT_LOG', action: 'READ', description: 'Xem nhật ký kiểm toán hệ thống', isSystem: true },
    // WALLET
    { name: 'WALLET_READ', resource: 'WALLET', action: 'READ', description: 'Xem danh sách và chi tiết ví', isSystem: true },
    { name: 'WALLET_CREATE', resource: 'WALLET', action: 'CREATE', description: 'Tạo ví mới', isSystem: true },
    { name: 'WALLET_UPDATE', resource: 'WALLET', action: 'UPDATE', description: 'Cập nhật thông tin và số dư ví', isSystem: true },
    { name: 'WALLET_DELETE', resource: 'WALLET', action: 'DELETE', description: 'Lưu trữ hoặc xóa ví', isSystem: true },
    // TRANSACTION
    { name: 'TRANSACTION_READ', resource: 'TRANSACTION', action: 'READ', description: 'Xem danh sách và chi tiết giao dịch', isSystem: true },
    { name: 'TRANSACTION_CREATE', resource: 'TRANSACTION', action: 'CREATE', description: 'Ghi nhận giao dịch thu chi mới', isSystem: true },
    { name: 'TRANSACTION_UPDATE', resource: 'TRANSACTION', action: 'UPDATE', description: 'Chỉnh sửa giao dịch thu chi', isSystem: true },
    { name: 'TRANSACTION_DELETE', resource: 'TRANSACTION', action: 'DELETE', description: 'Xóa giao dịch thu chi', isSystem: true },
    // TRANSFER
    { name: 'TRANSFER_READ', resource: 'TRANSFER', action: 'READ', description: 'Xem lịch sử chuyển tiền giữa các ví', isSystem: true },
    { name: 'TRANSFER_CREATE', resource: 'TRANSFER', action: 'CREATE', description: 'Thực hiện chuyển tiền giữa các ví', isSystem: true },
    { name: 'TRANSFER_DELETE', resource: 'TRANSFER', action: 'DELETE', description: 'Hoàn tác giao dịch chuyển tiền', isSystem: true },
    // CATEGORY
    { name: 'CATEGORY_READ', resource: 'CATEGORY', action: 'READ', description: 'Xem danh mục thu chi', isSystem: true },
    { name: 'CATEGORY_CREATE', resource: 'CATEGORY', action: 'CREATE', description: 'Tạo danh mục thu chi tùy chỉnh', isSystem: true },
    { name: 'CATEGORY_UPDATE', resource: 'CATEGORY', action: 'UPDATE', description: 'Cập nhật danh mục thu chi', isSystem: true },
    { name: 'CATEGORY_DELETE', resource: 'CATEGORY', action: 'DELETE', description: 'Lưu trữ danh mục thu chi', isSystem: true },
    // BUDGET
    { name: 'BUDGET_READ', resource: 'BUDGET', action: 'READ', description: 'Xem ngân sách chi tiêu', isSystem: true },
    { name: 'BUDGET_CREATE', resource: 'BUDGET', action: 'CREATE', description: 'Thiết lập ngân sách mới', isSystem: true },
    { name: 'BUDGET_UPDATE', resource: 'BUDGET', action: 'UPDATE', description: 'Điều chỉnh định mức ngân sách', isSystem: true },
    { name: 'BUDGET_DELETE', resource: 'BUDGET', action: 'DELETE', description: 'Lưu trữ ngân sách', isSystem: true },
    // SAVING_GOAL
    { name: 'SAVING_GOAL_READ', resource: 'SAVING_GOAL', action: 'READ', description: 'Xem mục tiêu tiết kiệm', isSystem: true },
    { name: 'SAVING_GOAL_CREATE', resource: 'SAVING_GOAL', action: 'CREATE', description: 'Tạo mục tiêu tiết kiệm mới', isSystem: true },
    { name: 'SAVING_GOAL_UPDATE', resource: 'SAVING_GOAL', action: 'UPDATE', description: 'Cập nhật mục tiêu và đóng góp tiết kiệm', isSystem: true },
    { name: 'SAVING_GOAL_DELETE', resource: 'SAVING_GOAL', action: 'DELETE', description: 'Lưu trữ mục tiêu tiết kiệm', isSystem: true },
    // REPORT
    { name: 'REPORT_READ', resource: 'REPORT', action: 'READ', description: 'Xem báo cáo và phân tích tài chính', isSystem: true },
    // FORECAST
    { name: 'FORECAST_READ', resource: 'FORECAST', action: 'READ', description: 'Xem dự báo dòng tiền và cạn kiệt ngân sách', isSystem: true },
    // SIMULATION
    { name: 'SIMULATION_READ', resource: 'SIMULATION', action: 'READ', description: 'Xem kịch bản mô phỏng tài chính', isSystem: true },
    { name: 'SIMULATION_EXECUTE', resource: 'SIMULATION', action: 'EXECUTE', description: 'Chạy mô phỏng kịch bản What-if', isSystem: true },
    // ANOMALY
    { name: 'ANOMALY_READ', resource: 'ANOMALY', action: 'READ', description: 'Xem cảnh báo chi tiêu bất thường', isSystem: true },
    { name: 'ANOMALY_EVALUATE', resource: 'ANOMALY', action: 'EVALUATE', description: 'Đánh giá chi tiêu bất thường', isSystem: true },
    // SUBSCRIPTION
    { name: 'SUBSCRIPTION_READ', resource: 'SUBSCRIPTION', action: 'READ', description: 'Xem phát hiện thuê bao định kỳ', isSystem: true },
    { name: 'SUBSCRIPTION_MANAGE', resource: 'SUBSCRIPTION', action: 'MANAGE', description: 'Quản lý và chuyển đổi thuê bao định kỳ', isSystem: true },
    // QUERY
    { name: 'QUERY_EXECUTE', resource: 'QUERY', action: 'EXECUTE', description: 'Truy vấn dữ liệu bằng ngôn ngữ tự nhiên DSL', isSystem: true },
    // RECURRING_TRANSACTION
    { name: 'RECURRING_TRANSACTION_READ', resource: 'RECURRING_TRANSACTION', action: 'READ', description: 'Xem lịch giao dịch tự động định kỳ', isSystem: true },
    { name: 'RECURRING_TRANSACTION_CREATE', resource: 'RECURRING_TRANSACTION', action: 'CREATE', description: 'Tạo lịch giao dịch định kỳ mới', isSystem: true },
    { name: 'RECURRING_TRANSACTION_UPDATE', resource: 'RECURRING_TRANSACTION', action: 'UPDATE', description: 'Cập nhật/Tạm dừng/Tiếp tục lịch giao dịch định kỳ', isSystem: true },
    { name: 'RECURRING_TRANSACTION_DELETE', resource: 'RECURRING_TRANSACTION', action: 'DELETE', description: 'Xóa lịch giao dịch định kỳ', isSystem: true },
    // NOTIFICATION
    { name: 'NOTIFICATION_READ', resource: 'NOTIFICATION', action: 'READ', description: 'Xem thông báo hệ thống', isSystem: true },
    { name: 'NOTIFICATION_UPDATE', resource: 'NOTIFICATION', action: 'UPDATE', description: 'Cập nhật cài đặt và trạng thái thông báo', isSystem: true },
    { name: 'NOTIFICATION_ADMIN_READ', resource: 'NOTIFICATION', action: 'ADMIN_READ', description: 'Quản trị viên xem tổng quan và nhật ký phân phối thông báo', isSystem: true },
    { name: 'NOTIFICATION_RETRY', resource: 'NOTIFICATION', action: 'RETRY', description: 'Thử lại phân phối thông báo bị lỗi', isSystem: true },
    { name: 'NOTIFICATION_TEMPLATE_READ', resource: 'NOTIFICATION', action: 'TEMPLATE_READ', description: 'Xem mẫu thông báo hệ thống', isSystem: true },
    { name: 'NOTIFICATION_TEMPLATE_UPDATE', resource: 'NOTIFICATION', action: 'TEMPLATE_UPDATE', description: 'Cập nhật mẫu thông báo hệ thống', isSystem: true },
    { name: 'NOTIFICATION_CONFIG_UPDATE', resource: 'NOTIFICATION', action: 'CONFIG_UPDATE', description: 'Cấu hình kênh thông báo hệ thống', isSystem: true },
    // REMINDER
    { name: 'REMINDER_READ', resource: 'REMINDER', action: 'READ', description: 'Xem danh sách nhắc nhở tài chính', isSystem: true },
    { name: 'REMINDER_CREATE', resource: 'REMINDER', action: 'CREATE', description: 'Tạo lịch nhắc nhở mới', isSystem: true },
    { name: 'REMINDER_UPDATE', resource: 'REMINDER', action: 'UPDATE', description: 'Cập nhật lịch nhắc nhở', isSystem: true },
    { name: 'REMINDER_DELETE', resource: 'REMINDER', action: 'DELETE', description: 'Xóa lịch nhắc nhở', isSystem: true },
    // AI_ASSISTANT & AI ADMIN
    { name: 'AI_ASSISTANT_USE', resource: 'AI_ASSISTANT', action: 'USE', description: 'Sử dụng trợ lý tài chính AI Gemini', isSystem: true },
    { name: 'AI_ADMIN_READ', resource: 'AI', action: 'ADMIN_READ', description: 'Xem trạng thái và cấu hình các tính năng AI', isSystem: true },
    { name: 'AI_CONFIG_UPDATE', resource: 'AI', action: 'CONFIG_UPDATE', description: 'Bật/tắt tính năng và cấu hình giới hạn AI', isSystem: true },
    { name: 'AI_USAGE_READ', resource: 'AI', action: 'USAGE_READ', description: 'Xem thống kê sử dụng và nhật ký yêu cầu AI', isSystem: true },
    // SYSTEM CONFIGURATION & MAINTENANCE
    { name: 'SYSTEM_CONFIG_READ', resource: 'SYSTEM_CONFIG', action: 'READ', description: 'Xem cài đặt cấu hình động của hệ thống', isSystem: true },
    { name: 'SYSTEM_CONFIG_UPDATE', resource: 'SYSTEM_CONFIG', action: 'UPDATE', description: 'Cập nhật cài đặt cấu hình động của hệ thống', isSystem: true },
    { name: 'MAINTENANCE_MODE_UPDATE', resource: 'SYSTEM_CONFIG', action: 'MAINTENANCE_UPDATE', description: 'Bật/tắt và điều chỉnh chế độ bảo trì hệ thống', isSystem: true },
    // UPLOAD
    { name: 'UPLOAD_FILE', resource: 'UPLOAD', action: 'CREATE', description: 'Tải lên hóa đơn và ảnh đại diện', isSystem: true },
    // USER_RESTORE
    { name: 'USER_RESTORE', resource: 'USER', action: 'RESTORE', description: 'Khôi phục tài khoản người dùng đã bị xóa mềm', isSystem: true },
    // API_KEY
    { name: 'API_KEY_READ', resource: 'API_KEY', action: 'READ', description: 'Xem danh sách API Keys tích hợp', isSystem: true },
    { name: 'API_KEY_CREATE', resource: 'API_KEY', action: 'CREATE', description: 'Tạo API Key mới cho hệ thống bên ngoài', isSystem: true },
    { name: 'API_KEY_DELETE', resource: 'API_KEY', action: 'DELETE', description: 'Thu hồi API Key tích hợp', isSystem: true },
    // WEBHOOK
    { name: 'WEBHOOK_READ', resource: 'WEBHOOK', action: 'READ', description: 'Xem danh sách Webhook Endpoints', isSystem: true },
    { name: 'WEBHOOK_CREATE', resource: 'WEBHOOK', action: 'CREATE', description: 'Đăng ký Webhook Endpoint mới', isSystem: true },
    { name: 'WEBHOOK_UPDATE', resource: 'WEBHOOK', action: 'UPDATE', description: 'Cập nhật cấu hình Webhook Endpoint', isSystem: true },
    { name: 'WEBHOOK_DELETE', resource: 'WEBHOOK', action: 'DELETE', description: 'Xóa Webhook Endpoint', isSystem: true },
    { name: 'WEBHOOK_TEST', resource: 'WEBHOOK', action: 'TEST', description: 'Gửi thử nghiệm Ping Webhook', isSystem: true },
    // ASYNC_JOB
    { name: 'JOB_READ', resource: 'JOB', action: 'READ', description: 'Xem trạng thái và kết quả Async Job', isSystem: true },
    { name: 'JOB_CREATE', resource: 'JOB', action: 'CREATE', description: 'Khởi tạo Async Job xử lý nền', isSystem: true },
  ];

  const permissionMap: Record<string, string> = {};
  for (const p of permissionsData) {
    const perm = await prisma.permission.upsert({
      where: { name: p.name },
      update: {
        resource: p.resource,
        action: p.action,
        description: p.description,
        isSystem: p.isSystem,
      },
      create: { id: uuidv7(), ...p },
    });
    permissionMap[p.name] = perm.id;
  }
  console.log(`Upserted ${Object.keys(permissionMap).length} permissions`);

  // 3. Assign Permissions to Roles
  // SUPER_ADMIN gets ALL permissions
  for (const permId of Object.values(permissionMap)) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: roleMap['SUPER_ADMIN'],
          permissionId: permId,
        },
      },
      update: {},
      create: {
        id: uuidv7(),
        roleId: roleMap['SUPER_ADMIN'],
        permissionId: permId,
      },
    });
  }

  // ADMIN gets ALL permissions
  for (const permId of Object.values(permissionMap)) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: roleMap['ADMIN'],
          permissionId: permId,
        },
      },
      update: {},
      create: {
        id: uuidv7(),
        roleId: roleMap['ADMIN'],
        permissionId: permId,
      },
    });
  }

  // Standard User Permissions
  const userPermissions = [
    'WALLET_READ', 'WALLET_CREATE', 'WALLET_UPDATE', 'WALLET_DELETE',
    'TRANSACTION_READ', 'TRANSACTION_CREATE', 'TRANSACTION_UPDATE', 'TRANSACTION_DELETE',
    'TRANSFER_READ', 'TRANSFER_CREATE', 'TRANSFER_DELETE',
    'CATEGORY_READ', 'CATEGORY_CREATE', 'CATEGORY_UPDATE', 'CATEGORY_DELETE',
    'BUDGET_READ', 'BUDGET_CREATE', 'BUDGET_UPDATE', 'BUDGET_DELETE',
    'SAVING_GOAL_READ', 'SAVING_GOAL_CREATE', 'SAVING_GOAL_UPDATE', 'SAVING_GOAL_DELETE',
    'REPORT_READ', 'FORECAST_READ', 'SIMULATION_READ', 'SIMULATION_EXECUTE',
    'ANOMALY_READ', 'ANOMALY_EVALUATE', 'SUBSCRIPTION_READ', 'SUBSCRIPTION_MANAGE',
    'QUERY_EXECUTE',
    'RECURRING_TRANSACTION_READ', 'RECURRING_TRANSACTION_CREATE', 'RECURRING_TRANSACTION_UPDATE', 'RECURRING_TRANSACTION_DELETE',
    'NOTIFICATION_READ', 'NOTIFICATION_UPDATE',
    'REMINDER_READ', 'REMINDER_CREATE', 'REMINDER_UPDATE', 'REMINDER_DELETE',
    'AI_ASSISTANT_USE', 'UPLOAD_FILE',
    'API_KEY_READ', 'API_KEY_CREATE', 'API_KEY_DELETE',
    'WEBHOOK_READ', 'WEBHOOK_CREATE', 'WEBHOOK_UPDATE', 'WEBHOOK_DELETE', 'WEBHOOK_TEST',
    'JOB_READ', 'JOB_CREATE',
  ];

  for (const permName of userPermissions) {
    const permId = permissionMap[permName];
    if (permId) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roleMap['USER'],
            permissionId: permId,
          },
        },
        update: {},
        create: {
          id: uuidv7(),
          roleId: roleMap['USER'],
          permissionId: permId,
        },
      });
    }
  }

  // MANAGER gets User Permissions + Operational/Audit Read Permissions
  const managerPermissions = [
    ...userPermissions,
    'USER_READ',
    'ROLE_READ',
    'PERMISSION_READ',
    'AUDIT_LOG_READ',
    'NOTIFICATION_ADMIN_READ',
    'NOTIFICATION_TEMPLATE_READ',
    'AI_ADMIN_READ',
    'AI_USAGE_READ',
    'SYSTEM_CONFIG_READ',
  ];


  for (const permName of managerPermissions) {
    const permId = permissionMap[permName];
    if (permId) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roleMap['MANAGER'],
            permissionId: permId,
          },
        },
        update: {},
        create: {
          id: uuidv7(),
          roleId: roleMap['MANAGER'],
          permissionId: permId,
        },
      });
    }
  }

  const superAdminEmail = 'superadmin@finwise.local';
  const superAdminPassword = await bcrypt.hash('SuperAdmin@123456', 10);

  const adminEmail = 'admin@finwise.local';
  const adminPassword = await bcrypt.hash('Admin@123456', 10);

  const managerEmail = 'manager@finwise.local';
  const managerPassword = await bcrypt.hash('Manager@123456', 10);

  const userEmail = 'user@finwise.local';
  const userPassword = await bcrypt.hash('User@123456', 10);

  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      password: superAdminPassword,
      fullName: 'Super Admin',
      roleId: roleMap['SUPER_ADMIN'],
      isActive: true,
    },
    create: {
      id: uuidv7(),
      email: superAdminEmail,
      password: superAdminPassword,
      fullName: 'Super Admin',
      roleId: roleMap['SUPER_ADMIN'],
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: adminPassword,
      fullName: 'Admin',
      roleId: roleMap['ADMIN'],
      isActive: true,
    },
    create: {
      id: uuidv7(),
      email: adminEmail,
      password: adminPassword,
      fullName: 'Admin',
      roleId: roleMap['ADMIN'],
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: managerEmail },
    update: {
      password: managerPassword,
      fullName: 'Manager',
      roleId: roleMap['MANAGER'],
      isActive: true,
    },
    create: {
      id: uuidv7(),
      email: managerEmail,
      password: managerPassword,
      fullName: 'Manager',
      roleId: roleMap['MANAGER'],
      isActive: true,
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: userEmail },
    update: {
      password: userPassword,
      fullName: 'Demo User',
      roleId: roleMap['USER'],
      isActive: true,
    },
    create: {
      id: uuidv7(),
      email: userEmail,
      password: userPassword,
      fullName: 'Demo User',
      roleId: roleMap['USER'],
      isActive: true,
    },
  });

  const systemCategories: Array<{
    id: string;
    parentId?: string;
    name: string;
    type: TransactionType;
    icon: string;
    color: string;
  }> = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Salary',
      type: TransactionType.INCOME,
      icon: 'briefcase',
      color: '#16A34A',
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Investment',
      type: TransactionType.INCOME,
      icon: 'trending-up',
      color: '#0D9488',
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      name: 'Other Income',
      type: TransactionType.INCOME,
      icon: 'circle-plus',
      color: '#22C55E',
    },
    {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Food & Dining',
      type: TransactionType.EXPENSE,
      icon: 'utensils',
      color: '#F97316',
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      parentId: '20000000-0000-4000-8000-000000000001',
      name: 'Groceries',
      type: TransactionType.EXPENSE,
      icon: 'shopping-basket',
      color: '#FB923C',
    },
    {
      id: '20000000-0000-4000-8000-000000000003',
      parentId: '20000000-0000-4000-8000-000000000001',
      name: 'Restaurants',
      type: TransactionType.EXPENSE,
      icon: 'chef-hat',
      color: '#EA580C',
    },
    {
      id: '20000000-0000-4000-8000-000000000004',
      name: 'Transport',
      type: TransactionType.EXPENSE,
      icon: 'car',
      color: '#3B82F6',
    },
    {
      id: '20000000-0000-4000-8000-000000000005',
      name: 'Shopping',
      type: TransactionType.EXPENSE,
      icon: 'shopping-bag',
      color: '#A855F7',
    },
    {
      id: '20000000-0000-4000-8000-000000000006',
      name: 'Bills & Utilities',
      type: TransactionType.EXPENSE,
      icon: 'receipt',
      color: '#EAB308',
    },
    {
      id: '20000000-0000-4000-8000-000000000007',
      name: 'Health',
      type: TransactionType.EXPENSE,
      icon: 'heart-pulse',
      color: '#EF4444',
    },
    {
      id: '20000000-0000-4000-8000-000000000008',
      name: 'Entertainment',
      type: TransactionType.EXPENSE,
      icon: 'gamepad-2',
      color: '#EC4899',
    },
    {
      id: '20000000-0000-4000-8000-000000000009',
      name: 'Education',
      type: TransactionType.EXPENSE,
      icon: 'graduation-cap',
      color: '#6366F1',
    },
    {
      id: '20000000-0000-4000-8000-000000000010',
      name: 'Other Expense',
      type: TransactionType.EXPENSE,
      icon: 'ellipsis',
      color: '#64748B',
    },
  ];

  for (const category of systemCategories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {
        userId: null,
        parentId: category.parentId ?? null,
        name: category.name,
        type: category.type,
        icon: category.icon,
        color: category.color,
        isSystem: true,
        isArchived: false,
      },
      create: {
        id: category.id,
        userId: null,
        parentId: category.parentId,
        name: category.name,
        type: category.type,
        icon: category.icon,
        color: category.color,
        isSystem: true,
      },
    });
  }

  await seedDemoData(demoUser.id);

  console.log('Seed completed successfully');
}

async function seedDemoData(userId: string) {
  console.log('Seeding demo data for user...');

  // 1. Wallets
  const walletCash = await prisma.wallet.upsert({
    where: { userId_name: { userId, name: 'Ví tiền mặt' } },
    update: {},
    create: {
      id: uuidv7(),
      userId,
      name: 'Ví tiền mặt',
      balance: 4500000.00,
      currency: 'VND',
      icon: 'wallet',
      color: '#10B981',
      description: 'Tiền mặt chi tiêu hàng ngày',
      isDefault: false,
    }
  });

  const walletBank = await prisma.wallet.upsert({
    where: { userId_name: { userId, name: 'Tài khoản Techcombank' } },
    update: {},
    create: {
      id: uuidv7(),
      userId,
      name: 'Tài khoản Techcombank',
      balance: 85300000.00,
      currency: 'VND',
      icon: 'credit-card',
      color: '#EF4444',
      description: 'Tài khoản nhận lương và chi tiêu chính',
      isDefault: true,
    }
  });

  const walletSavings = await prisma.wallet.upsert({
    where: { userId_name: { userId, name: 'Sổ tiết kiệm Techcombank' } },
    update: {},
    create: {
      id: uuidv7(),
      userId,
      name: 'Sổ tiết kiệm Techcombank',
      balance: 100000000.00,
      currency: 'VND',
      icon: 'piggy-bank',
      color: '#3B82F6',
      description: 'Tài khoản tích luỹ dài hạn',
      isDefault: false,
    }
  });

  // Xoá giao dịch demo cũ của user này nếu có để seed lại sạch sẽ
  await prisma.transaction.deleteMany({ where: { userId } });

  // 2. Transactions
  const transactionsData = [
    // Tháng 6
    {
      userId,
      walletId: walletBank.id,
      categoryId: '10000000-0000-4000-8000-000000000001', // Salary
      amount: 25000000,
      type: TransactionType.INCOME,
      description: 'Nhận lương tháng 6/2026',
      date: businessDate('2026-06-05'),
    },
    {
      userId,
      walletId: walletCash.id,
      categoryId: '20000000-0000-4000-8000-000000000002', // Groceries
      amount: 450000,
      type: TransactionType.EXPENSE,
      description: 'Mua thực phẩm tuần 1',
      date: businessDate('2026-06-07'),
      location: 'WinMart Quận 1',
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000003', // Restaurants
      amount: 1200000,
      type: TransactionType.EXPENSE,
      description: 'Liên hoan cùng gia đình',
      date: businessDate('2026-06-09'),
      location: 'Hailidao Landmark 81',
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000006', // Bills & Utilities
      amount: 1850000,
      type: TransactionType.EXPENSE,
      description: 'Thanh toán tiền điện nước tháng 5',
      date: businessDate('2026-06-10'),
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000005', // Shopping
      amount: 3200000,
      type: TransactionType.EXPENSE,
      description: 'Mua giày chạy bộ Nike',
      date: businessDate('2026-06-15'),
      location: 'Nike Store Quận 1',
    },
    {
      userId,
      walletId: walletCash.id,
      categoryId: '20000000-0000-4000-8000-000000000008', // Entertainment
      amount: 350000,
      type: TransactionType.EXPENSE,
      description: 'Xem phim và bắp nước',
      date: businessDate('2026-06-21'),
      location: 'CGV Vincom',
    },

    // Tháng 7
    {
      userId,
      walletId: walletBank.id,
      categoryId: '10000000-0000-4000-8000-000000000001', // Salary
      amount: 25000000,
      type: TransactionType.INCOME,
      description: 'Nhận lương tháng 7/2026',
      date: businessDate('2026-07-05'),
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '10000000-0000-4000-8000-000000000002', // Investment
      amount: 1500000,
      type: TransactionType.INCOME,
      description: 'Nhận cổ tức chứng khoán',
      date: businessDate('2026-07-07'),
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000002', // Groceries
      amount: 680000,
      type: TransactionType.EXPENSE,
      description: 'Mua đồ ăn WinMart',
      date: businessDate('2026-07-07'),
      location: 'WinMart Quận 1',
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000006', // Bills & Utilities
      amount: 1920000,
      type: TransactionType.EXPENSE,
      description: 'Thanh toán tiền điện nước tháng 6',
      date: businessDate('2026-07-10'),
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000007', // Health
      amount: 1500000,
      type: TransactionType.EXPENSE,
      description: 'Khám răng định kỳ',
      date: businessDate('2026-07-12'),
      location: 'Nha khoa Kim',
    },
    {
      userId,
      walletId: walletCash.id,
      categoryId: '20000000-0000-4000-8000-000000000003', // Restaurants
      amount: 450000,
      type: TransactionType.EXPENSE,
      description: 'Ăn tối cùng bạn bè',
      date: businessDate('2026-07-16'),
      location: 'Phở Hùng',
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000005', // Shopping
      amount: 5500000,
      type: TransactionType.EXPENSE,
      description: 'Mua bàn phím cơ và chuột không dây',
      date: businessDate('2026-07-18'),
      location: 'Phong Vũ',
    },
    {
      userId,
      walletId: walletCash.id,
      categoryId: '20000000-0000-4000-8000-000000000004', // Transport
      amount: 120000,
      type: TransactionType.EXPENSE,
      description: 'Nạp tiền thẻ xe bus / Grab',
      date: businessDate('2026-07-22'),
    },

    // Tháng 8 (Tháng hiện tại)
    {
      userId,
      walletId: walletBank.id,
      categoryId: '10000000-0000-4000-8000-000000000001', // Salary
      amount: 25000000,
      type: TransactionType.INCOME,
      description: 'Nhận lương tháng 8/2026',
      date: businessDate('2026-08-05'),
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000002', // Groceries
      amount: 720000,
      type: TransactionType.EXPENSE,
      description: 'Mua thực phẩm trữ tủ lạnh WinMart',
      date: businessDate('2026-08-02'),
      location: 'WinMart Landmark 81',
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000003', // Restaurants
      amount: 2850000,
      type: TransactionType.EXPENSE,
      description: 'Tiệc liên hoan sinh nhật đồng nghiệp',
      date: businessDate('2026-08-04'),
      location: 'Nhà hàng San Fu Lou',
    },
    {
      userId,
      walletId: walletCash.id,
      categoryId: '20000000-0000-4000-8000-000000000004', // Transport
      amount: 80000,
      type: TransactionType.EXPENSE,
      description: 'Xăng xe máy',
      date: businessDate('2026-08-04'),
    },
    {
      userId,
      walletId: walletBank.id,
      categoryId: '20000000-0000-4000-8000-000000000008', // Entertainment
      amount: 220000,
      type: TransactionType.EXPENSE,
      description: 'Uống cà phê và bánh ngọt Starbuck',
      date: businessDate('2026-08-05'),
      location: 'Starbucks Quận 1',
    },
  ];

  for (const tx of transactionsData) {
    await prisma.transaction.create({ data: { id: uuidv7(), ...tx } });
  }

  // 3. Budgets
  await prisma.budget.deleteMany({ where: { userId } });

  // Ngân sách tổng tháng này
  const budgetOverall = await prisma.budget.create({
    data: {
      id: uuidv7(),
      userId,
      name: 'Ngân sách Chi tiêu Tháng 8',
      amount: 15000000,
      currency: 'VND',
      type: BudgetType.OVERALL,
      period: BudgetPeriod.MONTHLY,
      startDate: businessDate('2026-08-01'),
      endDate: businessDate('2026-08-31'),
      alertThreshold: 80.00,
    }
  });

  // Ngân sách danh mục Food & Dining tháng này
  const budgetFood = await prisma.budget.create({
    data: {
      id: uuidv7(),
      userId,
      categoryId: '20000000-0000-4000-8000-000000000001', // Food & Dining
      name: 'Ngân sách Ăn uống Tháng 8',
      amount: 4500000,
      currency: 'VND',
      type: BudgetType.CATEGORY,
      period: BudgetPeriod.MONTHLY,
      startDate: businessDate('2026-08-01'),
      endDate: businessDate('2026-08-31'),
      alertThreshold: 80.00,
    }
  });

  // 4. Saving Goals & Contributions
  await prisma.savingGoal.deleteMany({ where: { userId } });

  // Mục tiêu: Mua Macbook Pro M4
  const goalMacbook = await prisma.savingGoal.create({
    data: {
      id: uuidv7(),
      userId,
      name: 'Mua Macbook Pro M4',
      targetAmount: 45000000,
      currency: 'VND',
      targetDate: businessDate('2026-12-31'),
      description: 'Phục vụ học tập và làm việc Freelance',
      icon: 'laptop',
      color: '#3B82F6',
      status: SavingGoalStatus.ACTIVE,
    }
  });

  // Đóng góp tiết kiệm
  await prisma.savingContribution.createMany({
    data: [
      {
        id: uuidv7(),
        savingGoalId: goalMacbook.id,
        amount: 10000000,
        contributedAt: new Date('2026-06-10T10:00:00Z'),
        note: 'Tiền thưởng dự án tháng 5',
      },
      {
        id: uuidv7(),
        savingGoalId: goalMacbook.id,
        amount: 5000000,
        contributedAt: new Date('2026-07-10T10:00:00Z'),
        note: 'Tích luỹ lương tháng 6',
      },
      {
        id: uuidv7(),
        savingGoalId: goalMacbook.id,
        amount: 5000000,
        contributedAt: new Date('2026-08-05T10:00:00Z'),
        note: 'Tích luỹ lương tháng 7',
      },
    ]
  });

  // 5. Notifications
  await prisma.notification.deleteMany({ where: { userId } });

  await prisma.notification.createMany({
    data: [
      {
        id: uuidv7(),
        userId,
        type: NotificationType.BUDGET_NEAR_LIMIT,
        priority: NotificationPriority.NORMAL,
        title: 'Cảnh báo ngân sách ăn uống',
        message: 'Ngân sách Ăn uống Tháng 8 đã sử dụng 3,570,000 VND (79.33%), sắp chạm ngưỡng cảnh báo 80.00%.',
        channels: [NotificationChannel.IN_APP],
        dedupKey: `budget_near_limit_${budgetFood.id}_2026-08`,
        sourceType: NotificationSourceType.BUDGET,
        sourceId: budgetFood.id,
      },
      {
        id: uuidv7(),
        userId,
        type: NotificationType.SAVING_GOAL_ACHIEVED,
        priority: NotificationPriority.HIGH,
        title: 'Cột mốc tiết kiệm mới!',
        message: 'Chúc mừng bạn đã tích lũy được 20,000,000 VND (44.44%) cho mục tiêu "Mua Macbook Pro M4". Cố lên nhé!',
        channels: [NotificationChannel.IN_APP],
        dedupKey: `saving_goal_milestone_${goalMacbook.id}_20M`,
        sourceType: NotificationSourceType.SAVING_GOAL,
        sourceId: goalMacbook.id,
      }
    ]
  });

  // 6. Reminders
  await prisma.reminder.deleteMany({ where: { userId } });

  await prisma.reminder.create({
    data: {
      id: uuidv7(),
      userId,
      type: ReminderType.RECURRING_PAYMENT,
      title: 'Đóng tiền điện & nước',
      message: 'Thanh toán tiền điện sinh hoạt và tiền nước qua Techcombank Mobile',
      remindAt: new Date('2026-08-10T09:00:00Z'),
      frequency: ReminderFrequency.MONTHLY,
      repeatInterval: 1,
      nextTriggerAt: new Date('2026-08-10T09:00:00Z'),
      isActive: true,
    }
  });

  // 7. Seed System Settings
  const defaultSettings: Array<{
    key: string;
    value: string;
    type: SettingType;
    category: SettingCategory;
    description: string;
    isEditable: boolean;
    isPublic: boolean;
  }> = [
    {
      key: 'general.default_timezone',
      value: 'Asia/Ho_Chi_Minh',
      type: SettingType.STRING,
      category: SettingCategory.GENERAL,
      description: 'Múi giờ mặc định của hệ thống',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'general.default_currency',
      value: 'VND',
      type: SettingType.STRING,
      category: SettingCategory.GENERAL,
      description: 'Đơn vị tiền tệ mặc định',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'notifications.in_app_enabled',
      value: 'true',
      type: SettingType.BOOLEAN,
      category: SettingCategory.NOTIFICATION,
      description: 'Bật/tắt kênh thông báo In-App toàn hệ thống',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'notifications.email_enabled',
      value: 'true',
      type: SettingType.BOOLEAN,
      category: SettingCategory.NOTIFICATION,
      description: 'Bật/tắt kênh gửi thông báo qua Email',
      isEditable: true,
      isPublic: false,
    },
    {
      key: 'notifications.zalo_enabled',
      value: 'false',
      type: SettingType.BOOLEAN,
      category: SettingCategory.NOTIFICATION,
      description: 'Bật/tắt kênh gửi thông báo qua Zalo ZNS',
      isEditable: true,
      isPublic: false,
    },
    {
      key: 'notifications.push_enabled',
      value: 'false',
      type: SettingType.BOOLEAN,
      category: SettingCategory.NOTIFICATION,
      description: 'Bật/tắt thông báo đẩy Web Push',
      isEditable: true,
      isPublic: false,
    },
    {
      key: 'ai.assistant.enabled',
      value: 'true',
      type: SettingType.BOOLEAN,
      category: SettingCategory.AI,
      description: 'Bật/tắt tính năng Trợ lý AI Assistant',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'ai.forecasting.enabled',
      value: 'true',
      type: SettingType.BOOLEAN,
      category: SettingCategory.AI,
      description: 'Bật/tắt tính năng Dự báo dòng tiền',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'ai.anomalies.enabled',
      value: 'true',
      type: SettingType.BOOLEAN,
      category: SettingCategory.AI,
      description: 'Bật/tắt tính năng Phát hiện chi tiêu bất thường',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'ai.query.enabled',
      value: 'true',
      type: SettingType.BOOLEAN,
      category: SettingCategory.AI,
      description: 'Bật/tắt tính năng Truy vấn DSL ngôn ngữ tự nhiên',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'ai.rate_limit.max_requests',
      value: '20',
      type: SettingType.NUMBER,
      category: SettingCategory.AI,
      description: 'Giới hạn số lượt yêu cầu AI tối đa trong một cửa sổ',
      isEditable: true,
      isPublic: false,
    },
    {
      key: 'ai.rate_limit.window_ms',
      value: '900000',
      type: SettingType.NUMBER,
      category: SettingCategory.AI,
      description: 'Cửa sổ thời gian giới hạn AI (ms)',
      isEditable: true,
      isPublic: false,
    },
    {
      key: 'security.audit_log_retention_days',
      value: '30',
      type: SettingType.NUMBER,
      category: SettingCategory.SECURITY,
      description: 'Số ngày lưu trữ nhật ký kiểm toán trước khi tự động nén lưu trữ và dọn dẹp',
      isEditable: true,
      isPublic: false,
    },
    {
      key: 'system.maintenance.enabled',
      value: 'false',
      type: SettingType.BOOLEAN,
      category: SettingCategory.SYSTEM,
      description: 'Chế độ bảo trì hệ thống toàn cục',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'system.maintenance.message',
      value: 'Hệ thống FinWise đang bảo trì để nâng cấp định kỳ. Vui lòng quay lại sau ít phút.',
      type: SettingType.STRING,
      category: SettingCategory.SYSTEM,
      description: 'Thông báo bảo trì hiển thị cho người dùng',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'system.maintenance.start_at',
      value: '',
      type: SettingType.STRING,
      category: SettingCategory.SYSTEM,
      description: 'Thời gian bắt đầu bảo trì dự kiến (ISO 8601)',
      isEditable: true,
      isPublic: true,
    },
    {
      key: 'system.maintenance.end_at',
      value: '',
      type: SettingType.STRING,
      category: SettingCategory.SYSTEM,
      description: 'Thời gian kết thúc bảo trì dự kiến (ISO 8601)',
      isEditable: true,
      isPublic: true,
    },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        type: setting.type,
        category: setting.category,
        description: setting.description,
        isEditable: setting.isEditable,
        isPublic: setting.isPublic,
      },
      create: setting,
    });
  }
  console.log(`Upserted ${defaultSettings.length} system settings`);

  // 8. Seed Notification Templates
  const defaultTemplates: Array<{
    type: NotificationType;
    channel: NotificationChannel;
    language: string;
    titleTemplate: string;
    bodyTemplate: string;
    isActive: boolean;
  }> = [
    {
      type: NotificationType.BUDGET_NEAR_LIMIT,
      channel: NotificationChannel.IN_APP,
      language: 'vi',
      titleTemplate: 'Ngân sách gần chạm hạn mức: {{budgetName}}',
      bodyTemplate: 'Chi tiêu của bạn đã đạt {{usagePercentage}}% ngân sách "{{budgetName}}". Hãy cân đối chi tiêu nhé!',
      isActive: true,
    },
    {
      type: NotificationType.BUDGET_NEAR_LIMIT,
      channel: NotificationChannel.IN_APP,
      language: 'en',
      titleTemplate: 'Budget nearing limit: {{budgetName}}',
      bodyTemplate: 'Your spending has reached {{usagePercentage}}% of "{{budgetName}}" budget.',
      isActive: true,
    },
    {
      type: NotificationType.BUDGET_EXCEEDED,
      channel: NotificationChannel.IN_APP,
      language: 'vi',
      titleTemplate: 'Cảnh báo vượt ngân sách: {{budgetName}}',
      bodyTemplate: 'Bạn đã chi tiêu vượt quá 100% ngân sách "{{budgetName}}" (Đạt {{usagePercentage}}%).',
      isActive: true,
    },
    {
      type: NotificationType.BUDGET_EXCEEDED,
      channel: NotificationChannel.IN_APP,
      language: 'en',
      titleTemplate: 'Budget exceeded: {{budgetName}}',
      bodyTemplate: 'Your spending has exceeded the limit for "{{budgetName}}" ({{usagePercentage}}%).',
      isActive: true,
    },
    {
      type: NotificationType.SAVING_GOAL_ACHIEVED,
      channel: NotificationChannel.IN_APP,
      language: 'vi',
      titleTemplate: 'Mục tiêu tiết kiệm hoàn thành!',
      bodyTemplate: 'Chúc mừng bạn đã đạt 100% mục tiêu tiết kiệm "{{goalName}}".',
      isActive: true,
    },
    {
      type: NotificationType.SAVING_GOAL_ACHIEVED,
      channel: NotificationChannel.IN_APP,
      language: 'en',
      titleTemplate: 'Saving goal achieved: {{goalName}}',
      bodyTemplate: 'Congratulations! You have reached 100% of your saving goal "{{goalName}}".',
      isActive: true,
    },
    {
      type: NotificationType.UNUSUAL_TRANSACTION,
      channel: NotificationChannel.IN_APP,
      language: 'vi',
      titleTemplate: 'Phát hiện chi tiêu bất thường',
      bodyTemplate: 'Giao dịch {{amount}} {{currency}} có dấu hiệu bất thường: {{explanation}}.',
      isActive: true,
    },
    {
      type: NotificationType.UNUSUAL_TRANSACTION,
      channel: NotificationChannel.IN_APP,
      language: 'en',
      titleTemplate: 'Unusual transaction detected',
      bodyTemplate: 'Transaction of {{amount}} {{currency}} flagged: {{explanation}}.',
      isActive: true,
    },
  ];

  for (const template of defaultTemplates) {
    await prisma.notificationTemplate.upsert({
      where: {
        type_channel_language: {
          type: template.type,
          channel: template.channel,
          language: template.language,
        },
      },
      update: {
        titleTemplate: template.titleTemplate,
        bodyTemplate: template.bodyTemplate,
        isActive: template.isActive,
      },
      create: { id: uuidv7(), ...template },
    });
  }
  console.log(`Upserted ${defaultTemplates.length} notification templates`);

  console.log('Seeding demo data for user completed.');
}


main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
