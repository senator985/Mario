/**
 * Shared Application Constants
 */
var Constants = {
  // Order Statuses
  ORDER_STATUS_ACTIVE: 'active',
  ORDER_STATUS_PENDING: 'pending_payment',
  ORDER_STATUS_PAID: 'paid',
  ORDER_STATUS_CANCELLED: 'cancelled',

  // Payment Types
  PAYMENT_TYPE_CASH: 'cash',
  PAYMENT_TYPE_CARD: 'card',
  PAYMENT_TYPE_CARD_TO_CARD: 'card_to_card',
  PAYMENT_TYPE_CREDIT: 'credit',
  PAYMENT_TYPE_DISCOUNT: 'discount',
  PAYMENT_TYPE_CHECK: 'check',

  // User Statuses
  USER_STATUS_ACTIVE: 'active',
  USER_STATUS_INACTIVE: 'inactive',

  // Log Statuses
  LOG_STATUS_ACTIVE: 'active',
  LOG_STATUS_CLOSED: 'closed',
  LOG_STATUS_PAID: 'paid',

  // Permissions
  PERMISSIONS: {
    VIEW_ORDERS: 'view_orders',
    CREATE_ORDERS: 'create_orders',
    EDIT_ORDERS: 'edit_orders',
    DELETE_ORDERS: 'delete_orders',
    TRANSFER_ORDERS: 'transfer_orders',
    SETTLE_ORDERS: 'settle_orders',
    REOPEN_ORDERS: 'reopen_orders',
    EDIT_PAID_ORDERS: 'edit_paid_orders',

    VIEW_CUSTOMERS: 'view_customers',
    CREATE_CUSTOMERS: 'create_customers',
    EDIT_CUSTOMERS: 'edit_customers',
    DELETE_CUSTOMERS: 'delete_customers',
    CHARGE_CREDIT: 'charge_credit',
    DEDUCT_CREDIT: 'deduct_credit',

    VIEW_BUFFET: 'view_buffet',
    CREATE_BUFFET: 'create_buffet',
    EDIT_BUFFET: 'edit_buffet',
    DELETE_BUFFET: 'delete_buffet',

    VIEW_EXPENSES: 'view_expenses',
    CREATE_EXPENSES: 'create_expenses',
    EDIT_EXPENSES: 'edit_expenses',
    DELETE_EXPENSES: 'delete_expenses',

    VIEW_TOURNAMENTS: 'view_tournaments',
    CREATE_TOURNAMENTS: 'create_tournaments',
    EDIT_TOURNAMENTS: 'edit_tournaments',
    DELETE_TOURNAMENTS: 'delete_tournaments',

    VIEW_SECRETARY: 'view_secretary',
    CLOCK_IN_SECRETARY: 'clock_in_secretary',
    CLOCK_OUT_SECRETARY: 'clock_out_secretary',
    EDIT_SECRETARY_LOGS: 'edit_secretary_logs',
    DELETE_SECRETARY_LOGS: 'delete_secretary_logs',

    VIEW_REPORTS: 'view_reports',
    EXPORT_REPORTS: 'export_reports',

    VIEW_SETTINGS: 'view_settings',
    EDIT_SETTINGS: 'edit_settings',
    MANAGE_USERS: 'manage_users',
    MANAGE_CONSOLES: 'manage_consoles',
    MANAGE_RATES: 'manage_rates',
    MANAGE_DEFAULT_SERVICES: 'manage_default_services',

    VIEW_ACTIVITY_LOGS: 'view_activity_logs',
    DELETE_ACTIVITY_LOGS: 'delete_activity_logs',
  },

  // Fine-Grained Action Options Definition
  ACTION_OPTIONS: [
    {
      groupKey: 'orders',
      title: 'مدیریت سفارشات',
      parentPermission: 'view_orders',
      actions: [
        { key: 'create_orders', label: 'ثبت سفارش جدید' },
        { key: 'edit_orders', label: 'ویرایش سفارشات فعال' },
        { key: 'delete_orders', label: 'حذف سفارشات' },
        { key: 'transfer_orders', label: 'جابجایی سفارشات' },
        { key: 'settle_orders', label: 'تسویه سفارشات' },
        { key: 'reopen_orders', label: 'بازگردانی سفارشات تسویه شده' },
        { key: 'edit_paid_orders', label: 'ویرایش فاکتورهای تسویه شده' },
      ],
    },
    {
      groupKey: 'customers',
      title: 'مدیریت مشتریان',
      parentPermission: 'view_customers',
      actions: [
        { key: 'create_customers', label: 'افزودن مشتری جدید' },
        { key: 'edit_customers', label: 'ویرایش مشخصات مشتری' },
        { key: 'delete_customers', label: 'حذف مشتری' },
        { key: 'charge_credit', label: 'افزایش اعتبار / شارژ حساب' },
        { key: 'deduct_credit', label: 'کاهش اعتبار / دریافت بدهی' },
      ],
    },
    {
      groupKey: 'buffet',
      title: 'مدیریت بوفه',
      parentPermission: 'view_buffet',
      actions: [
        { key: 'create_buffet', label: 'افزودن آیتم جدید بوفه' },
        { key: 'edit_buffet', label: 'ویرایش قیمت و موجودی بوفه' },
        { key: 'delete_buffet', label: 'حذف آیتم بوفه' },
      ],
    },
    {
      groupKey: 'expenses',
      title: 'مدیریت هزینه‌ها',
      parentPermission: 'view_expenses',
      actions: [
        { key: 'create_expenses', label: 'ثبت هزینه جدید / چک' },
        { key: 'edit_expenses', label: 'ویرایش هزینه‌ها و چک‌ها' },
        { key: 'delete_expenses', label: 'حذف هزینه / چک' },
      ],
    },
    {
      groupKey: 'tournaments',
      title: 'مدیریت تورنمنت‌ها',
      parentPermission: 'view_tournaments',
      actions: [
        { key: 'create_tournaments', label: 'ایجاد تورنمنت جدید' },
        { key: 'edit_tournaments', label: 'ویرایش تورنمنت و قرعه‌کشی' },
        { key: 'delete_tournaments', label: 'حذف تورنمنت' },
      ],
    },
    {
      groupKey: 'secretary',
      title: 'مدیریت کارکرد منشی',
      parentPermission: 'view_secretary',
      actions: [
        { key: 'clock_in_secretary', label: 'ثبت ورود / ثبت دستی کارکرد' },
        { key: 'clock_out_secretary', label: 'ثبت خروج' },
        { key: 'edit_secretary_logs', label: 'ویرایش و تسویه کارکرد منشی' },
        { key: 'delete_secretary_logs', label: 'حذف رکورد کارکرد منشی' },
      ],
    },
    {
      groupKey: 'reports',
      title: 'آمار و گزارشات',
      parentPermission: 'view_reports',
      actions: [
        { key: 'export_reports', label: 'خروجی اکسل و چاپ گزارشات' },
      ],
    },
    {
      groupKey: 'settings',
      title: 'تنظیمات سیستم',
      parentPermission: 'view_settings',
      actions: [
        { key: 'edit_settings', label: 'ویرایش اطلاعات گیم‌نت' },
        { key: 'manage_users', label: 'مدیریت کاربران و دسترسی‌ها' },
        { key: 'manage_consoles', label: 'مدیریت کنسول‌ها و دستگاه‌ها' },
        { key: 'manage_rates', label: 'مدیریت تعرفه‌های قیمت' },
        { key: 'manage_default_services', label: 'مدیریت خدمات پیش‌فرض' },
      ],
    },
    {
      groupKey: 'activity_logs',
      title: 'لوگ‌های سیستم',
      parentPermission: 'view_activity_logs',
      actions: [
        { key: 'delete_activity_logs', label: 'حذف رکورد لوگ‌های سیستم' },
      ],
    },
  ],

  // System Messages
  MESSAGES: {
    UNAUTHORIZED: 'شما دسترسی لازم برای انجام این عملیات را ندارید.',
    SERVER_ERROR: 'خطا در ارتباط با سرور. لطفا مجددا تلاش کنید.',
    SUCCESS_SAVE: 'اطلاعات با موفقیت ذخیره شد.',
    SUCCESS_DELETE: 'آیتم مورد نظر با موفقیت حذف شد.',
  },
};

// Global backward compatibility
if (typeof window !== 'undefined') {
  window.Constants = Constants;
}
