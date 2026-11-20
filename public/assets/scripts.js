  var API_BASE = window.location.pathname.includes('/pages/') ? '../src/api.php' : 'src/api.php';
document.addEventListener("DOMContentLoaded", () => {
  // --- Server Time Service ---
  const TimeService = {
    serverOffsetMs: 0,
    isSynced: false,
    sync(serverTimeMs) {
      if (serverTimeMs) {
        this.serverOffsetMs = Number(serverTimeMs) - Date.now();
        this.isSynced = true;
      }
    },
    nowMs() {
      return Date.now() + this.serverOffsetMs;
    },
    nowDate() {
      return new Date(this.nowMs());
    },
    nowMoment() {
      return moment(this.nowMs());
    },
    nowString(format = "YYYY-MM-DD HH:mm:ss") {
      return this.nowMoment().format(format);
    }
  };

  // --- Global State & Elements ---
  let localData = {};
  // [NEW] State for advanced table views
  let customerViewState = {
    searchTerm: "",
    sortBy: "subCode",
    sortOrder: "asc",
    currentPage: 1,
    limit: 50, // or whatever limit you prefer
  };
  let buffetViewState = {
    searchTerm: "",
    sortBy: "name",
    sortOrder: "asc",
    currentPage: 1,
    limit: 50,
  };
  let expensesViewState = {
    searchTerm: "",
    currentPage: 1,
    limit: 50,
  };
  let reportsViewState = {
    searchTerm: "",
    paymentMethod: "",
    sortBy: "settlementTime",
    sortOrder: "desc",
    dateFrom: "",
    dateTo: "",
    currentPage: 1,
    limit: 50,
  };

  let dailyOrdersViewState = {
    currentPage: 1,
    limit: 50,
  };

  // [FIX] تابع برای ریست کردن وضعیت برنامه به حالت اولیه
  function resetLocalData() {
    localData = {
      customers: [],
      consoles: [],
      buffet: [],
      orders: [],
      expenses: [],
      users: [],
      defaultServices: [],
      tournaments: [],
      appSettings: { notificationsEnabled: true },
    };
  }

  // [NEW] آبجکت برای مدیریت وضعیت همگام‌سازی
  const syncState = {
    dirty: new Set(), // کلیدهای داده‌ای که تغییر کرده‌اند (مثلا 'customers')
    saving: false, // آیا در حال حاضر عملیات ذخیره‌سازی در حال انجام است؟
    error: false, // آیا در آخرین تلاش برای ذخیره خطایی رخ داده است؟
  };

  let lastServerVersions = {};
  let autoSyncEnabled = localStorage.getItem("autoSyncEnabled") !== "false";
  let currentUser = null; // کاربر فعلی لاگین کرده
  let incomeChartInstance = null; // نمونه نمودار درآمد
  let activeOrderTimers = {}; // تایمرهای مربوط به سفارشات فعال
  let currentSettlement = {
    order: null,
    payments: [],
    totalAmount: 0,
    customerId: null,
    discountAmount: 0,
    creditPaymentCustomerId: null,
    finalGameCost: 0,
  }; // اطلاعات تسویه حساب فعلی
  let synth = null; // برای تولید صدا
  let dataSyncInterval = null; // برای همگام‌سازی دوره‌ای داده‌ها با سرور
  let shamsiPickerState = {
    currentMoment: TimeService.nowMoment(),
    targetInput: null,
    displayInput: null,
  };
  let reportsState = {
    currentMoment: TimeService.nowMoment(),
    period: "daily",
  };

  moment.locale("fa"); // تنظیم زبان کتابخانه moment.js به فارسی
  moment.loadPersian({ dialect: "persian-modern" }); // بارگذاری تنظیمات فارسی برای moment-jalaali
  const JALAALI_MONTHS = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];

  // [NEW] Permission Constants and Helper
  // [NEW] Permission Constants and Helper
  const PERMISSIONS = {
    // View Permissions (Control Sidebar & Access)
    VIEW_ORDERS: "view_orders",
    VIEW_TOURNAMENTS: "view_tournaments",
    VIEW_REPORTS: "view_reports",
    VIEW_CUSTOMERS: "view_customers",
    VIEW_BUFFET: "view_buffet",
    VIEW_EXPENSES: "view_expenses",
    VIEW_SECRETARY: "view_secretary",
    VIEW_SETTINGS: "view_settings",

    // Manage Permissions (Actions)
    MANAGE_USERS: "manage_users",
    MANAGE_CONSOLES: "manage_consoles",
    MANAGE_BUFFET: "manage_buffet",
    MANAGE_EXPENSES: "manage_expenses",
    MANAGE_TOURNAMENTS: "manage_tournaments",
    EDIT_ORDERS: "edit_orders",
    DELETE_ORDERS: "delete_orders",
    SETTLE_ORDERS: "settle_orders",
    MANAGE_SECRETARY_LOGS: "manage_secretary_logs",
  };

  // Mapping Page IDs to Required View Permissions
  const PAGE_PERMISSIONS = {
    orders: PERMISSIONS.VIEW_ORDERS,
    tournaments: PERMISSIONS.VIEW_TOURNAMENTS,
    reports: PERMISSIONS.VIEW_REPORTS,
    customers: PERMISSIONS.VIEW_CUSTOMERS,
    buffet: PERMISSIONS.VIEW_BUFFET,
    expenses: PERMISSIONS.VIEW_EXPENSES,
    secretary: PERMISSIONS.VIEW_SECRETARY,
    settings: PERMISSIONS.VIEW_SETTINGS,
  };

  function hasPermission(permission) {
    if (!currentUser) return false;
    // Legacy admin support: if isAdmin is true, grant all permissions
    if (currentUser.isAdmin) return true;
    // Check specific permission
    return (
      currentUser.permissions && currentUser.permissions.includes(permission)
    );
  }

  // [NEW] SVG Icons for buttons
  const ICONS = {
    trash: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>`,
    eye: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`,
    plus: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`,
    minus: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" /></svg>`,
    transfer: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>`,
    cash: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>`,
    buffet: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.658-.463 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" /></svg>`,
  };

  // --- API Layer for Server Communication with PHP ---
  const api = {
    // [MODIFIED] Fetch data with sorting, searching, and pagination
    getData: async (type, params = {}) => {
      const apiType = type === "defaultServices" ? "default_services" : type;
      let url = new URL(
        `${API_BASE}?action=get_data&type=${apiType}`,
        window.location.origin,
      );

      // Append all parameters from the params object
      for (const key in params) {
        if (params[key]) {
          // Only add param if it has a value
          url.searchParams.append(key, params[key]);
        }
      }

      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Network response was not ok for ${type}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data; // Returns object with { data: [...], pagination: {...} }
    },

    // [NEW] Create a single item
    createItem: async (type, item) => {
      const apiType = type === "defaultServices" ? "default_services" : type;
      const response = await fetch(
        `${API_BASE}?action=create_item&type=${apiType}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: item }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || `Failed to create ${type}`);
      return result.data; // e.g., { id: '...', version: 1 }
    },

    // [NEW] Update a single item
    updateItem: async (type, id, item) => {
      const apiType = type === "defaultServices" ? "default_services" : type;
      const response = await fetch(
        `${API_BASE}?action=update_item&type=${apiType}&id=${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: item }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || `Failed to update ${type}`);
        error.status = response.status; // Attach status code for conflict handling
        throw error;
      }
      return result.data; // e.g., { id: '...', version: 2 }
    },

    // [NEW] Delete a single item
    deleteItem: async (type, id) => {
      const apiType = type === "defaultServices" ? "default_services" : type;
      const response = await fetch(
        `${API_BASE}?action=delete_item&type=${apiType}&id=${id}`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || `Failed to delete ${type}`);
      return result.data;
    },
  };

  // [NEW] Caching helpers
  function saveToCache(table, data, versionInfo) {
    if (!versionInfo) return;
    const key = `cache_${table}`;
    const cacheData = {
      data: data,
      versionInfo: versionInfo, // { total_version: X, count: Y }
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (e) {
      console.warn(`Failed to save ${table} to cache:`, e);
    }
  }

  function getFromCache(table, currentVersionInfo) {
    const key = `cache_${table}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    try {
      const cacheData = JSON.parse(cached);
      if (!cacheData.versionInfo || !currentVersionInfo) return null;

      if (
        cacheData.versionInfo.total_version ===
          currentVersionInfo.total_version &&
        cacheData.versionInfo.count === currentVersionInfo.count
      ) {
        return cacheData.data;
      }
    } catch (e) {
      console.error(`Error parsing cache for ${table}:`, e);
    }
    return null;
  }

  // [NEW] Helper to handle data conflicts by fetching latest version
  async function handleUpdateConflict(type, id) {
    console.log(
      `Conflict detected for ${type} ID ${id}. Fetching latest version...`,
    );
    try {
      const result = await api.getData(type, { id: id });
      if (result && result.data && result.data.length > 0) {
        const items = parseDates(result.data, type);
        const latestItem = items.find((item) => item.id === id);
        if (!latestItem) return null;

        // Update local cache
        if (Array.isArray(localData[type])) {
          const index = localData[type].findIndex((item) => item.id === id);
          if (index > -1) {
            localData[type][index] = latestItem;
          }
        }

        // Silent UI refresh of the current page to ensure consistency
        const activePageEl = document.querySelector(".nav-link.active");
        if (activePageEl) {
          fetchAndRenderPage(activePageEl.dataset.page, true, true);
        }

        return latestItem;
      }
    } catch (e) {
      console.error("Failed to resolve conflict:", e);
    }
    return null;
  }

  window.loadMore = (type) => {
    switch (type) {
      case "customers":
        customerViewState.currentPage++;
        fetchAndRenderCustomers(true);
        break;
      case "buffet":
        buffetViewState.currentPage++;
        fetchAndRenderBuffet(true);
        break;
      case "reports":
        reportsViewState.currentPage++;
        fetchAndRenderReports(true);
        break;
      case "dailyOrders":
        dailyOrdersViewState.currentPage++;
        fetchAndRenderDailyOrders(true);
        break;
      case "expenses":
        expensesViewState.currentPage++;
        fetchAndRenderExpenses(true);
        break;
    }
  };

  const generateId = () => "_" + Math.random().toString(36).substr(2, 9);

  // [NEW] Centralized function to parse date strings into Date objects
  function parseDates(data, key) {
    if (!data) return [];
    const dateKeys = {
      orders: ["startTime", "endDate", "scheduledEndTime", "settlementTime"],
      expenses: ["createdAt", "dueDate"],
      tournaments: ["startDate"],
    };

    if (!dateKeys[key]) return data;

    data.forEach((item) => {
      dateKeys[key].forEach((dateField) => {
        if (item[dateField]) {
          const m = moment(item[dateField]);
          item[dateField] = m.isValid() ? m.toDate() : null;
        }
      });
      if (key === "orders" && item.history && Array.isArray(item.history)) {
        item.history.forEach((hist) => {
          if (hist.startTime) hist.startTime = new Date(hist.startTime);
          if (hist.endTime) hist.endTime = new Date(hist.endTime);
        });
      }
    });
    if (key === "users") {
      data.forEach((user) => {
        if (typeof user.permissions === "string") {
          try {
            user.permissions = JSON.parse(user.permissions);
          } catch (e) {
            console.error(
              "Failed to parse permissions for user " + user.username,
              e,
            );
            user.permissions = [];
          }
        } else if (!user.permissions) {
          user.permissions = [];
        }
      });
    }
    return data;
  }

  // --- Auto-Refresh Logic ---
  // [DEPRECATED] This will be removed and replaced with smarter data fetching.
  const startDataSync = () => {
    return;
  };

  // [MODIFIED] Load only essential data on startup
  async function loadEssentialData() {
    showLoading();
    try {
      const cachedUsers = getFromCache("users", lastServerVersions["users"]);
      const cachedConsoles = getFromCache(
        "consoles",
        lastServerVersions["consoles"],
      );
      const cachedServices = getFromCache(
        "default_services",
        lastServerVersions["default_services"],
      );
      const cachedCustomers = getFromCache(
        "customers",
        lastServerVersions["customers"],
      );
      const cachedBuffet = getFromCache("buffet", lastServerVersions["buffet"]);

      const promises = [];

      if (cachedUsers) {
        localData.users = parseDates(cachedUsers, "users");
      } else {
        promises.push(
          api.getData("users").then((res) => {
            localData.users = parseDates(res.data, "users");
            saveToCache("users", res.data, lastServerVersions["users"]);
          }),
        );
      }

      if (cachedConsoles) {
        localData.consoles = parseDates(cachedConsoles, "consoles");
      } else {
        promises.push(
          api.getData("consoles").then((res) => {
            localData.consoles = parseDates(res.data, "consoles");
            saveToCache("consoles", res.data, lastServerVersions["consoles"]);
          }),
        );
      }

      if (cachedServices) {
        localData.defaultServices = parseDates(
          cachedServices,
          "defaultServices",
        );
      } else {
        promises.push(
          api.getData("default_services").then((res) => {
            localData.defaultServices = parseDates(res.data, "defaultServices");
            saveToCache(
              "default_services",
              res.data,
              lastServerVersions["default_services"],
            );
          }),
        );
      }

      if (cachedCustomers) {
        localData.customers = parseDates(cachedCustomers, "customers");
      } else {
        promises.push(
          api.getData("customers").then((res) => {
            localData.customers = parseDates(res.data, "customers");
            saveToCache("customers", res.data, lastServerVersions["customers"]);
          }),
        );
      }

      if (cachedBuffet) {
        localData.buffet = parseDates(cachedBuffet, "buffet");
      } else {
        promises.push(
          api.getData("buffet").then((res) => {
            localData.buffet = parseDates(res.data, "buffet");
            saveToCache("buffet", res.data, lastServerVersions["buffet"]);
          }),
        );
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }
    } catch (error) {
      console.error("Failed to fetch essential data:", error);
      showNotification("خطا در ارتباط با سرور. لطفا صفحه را رفرش کنید.", true);
    } finally {
      hideLoading();
    }
  }

  // --- Utility Functions ---
  // [REFACTORED] Centralized UI locking by disabling buttons and links
  function setAllButtonsDisabled(disabled) {
    document.querySelectorAll('button, [role="button"]').forEach((el) => {
      const modal = el.closest(".modal-overlay");
      const isHiddenModalButton = modal && modal.classList.contains("hidden");
      const isAllowedButton =
        el.id === "logout-button" || el.id === "mobile-menu-button";
      const isModalCloseButton =
        el.getAttribute("onclick")?.includes("closeModal") ||
        el.id.includes("close-btn") ||
        el.id.includes("no-btn") ||
        el.id.includes("ok-btn");

      if (isHiddenModalButton || isAllowedButton || isModalCloseButton) {
        return; // Don't disable these
      }
      el.disabled = disabled;
    });
    // Also disable sidebar links during loading
    document.querySelectorAll("#sidebar-nav a").forEach((link) => {
      if (disabled) {
        link.style.pointerEvents = "none";
        link.style.opacity = "0.5";
      } else {
        link.style.pointerEvents = "auto";
        link.style.opacity = "1";
      }
    });
  }

  // توابع کمکی برای فرمت‌دهی و نمایش
  const generateInvoiceNumber = () => {
    if (!localData.orders || localData.orders.length === 0) {
      return 1;
    }
    const maxInvoiceNumber = localData.orders.reduce(
      (max, o) => Math.max(max, o.invoiceNumber || 0),
      0,
    );
    return maxInvoiceNumber + 1;
  };

  const formatCurrency = (amount) => {
    const value = Math.round(Number(amount || 0));
    // این تابع به صورت خودکار اعداد مثبت و منفی را به درستی فرمت می‌کند
    const formatted = value.toLocaleString("en-US");
    return `${formatted} تومان`;
  };

  // [NEW] تابع برای دریافت مقدار عددی خالص از یک فیلد فرمت شده
  const getNumericValue = (input) => {
    const el = typeof input === "string" ? getEl(input) : input;
    if (!el || !el.value) return 0;
    const value = el.value;
    // تمام ویرگول‌ها را حذف کرده و به عدد تبدیل می‌کند
    const numericValue = parseInt(value.replace(/,/g, ""), 10);
    return isNaN(numericValue) ? 0 : numericValue;
  };

  // [NEW] تابع برای فرمت کردن ورودی‌های مبلغ به صورت سه رقم سه رقم
  const formatCurrencyInput = (event) => {
    const input = event.target;
    // مقدار فعلی را گرفته و ویرگول‌ها را حذف کرده و به عدد تبدیل می‌کنیم
    let numericValue = parseFloat(input.value.replace(/,/g, "")) || 0;

    if (numericValue === 0 && input.value !== "0") {
      input.value = "";
      return;
    }

    // رشته عددی را به فرمت محلی (با ویرگول) تبدیل می‌کنیم
    const formattedValue = numericValue.toLocaleString("en-US");

    // مقدار جدید را فقط در صورتی جایگزین می‌کنیم که تغییر کرده باشد تا از حلقه‌های نامتناهی جلوگیری شود
    if (formattedValue !== input.value) {
      input.value = formattedValue;
    }
  };

  const formatShamsiDate = (date, includeTime = false) => {
    if (!date) return "---";
    const mDate = moment(date);
    if (!mDate.isValid()) {
      console.warn("Invalid date for formatting:", date);
      return "---";
    }
    const format = includeTime ? "jYYYY/jMM/jDD HH:mm" : "jYYYY/jMM/jDD";
    return mDate.format(format);
  };

  const formatTime = (date) =>
    date
      ? new Date(date).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "---";
  const getEl = (id) => document.getElementById(id);
  const addListener = (target, event, handler) => {
    const el = typeof target === 'string' ? getEl(target) : target;
    if (el) {
      el.addEventListener(event, handler);
    }
  };

  let loaderAnimation = null; // Keep track of the animation instance
  const showLoading = () => {
    getEl("loading-overlay").classList.remove("hidden");
    if (loaderAnimation) {
      loaderAnimation.restart();
    } else {
      loaderAnimation = anime({
        targets: "#new-loader",
        scale: [1, 1.1, 1],
        duration: 750,
        easing: "easeInOutSine",
        loop: true,
      });
    }
  };
  const hideLoading = () => {
    getEl("loading-overlay").classList.add("hidden");
    if (loaderAnimation) {
      loaderAnimation.pause();
    }
  };

  function animatePageElements() {
    // Initial page animations disabled
  }

  // پخش صدا
  async function playSound(note, duration = "8n") {
    if (!(localData.appSettings?.notificationsEnabled ?? true)) return;
    try {
      if (Tone.context.state !== "running") {
        await Tone.start();
      }
      if (!synth) {
        synth = new Tone.Synth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 },
        }).toDestination();
      }
      synth.triggerAttackRelease(note, duration);
    } catch (e) {
      // console.error("Audio could not be played:", e);
    }
  }

  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // نمایش نوتیفیکیشن مرورگر
  function showBrowserNotification(title, options) {
    if (!(localData.appSettings?.notificationsEnabled ?? true)) return;

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(title, options);
    }
  }

  // =======================================================
  // Central Notification System & Toast Manager
  // =======================================================
  const NOTIFICATION_STORAGE_KEY = "gamenet_notification_history";
  const MAX_NOTIFICATION_HISTORY = 100;

  window.NotificationCenter = {
    history: [],
    currentFilter: "all",
    lastNotification: { message: "", type: "", time: 0 },

    init() {
      this.loadHistory();
      this.updateBadges();
      this.renderHistoryList();
    },

    loadHistory() {
      try {
        const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
        this.history = stored ? JSON.parse(stored) : [];
      } catch (e) {
        console.error("Failed to load notification history:", e);
        this.history = [];
      }
    },

    saveHistory() {
      try {
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(this.history.slice(0, MAX_NOTIFICATION_HISTORY)));
      } catch (e) {
        console.error("Failed to save notification history:", e);
      }
    },

    normalizeType(typeOrIsError) {
      if (typeof typeOrIsError === "boolean") {
        return typeOrIsError ? "error" : "success";
      }
      if (typeOrIsError === "danger") return "error";
      if (["success", "error", "warning", "info"].includes(typeOrIsError)) {
        return typeOrIsError;
      }
      return "info";
    },

    addNotification(message, typeOrIsError = false, title = null) {
      if (!message) return;
      const type = this.normalizeType(typeOrIsError);
      const now = Date.now();

      // Deduplication: skip identical message & type within 2 seconds
      if (
        this.lastNotification.message === message &&
        this.lastNotification.type === type &&
        now - this.lastNotification.time < 2000
      ) {
        return;
      }
      this.lastNotification = { message, type, time: now };

      const defaultTitle =
        type === "error"
          ? "خطا در سیستم"
          : type === "warning"
          ? "هشدار"
          : type === "success"
          ? "عملیات موفق"
          : "اطلاع‌رسانی";

      const item = {
        id: "notif_" + now + "_" + Math.random().toString(36).substr(2, 5),
        message: message,
        type: type,
        title: title || defaultTitle,
        timestamp: new Date().toISOString(),
        read: false,
      };

      this.history.unshift(item);
      if (this.history.length > MAX_NOTIFICATION_HISTORY) {
        this.history = this.history.slice(0, MAX_NOTIFICATION_HISTORY);
      }

      this.saveHistory();
      this.updateBadges();
      this.renderHistoryList();

      // Display Toast
      if (window.ToastManager) {
        window.ToastManager.showToast(item);
      }

      // Browser Notification if enabled
      showBrowserNotification(item.title, { body: item.message });

      return item;
    },

    getUnreadCount() {
      return this.history.filter((n) => !n.read).length;
    },

    markAsRead(id) {
      const item = this.history.find((n) => n.id === id);
      if (item && !item.read) {
        item.read = true;
        this.saveHistory();
        this.updateBadges();
        this.renderHistoryList();
      }
    },

    markAllAsRead() {
      let changed = false;
      this.history.forEach((n) => {
        if (!n.read) {
          n.read = true;
          changed = true;
        }
      });
      if (changed) {
        this.saveHistory();
        this.updateBadges();
        this.renderHistoryList();
      }
    },

    clearHistory() {
      this.history = [];
      this.saveHistory();
      this.updateBadges();
      this.renderHistoryList();
    },

    setFilter(filter) {
      this.currentFilter = filter;
      const tabAll = getEl("notif-tab-all");
      const tabUnread = getEl("notif-tab-unread");
      if (tabAll && tabUnread) {
        if (filter === "unread") {
          tabUnread.classList.add("bg-stone-700", "text-white");
          tabUnread.classList.remove("text-stone-400");
          tabAll.classList.remove("bg-stone-700", "text-white");
          tabAll.classList.add("text-stone-400");
        } else {
          tabAll.classList.add("bg-stone-700", "text-white");
          tabAll.classList.remove("text-stone-400");
          tabUnread.classList.remove("bg-stone-700", "text-white");
          tabUnread.classList.add("text-stone-400");
        }
      }
      this.renderHistoryList();
    },

    updateBadges() {
      const unreadCount = this.getUnreadCount();
      const badgeEls = document.querySelectorAll(".notif-badge");
      badgeEls.forEach((badge) => {
        if (unreadCount > 0) {
          badge.textContent = unreadCount > 99 ? "99+" : unreadCount;
          badge.classList.remove("hidden");
        } else {
          badge.classList.add("hidden");
        }
      });
    },

    renderHistoryList() {
      const listEl = getEl("notification-history-list");
      if (!listEl) return;

      let items = this.history;
      if (this.currentFilter === "unread") {
        items = items.filter((n) => !n.read);
      }

      if (items.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-8 text-stone-400">
            <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p class="text-sm">${this.currentFilter === "unread" ? "هیچ اعلان خوانده‌نشده‌ای وجود ندارد." : "تاریخچه اعلان‌ها خالی است."}</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = items
        .map((item) => {
          let typeColor = "border-blue-500 bg-stone-800/80 text-blue-400";
          let iconSvg = `<svg class="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;

          if (item.type === "success") {
            typeColor = "border-emerald-500 bg-stone-800/80 text-emerald-400";
            iconSvg = `<svg class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
          } else if (item.type === "error") {
            typeColor = "border-red-500 bg-stone-800/80 text-red-400";
            iconSvg = `<svg class="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
          } else if (item.type === "warning") {
            typeColor = "border-amber-500 bg-stone-800/80 text-amber-400";
            iconSvg = `<svg class="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
          }

          const timeFormatted = typeof moment !== "undefined" ? moment(item.timestamp).fromNow() : item.timestamp;
          const unreadDot = !item.read ? `<span class="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0 animate-pulse"></span>` : "";

          return `
            <div class="p-3 mb-2 rounded-lg border-r-4 ${typeColor} hover:bg-stone-700/80 transition duration-150 flex items-start gap-3 relative cursor-pointer" onclick="NotificationCenter.markAsRead('${item.id}')">
              ${iconSvg}
              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-1">
                  <span class="font-bold text-sm text-stone-100">${escapeHTML(item.title)}</span>
                  <span class="text-xs text-stone-400" dir="ltr">${timeFormatted}</span>
                </div>
                <p class="text-xs text-stone-300 break-words leading-relaxed">${escapeHTML(item.message)}</p>
              </div>
              ${unreadDot}
            </div>
          `;
        })
        .join("");
    },
  };

  // Toast Manager for displaying floating alert notifications
  window.ToastManager = {
    showToast(notification) {
      let container = getEl("toast-container");
      if (!container) return;

      const toastId = "toast_" + notification.id;
      const toastEl = document.createElement("div");
      toastEl.id = toastId;

      let borderClass = "border-blue-500 bg-stone-900/95 text-blue-300";
      let iconSvg = `<svg class="w-6 h-6 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
      let autoDismissDuration = 4500;

      if (notification.type === "success") {
        borderClass = "border-emerald-500 bg-stone-900/95 text-emerald-300";
        iconSvg = `<svg class="w-6 h-6 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
        autoDismissDuration = 4000;
      } else if (notification.type === "error") {
        borderClass = "border-red-500 bg-stone-900/95 text-red-300";
        iconSvg = `<svg class="w-6 h-6 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
        autoDismissDuration = 7000;
      } else if (notification.type === "warning") {
        borderClass = "border-amber-500 bg-stone-900/95 text-amber-300";
        iconSvg = `<svg class="w-6 h-6 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
        autoDismissDuration = 5000;
      }

      toastEl.className = `toast-card p-4 rounded-xl shadow-2xl border-r-4 ${borderClass} flex items-start gap-3 backdrop-blur-md transition-all duration-300 pointer-events-auto transform translate-x-0`;
      toastEl.style.zIndex = "99999";

      toastEl.innerHTML = `
        ${iconSvg}
        <div class="flex-1 min-w-0 pr-1">
          <h4 class="text-sm font-bold text-stone-100 mb-1">${escapeHTML(notification.title)}</h4>
          <p class="text-xs text-stone-200 leading-relaxed break-words">${escapeHTML(notification.message)}</p>
        </div>
        <button class="text-stone-400 hover:text-stone-100 transition p-1 -mr-1 -mt-1 rounded focus:outline-none" onclick="ToastManager.closeToast('${toastId}')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      `;

      container.appendChild(toastEl);

      if (typeof anime !== "undefined") {
        anime({
          targets: toastEl,
          translateX: [-50, 0],
          opacity: [0, 1],
          duration: 250,
          easing: "easeOutCubic",
        });
      }

      if (autoDismissDuration > 0) {
        setTimeout(() => {
          this.closeToast(toastId);
        }, autoDismissDuration);
      }
    },

    closeToast(toastId) {
      const toastEl = getEl(toastId);
      if (!toastEl) return;

      if (typeof anime !== "undefined") {
        anime({
          targets: toastEl,
          opacity: [1, 0],
          translateX: [0, -30],
          duration: 200,
          easing: "easeInCubic",
          complete: () => toastEl.remove(),
        });
      } else {
        toastEl.remove();
      }
    },
  };

  // Central showNotification function
  function showNotification(message, isErrorOrType = false, title = null) {
    if (!message) return;
    window.NotificationCenter.addNotification(message, isErrorOrType, title);

    const notifModalMsg = getEl("notification-message");
    if (notifModalMsg) {
      notifModalMsg.textContent = message;
    }
  }
  window.showNotification = showNotification;

  // نمایش مودال تایید (بله/خیر)
  window.showConfirmation = (
    message,
    onConfirm,
    onCancel,
    confirmText = "بله",
    cancelText = "خیر",
  ) => {
    getEl("confirmation-message").textContent = message;
    const yesBtn = getEl("confirm-yes-btn");
    const noBtn = getEl("confirm-no-btn");
    yesBtn.textContent = confirmText;
    noBtn.textContent = cancelText;

    openModal("confirmation-modal");

    const confirmHandler = () => {
      closeModal("confirmation-modal");
      if (onConfirm) onConfirm();
      yesBtn.removeEventListener("click", confirmHandler);
      noBtn.removeEventListener("click", cancelHandler);
    };

    const cancelHandler = () => {
      closeModal("confirmation-modal");
      if (onCancel) onCancel();
      yesBtn.removeEventListener("click", confirmHandler);
      noBtn.removeEventListener("click", cancelHandler);
    };

    yesBtn.addEventListener("click", confirmHandler, { once: true });
    noBtn.addEventListener("click", cancelHandler, { once: true });
  };

  function trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusableElements.length === 0) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    modal.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    });
  }
  // توابع عمومی برای باز و بسته کردن مودال‌ها
  window.openModal = (modalId) => {
    const modal = getEl(modalId);
    modal.classList.remove("hidden");
    anime({
      targets: modal.querySelector(".card"),
      scale: [0.9, 1],
      opacity: [0, 1],
      duration: 200,
      easing: "easeOutExpo",
    });
    trapFocus(modal); // Add this call
  };
  window.closeModal = (modalId) => {
    const modal = getEl(modalId);
    anime({
      targets: modal.querySelector(".card"),
      scale: [1, 0.9],
      opacity: [1, 0],
      duration: 150,
      easing: "easeInExpo",
      complete: () => {
        modal.classList.add("hidden");
      },
    });
  };

  // --- Rendering Functions ---
  // [NEW] Fetches and renders the customers table based on the current view state
  async function fetchAndRenderCustomers(isLoadMore = false) {
    // Try cache only if it's the first page and no search term and not a load more
    if (
      customerViewState.currentPage === 1 &&
      !customerViewState.searchTerm &&
      !isLoadMore
    ) {
      const cached = getFromCache("customers", lastServerVersions["customers"]);
      if (cached) {
        localData.customers = parseDates(cached, "customers");
        renderCustomersTable(localData.customers);
        const cLm = getEl("customers-load-more"); if (cLm) cLm.classList.add("hidden");
        return;
      }
    }

    showLoading();
    try {
      const params = {
        search_term: customerViewState.searchTerm,
        sort_by: customerViewState.sortBy,
        sort_order: customerViewState.sortOrder,
        page: customerViewState.currentPage,
        limit: customerViewState.limit,
      };
      const result = await api.getData("customers", params);
      const newData = parseDates(result.data, "customers");

      if (isLoadMore) {
        localData.customers = [...localData.customers, ...newData];
      } else {
        localData.customers = newData;
      }

      // Update persistent cache only for first page without search
      if (
        customerViewState.currentPage === 1 &&
        !customerViewState.searchTerm
      ) {
        saveToCache("customers", result.data, lastServerVersions["customers"]);
      }

      renderCustomersTable(localData.customers);

      const loadMoreBtn = getEl("customers-load-more");
      if (loadMoreBtn) {
        if (
          result.pagination &&
          result.pagination.current_page < result.pagination.total_pages
        ) {
          loadMoreBtn.classList.remove("hidden");
        } else {
          loadMoreBtn.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      showNotification("خطا در بارگذاری لیست مشتریان.", true);
    } finally {
      hideLoading();
    }
  }

  // [MODIFIED] رندر کردن جدول مشتریان
  function renderCustomersTable(customers) {
    const tableBody = getEl("customers-table");
    if (!tableBody) return;
    if (!customers || customers.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-stone-400">
                    <p class="font-bold text-lg">مشتری‌ای یافت نشد</p>
                    <p class="text-sm">برای شروع، یک مشتری جدید از فرم بالا اضافه کنید.</p>
                </td></tr>`;
      return;
    }

    // Update sort indicators in headers
    document
      .querySelectorAll("#customers-page .sortable-header")
      .forEach((header) => {
        const sortKey = header.dataset.sort;
        header.classList.remove("sorted-asc", "sorted-desc");
        if (sortKey === customerViewState.sortBy) {
          header.classList.add(
            customerViewState.sortOrder === "asc"
              ? "sorted-asc"
              : "sorted-desc",
          );
        }
      });

    // Explicitly sort customers array in JS as well
    const sortedCustomers = [...customers].sort((a, b) => {
      let aVal = a[customerViewState.sortBy];
      let bVal = b[customerViewState.sortBy];

      if (customerViewState.sortBy === "balance") {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
        return customerViewState.sortOrder === "asc"
          ? aVal - bVal
          : bVal - aVal;
      } else if (customerViewState.sortBy === "creditLimit") {
        aVal = (aVal === null || aVal === undefined || aVal === "") ? Infinity : parseFloat(aVal);
        bVal = (bVal === null || bVal === undefined || bVal === "") ? Infinity : parseFloat(bVal);
        return customerViewState.sortOrder === "asc"
          ? aVal - bVal
          : bVal - aVal;
      } else if (customerViewState.sortBy === "subCode") {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
        return customerViewState.sortOrder === "asc"
          ? aVal - bVal
          : bVal - aVal;
      } else {
        aVal = String(aVal || "");
        bVal = String(bVal || "");
        return customerViewState.sortOrder === "asc"
          ? aVal.localeCompare(bVal, "fa")
          : bVal.localeCompare(aVal, "fa");
      }
    });

    tableBody.innerHTML = sortedCustomers
      .map(
        (customer) => {
          const balance = Number(customer.balance || 0);
          const debt = balance < 0 ? Math.abs(balance) : 0;
          const limit = (customer.creditLimit === null || customer.creditLimit === undefined || customer.creditLimit === "") ? null : Number(customer.creditLimit);
          const available = limit === null ? null : (balance + limit);

          const debtText = debt > 0 ? `<span class="text-red-400 font-bold">${formatCurrency(debt)} (بدهکار)</span>` : (balance > 0 ? `<span class="text-green-400">${formatCurrency(balance)} (بستانکار)</span>` : "۰ تومان");
          const limitText = limit === null ? "آزاد" : formatCurrency(limit);
          const availText = available === null ? "آزاد" : formatCurrency(available);

          return `
                <tr class="border-b border-stone-700 hover:bg-stone-800">
                    <td class="px-6 py-4 font-medium text-white">${customer.name}</td>
                    <td class="px-6 py-4">${customer.subCode || "---"}</td>
                    <td class="px-6 py-4 hidden sm:table-cell">${customer.phone || "---"}</td>
                    <td class="px-6 py-4">${debtText}</td>
                    <td class="px-6 py-4 text-stone-300">${limitText}</td>
                    <td class="px-6 py-4 font-bold ${available !== null && available <= 0 ? 'text-red-400' : 'text-green-400'}">${availText}</td>
                    <td class="px-6 py-4 text-center">
                        <div class="flex items-center justify-center gap-x-3">
                            <button onclick="openCustomerHistoryModal('${customer.id}')" title="جزئیات فاکتورهای اعتباری" class="icon-btn text-gray-400 hover:text-gray-300">${ICONS.eye}</button>
                            <button onclick="openAddCreditPaymentModal('${customer.id}')" title="افزایش اعتبار" class="icon-btn text-green-400 hover:text-green-300">${ICONS.plus}</button>
                            ${
                              currentUser.isAdmin
                                ? `
                                <button onclick="openDeductCreditModal('${customer.id}')" title="کاهش اعتبار" class="icon-btn text-yellow-400 hover:text-yellow-300">${ICONS.minus}</button>
                                <button onclick="openEditCustomerModal('${customer.id}')" title="ویرایش" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                                <button onclick="deleteCustomer('${customer.id}')" title="حذف" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                            `
                                : ""
                            }
                        </div>
                    </td>
                </tr>`;
        },
      )
      .join("");
  }

  // [NEW] Handle table sorting for all tables
  function handleTableSort(event) {
    const header = event.target.closest(".sortable-header");
    if (!header) return;

    const sortKey = header.dataset.sort;
    const currentPage = header.closest("#customers-page")
      ? "customers"
      : header.closest("#buffet-page")
        ? "buffet"
        : header.closest("#reports-page")
          ? "reports"
          : header.closest("#orders-page")
            ? "orders"
            : header.closest("#expenses-page")
              ? "expenses"
              : header.closest("#secretary-page")
                ? "secretary"
                : null;

    if (!currentPage) return;

    // Handle different table types
    if (
      currentPage === "customers" ||
      currentPage === "buffet" ||
      currentPage === "reports"
    ) {
      let viewState;
      switch (currentPage) {
        case "customers":
          viewState = customerViewState;
          break;
        case "buffet":
          viewState = buffetViewState;
          break;
        case "reports":
          viewState = reportsViewState;
          break;
      }

      // Toggle sort order if same column, otherwise set to desc (high to low)
      if (viewState.sortBy === sortKey) {
        viewState.sortOrder = viewState.sortOrder === "desc" ? "asc" : "desc";
      } else {
        viewState.sortBy = sortKey;
        viewState.sortOrder = "desc";
      }

      // Refresh the appropriate table
      switch (currentPage) {
        case "customers":
          fetchAndRenderCustomers();
          break;
        case "buffet":
          fetchAndRenderBuffet();
          break;
        case "reports":
          fetchAndRenderReports();
          break;
      }
    } else {
      // Handle local sorting for orders, expenses, and secretary tables
      handleLocalTableSort(header, sortKey, currentPage);
    }
  }

  // [NEW] Handle local table sorting for tables that don't use server-side sorting
  function handleLocalTableSort(header, sortKey, currentPage) {
    const table = header.closest("table");
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    // Determine current sort order
    const currentOrder = header.dataset.currentOrder;
    let newOrder;
    if (!currentOrder || currentOrder === "asc") {
      newOrder = "desc";
    } else {
      newOrder = "asc";
    }

    // Clear previous sort indicators and currentOrder on other headers
    table.querySelectorAll(".sortable-header").forEach((h) => {
      if (h !== header) {
        delete h.dataset.currentOrder;
      }
      h.classList.remove("sorted-asc", "sorted-desc");
    });

    header.dataset.currentOrder = newOrder;

    // Add sort indicator
    header.classList.add(newOrder === "asc" ? "sorted-asc" : "sorted-desc");

    // Get column index
    const columnIndex = Array.from(header.parentNode.children).indexOf(header);

    // Sort rows
    rows.sort((a, b) => {
      const aCell = a.children[columnIndex];
      const bCell = b.children[columnIndex];

      if (!aCell || !bCell) return 0;

      let aValue = aCell.textContent.trim();
      let bValue = bCell.textContent.trim();

      // Handle different data types
      if (sortKey === "amount" || sortKey === "totalAmount") {
        // Remove currency formatting and convert to number, preserving the negative sign
        aValue = parseInt(aValue.replace(/[^-0-9]/g, "")) || 0;
        bValue = parseInt(bValue.replace(/[^-0-9]/g, "")) || 0;
        return newOrder === "asc" ? aValue - bValue : bValue - aValue;
      } else if (sortKey === "invoiceNumber") {
        // Handle invoice numbers (remove # and convert to number)
        aValue = parseInt(aValue.replace("#", "")) || 0;
        bValue = parseInt(bValue.replace("#", "")) || 0;
        return newOrder === "asc" ? aValue - bValue : bValue - aValue;
      } else if (sortKey === "duration") {
        // Handle duration format (HH:MM or Xh Ym)
        const parseTime = (timeStr) => {
          if (timeStr === "---" || !timeStr) return 0;
          if (timeStr.includes("h") || timeStr.includes("m")) {
            const hMatch = timeStr.match(/(\d+)h/);
            const mMatch = timeStr.match(/(\d+)m/);
            const hours = hMatch ? parseInt(hMatch[1]) : 0;
            const minutes = mMatch ? parseInt(mMatch[1]) : 0;
            return hours * 60 + minutes;
          }
          if (timeStr.includes(":")) {
            const [hours, minutes] = timeStr.split(":").map(Number);
            return (hours || 0) * 60 + (minutes || 0);
          }
          return parseInt(timeStr) || 0;
        };
        aValue = parseTime(aValue);
        bValue = parseTime(bValue);
        return newOrder === "asc" ? aValue - bValue : bValue - aValue;
      } else if (/date|time|paidAt|entrance|exit/i.test(sortKey)) {
        // Handle date/time sorting using moment-jalaali
        const parseDate = (dateStr) => {
          if (!dateStr || dateStr === "---") return moment(0);
          // If HH:MM or HH:MM:SS time format
          if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(dateStr)) {
            return moment(
              dateStr,
              dateStr.split(":").length === 3 ? "HH:mm:ss" : "HH:mm",
            );
          }
          // If Shamsi date format (e.g. 1402/07/15)
          if (/^\d{4}\/\d{2}\/\d{2}/.test(dateStr)) {
            return moment(dateStr, "jYYYY/jMM/jDD HH:mm");
          }
          const parsed = moment(dateStr);
          return parsed.isValid() ? parsed : moment(0);
        };
        const aMoment = parseDate(aValue);
        const bMoment = parseDate(bValue);
        return newOrder === "asc" ? aMoment - bMoment : bMoment - aMoment;
      } else if (sortKey === "day") {
        // Handle Persian days of the week sorting chronologically (Saturday to Friday)
        const daysOrder = {
          شنبه: 1,
          یکشنبه: 2,
          دوشنبه: 3,
          "سه شنبه": 4,
          "سه\u200cشنبه": 4,
          چهارشنبه: 5,
          پنجشنبه: 6,
          "پنج شنبه": 6,
          "پنج\u200cشنبه": 6,
          جمعه: 7,
        };
        const getDayVal = (val) => daysOrder[val] || 0;
        aValue = getDayVal(aValue);
        bValue = getDayVal(bValue);
        return newOrder === "asc" ? aValue - bValue : bValue - aValue;
      } else {
        // String comparison
        return newOrder === "asc"
          ? aValue.localeCompare(bValue, "fa")
          : bValue.localeCompare(aValue, "fa");
      }
    });

    // Re-append sorted rows
    rows.forEach((row) => tbody.appendChild(row));
  }

  // [NEW] Add session warning indicators
  function addSessionWarnings(order) {
    const now = TimeService.nowDate();
    const start = new Date(order.startTime);
    const elapsed = (now - start) / (1000 * 60); // minutes

    if (order.scheduledEndTime) {
      const end = new Date(order.scheduledEndTime);
      const remaining = (end - now) / (1000 * 60); // minutes

      if (remaining <= 0) {
        return "session-critical";
      } else if (remaining <= 15) {
        return "session-warning";
      }
    } else if (elapsed > 180) {
      // 3 hours
      return "session-overtime";
    }

    return "";
  }
  async function fetchAndRenderBuffet(isLoadMore = false) {
    // Try cache only if it's the first page and no search term and not load more
    if (
      buffetViewState.currentPage === 1 &&
      !buffetViewState.searchTerm &&
      !isLoadMore
    ) {
      const cached = getFromCache("buffet", lastServerVersions["buffet"]);
      if (cached) {
        localData.buffet = parseDates(cached, "buffet");
        renderBuffetTable(localData.buffet);
        const bLm = getEl("buffet-load-more"); if (bLm) bLm.classList.add("hidden");
        return;
      }
    }

    showLoading();
    try {
      const params = {
        search_term: buffetViewState.searchTerm,
        sort_by: buffetViewState.sortBy,
        sort_order: buffetViewState.sortOrder,
        page: buffetViewState.currentPage,
        limit: buffetViewState.limit,
      };
      const result = await api.getData("buffet", params);
      const newData = parseDates(result.data, "buffet");

      if (isLoadMore) {
        localData.buffet = [...localData.buffet, ...newData];
      } else {
        localData.buffet = newData;
      }

      // Update persistent cache only for first page without search
      if (buffetViewState.currentPage === 1 && !buffetViewState.searchTerm) {
        saveToCache("buffet", result.data, lastServerVersions["buffet"]);
      }

      renderBuffetTable(localData.buffet);

      const loadMoreBtn = getEl("buffet-load-more");
      if (loadMoreBtn) {
        if (
          result.pagination &&
          result.pagination.current_page < result.pagination.total_pages
        ) {
          loadMoreBtn.classList.remove("hidden");
        } else {
          loadMoreBtn.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to fetch buffet items:", error);
      showNotification("خطا در بارگذاری لیست محصولات بوفه.", true);
    } finally {
      hideLoading();
    }
  }

  // [MODIFIED] رندر کردن جدول بوفه
  function renderBuffetTable(items) {
    const tableBody = getEl("buffet-table");
    if (!tableBody) return;
    if (!items || items.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-stone-400">
                    <p class="font-bold text-lg">محصولی یافت نشد</p>
                    <p class="text-sm">برای شروع، یک محصول جدید از فرم بالا اضافه کنید.</p>
                </td></tr>`;
      return;
    }

    // Update sort indicators in headers
    document
      .querySelectorAll("#buffet-page .sortable-header")
      .forEach((header) => {
        const sortKey = header.dataset.sort;
        header.classList.remove("sorted-asc", "sorted-desc");
        if (sortKey === buffetViewState.sortBy) {
          header.classList.add(
            buffetViewState.sortOrder === "asc" ? "sorted-asc" : "sorted-desc",
          );
        }
      });

    // Explicitly sort buffet items in JS as well
    const sortedItems = [...items].sort((a, b) => {
      let aVal = a[buffetViewState.sortBy];
      let bVal = b[buffetViewState.sortBy];

      if (
        buffetViewState.sortBy === "buyPrice" ||
        buffetViewState.sortBy === "sellPrice" ||
        buffetViewState.sortBy === "stock"
      ) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
        return buffetViewState.sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      } else {
        aVal = String(aVal || "");
        bVal = String(bVal || "");
        return buffetViewState.sortOrder === "asc"
          ? aVal.localeCompare(bVal, "fa")
          : bVal.localeCompare(aVal, "fa");
      }
    });

    tableBody.innerHTML = sortedItems
      .map((item) => {
        const unitProfit = item.sellPrice - item.buyPrice;
        const totalProfit = unitProfit * item.stock;
        const profitClass =
          unitProfit > 10000
            ? "profit-high"
            : unitProfit > 5000
              ? "profit-medium"
              : "profit-low";

        return `
                <tr class="border-b border-stone-700 hover:bg-stone-800">
                    <td class="px-6 py-4 font-medium text-white">${item.name}</td>
                    <td class="px-6 py-4 hidden sm:table-cell">${formatCurrency(item.buyPrice)}</td>
                    <td class="px-6 py-4 hidden sm:table-cell">${formatCurrency(item.sellPrice)}</td>
                    <td class="px-6 py-4 ${item.stock < 5 ? "text-red-400 font-bold" : ""}">${item.stock}</td>
                    <td class="px-6 py-4 ${profitClass}">${formatCurrency(unitProfit)}</td>
                    <td class="px-6 py-4 ${profitClass}">${formatCurrency(totalProfit)}</td>
                    <td class="px-6 py-4 text-center">
                         ${
                           currentUser.isAdmin
                             ? `
                            <div class="flex items-center justify-center gap-x-3">
                                <button onclick="openEditBuffetModal('${item.id}')" title="ویرایش" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                                <button onclick="deleteBuffetItem('${item.id}')" title="حذف" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                            </div>
                         `
                             : "---"
                         }
                    </td>
                </tr>
            `;
      })
      .join("");
  }

  // رندر کردن لیست کنسول‌ها
  function renderConsolesList() {
    const list = getEl("consoles-list");
    const sortedConsoles = [...localData.consoles].sort(
      (a, b) => parseInt(a.number) - parseInt(b.number),
    );

    list.innerHTML = sortedConsoles
      .map(
        (consoleItem) => `
                <div class="p-3 bg-stone-800 rounded-lg flex justify-between items-center mb-2">
                    <div>
                        <p class="font-bold text-white">${consoleItem.type} ${consoleItem.number}</p>
                        <p class="text-sm text-stone-400">
                            ${consoleItem.rates.map((r) => `${r.name}: ${formatCurrency(r.price)}`).join(" | ")}
                        </p>
                        ${
                          consoleItem.specialRate &&
                          consoleItem.specialRate.amount > 0
                            ? `
                        <p class="text-xs text-amber-400">
                            ویژه: از ${consoleItem.specialRate.startTime} تا ${consoleItem.specialRate.endTime} +${formatCurrency(consoleItem.specialRate.amount)}
                        </p>
                        `
                            : ""
                        }
                    </div>
                    ${
                      currentUser.isAdmin
                        ? `
                        <div class="flex items-center justify-center gap-x-2">
                            <button onclick="openEditConsoleModal('${consoleItem.id}')" title="ویرایش" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                            <button onclick="deleteConsole('${consoleItem.id}')" title="حذف" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                        </div>
                    `
                        : ""
                    }
                </div>
            `,
      )
      .join("");
  }

  // [NEW] Fetches and renders the expenses table based on view state
  async function fetchAndRenderExpenses(isLoadMore = false) {
    showLoading();
    try {
      const params = {
        search_term: expensesViewState.searchTerm,
        page: expensesViewState.currentPage,
        limit: expensesViewState.limit,
      };
      const result = await api.getData("expenses", params);
      const newData = parseDates(result.data, "expenses");

      if (isLoadMore) {
        localData.expenses = [...localData.expenses, ...newData];
      } else {
        localData.expenses = newData;
      }

      renderExpensesAndChecks();

      const loadMoreBtn = getEl("expenses-load-more");
      if (loadMoreBtn) {
        if (
          result.pagination &&
          result.pagination.current_page < result.pagination.total_pages
        ) {
          loadMoreBtn.classList.remove("hidden");
        } else {
          loadMoreBtn.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
      showNotification("خطا در بارگذاری لیست هزینه‌ها.", true);
    } finally {
      hideLoading();
    }
  }

  // [MODIFIED] رندر کردن تاریخچه هزینه‌ها و چک‌ها
  function renderExpensesAndChecks() {
    const expensesTable = getEl("expenses-list-table");
    const checksTable = getEl("checks-list-table");

    // Update sort indicators in Expenses table headers to default: date desc
    if (expensesTable) {
      const table = expensesTable.closest("table");
      if (table) {
        table.querySelectorAll(".sortable-header").forEach((header) => {
          header.classList.remove("sorted-asc", "sorted-desc");
          delete header.dataset.currentOrder;
          if (header.dataset.sort === "date") {
            header.classList.add("sorted-desc");
            header.dataset.currentOrder = "desc";
          }
        });
      }
    }

    // Update sort indicators in Checks table headers to default: dueDate asc
    if (checksTable) {
      const table = checksTable.closest("table");
      if (table) {
        table.querySelectorAll(".sortable-header").forEach((header) => {
          header.classList.remove("sorted-asc", "sorted-desc");
          delete header.dataset.currentOrder;
          if (header.dataset.sort === "dueDate") {
            header.classList.add("sorted-asc");
            header.dataset.currentOrder = "asc";
          }
        });
      }
    }

    const allExpenses = localData.expenses || [];
    const normalExpenses = allExpenses.filter((e) => e.type === "expense");
    const checks = allExpenses.filter((e) => e.type === "check");

    // Render Normal Expenses
    if (normalExpenses.length === 0) {
      expensesTable.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-stone-400">هیچ هزینه‌ای ثبت نشده است.</td></tr>`;
    } else {
      const getEffDate = (item) => {
        const p = item.paidAt || item.paid_at;
        // Handle MySQL zero dates and empty strings
        if (p && p !== "0000-00-00 00:00:00" && p !== "0000-00-00" && p !== "")
          return p;
        return item.dueDate || item.createdAt;
      };

      // Sort normal expenses by date descending using moment
      const sortedExpenses = [...normalExpenses].sort((a, b) => {
        const dateA = moment(getEffDate(a));
        const dateB = moment(getEffDate(b));
        const valA = dateA.isValid() ? dateA.valueOf() : 0;
        const valB = dateB.isValid() ? dateB.valueOf() : 0;
        return valB - valA;
      });

      expensesTable.innerHTML = sortedExpenses
        .map(
          (expense) => `
                    <tr class="border-b border-stone-700 hover:bg-stone-800">
                        <td class="px-4 py-2">${formatShamsiDate(getEffDate(expense), true)}</td>
                        <td class="px-4 py-2 font-medium text-white">${expense.title}</td>
                        <td class="px-4 py-2">${formatCurrency(expense.amount)}</td>
                        <td class="px-4 py-2">${expense.category || "---"}</td>
                        <td class="px-4 py-2">${expense.paymentMethod || "---"}</td>
                        <td class="px-4 py-2">${expense.description || "---"}</td>
                        <td class="px-4 py-2 text-center">
                            ${
                              currentUser.isAdmin
                                ? `
                                <div class="flex items-center justify-center gap-x-3">
                                    <button onclick="openEditExpenseModal('${expense.id}')" title="ویرایش" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                                    <button onclick="deleteExpense('${expense.id}')" title="حذف" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                                </div>
                            `
                                : "---"
                            }
                        </td>
                    </tr>
                `,
        )
        .join("");
    }

    // Render Checks
    if (checks.length === 0) {
      checksTable.innerHTML = `<tr><td colspan="6" class="text-center p-8 text-stone-400">هیچ چکی ثبت نشده است.</td></tr>`;
    } else {
      // Sort checks by due date ascending using moment
      const sortedChecks = [...checks].sort((a, b) => {
        const dateA = moment(a.dueDate);
        const dateB = moment(b.dueDate);
        const valA = dateA.isValid() ? dateA.valueOf() : 0;
        const valB = dateB.isValid() ? dateB.valueOf() : 0;
        return valA - valB;
      });

      checksTable.innerHTML = sortedChecks
        .map((check) => {
          const isDue = moment(check.dueDate).isBefore(TimeService.nowMoment(), "day");
          const statusText =
            check.status === Constants.ORDER_STATUS_PAID
              ? "پرداخت شده"
              : isDue
                ? "سررسید گذشته"
                : "در انتظار";
          const statusColor =
            check.status === Constants.ORDER_STATUS_PAID
              ? "text-green-400"
              : isDue
                ? "text-red-400"
                : "text-yellow-400";
          return `
                        <tr class="border-b border-stone-700 hover:bg-stone-800">
                            <td class="px-4 py-2">${formatShamsiDate(check.dueDate)}</td>
                            <td class="px-4 py-2 font-medium text-white">${check.title}</td>
                            <td class="px-4 py-2">${formatCurrency(check.amount)}</td>
                            <td class="px-4 py-2 ${statusColor}">${statusText}</td>
                            <td class="px-4 py-2">${check.description || "---"}</td>
                            <td class="px-4 py-2 text-center">
                                ${
                                  currentUser.isAdmin
                                    ? `
                                    <div class="flex items-center justify-center gap-x-3">
                                        <button onclick="openSettleCheckModal('${check.id}')" title="پرداخت" class="btn btn-primary btn-sm !px-3 !py-1">پرداخت</button>
                                        <button onclick="openEditExpenseModal('${check.id}')" title="ویرایش" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                                        <button onclick="deleteExpense('${check.id}')" title="حذف" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                                    </div>
                                `
                                    : `<button onclick="openSettleCheckModal('${check.id}')" title="پرداخت" class="btn btn-primary btn-sm !px-3 !py-1">پرداخت</button>`
                                }
                            </td>
                        </tr>
                    `;
        })
        .join("");
    }
  }

  // رندر کردن جدول کاربران
  function renderUsersTable() {
    const container = getEl("users-table");
    container.innerHTML = `
                <table class="w-full text-sm text-left text-stone-400">
                    <thead class="text-xs text-stone-300 uppercase bg-stone-700">
                        <tr>
                            <th scope="col" class="px-6 py-3">نام کاربری</th>
                            <th scope="col" class="px-6 py-3">نقش</th>
                            <th scope="col" class="px-6 py-3">نرخ ساعتی</th>
                            <th scope="col" class="px-6 py-3 text-center">عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${localData.users
                          .map((user) => {
                            const canManage =
                              currentUser.isAdmin && currentUser.id !== user.id;
                            return `
                                <tr class="border-b border-stone-700 hover:bg-stone-800">
                                    <td class="px-6 py-4 font-medium text-white">${user.username}</td>
                                    <td class="px-6 py-4">${user.isAdmin ? "ادمین" : "منشی"}</td>
                                    <td class="px-6 py-4">${user.hourly_rate && user.hourly_rate > 0 ? formatCurrency(user.hourly_rate) : "---"}</td>
                                    <td class="px-6 py-4 text-center">
                                        ${
                                          canManage
                                            ? `
                                            <div class="flex items-center justify-center gap-x-3">
                                                <button onclick="openEditUserModal('${user.id}')" title="ویرایش نقش" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                                                <button onclick="deleteUser('${user.id}')" title="حذف" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                                            </div>
                                        `
                                            : "---"
                                        }
                                    </td>
                                </tr>
                            `;
                          })
                          .join("")}
                    </tbody>
                </table>
            `;
  }

  // رندر کردن لیست کنسول‌ها در فرم سفارش جدید
  function renderOrderConsoleSelect() {
    const select = getEl("order-console");
    const availableConsoles = localData.consoles.filter(
      (c) =>
        !localData.orders.some(
          (o) => o.consoleId === c.id && o.status === Constants.ORDER_STATUS_ACTIVE,
        ),
    );

    availableConsoles.sort((a, b) => parseInt(a.number) - parseInt(b.number));

    select.innerHTML =
      `<option value="">--- خدمات / بوفه ---</option>` +
      availableConsoles
        .map((c) => `<option value="${c.id}">${c.type} ${c.number}</option>`)
        .join("");
  }

  // رندر کردن کارت‌های سفارشات (فعال و در انتظار پرداخت)
  function renderOrders() {
    const activeContainer = getEl("active-orders-container");
    const pendingContainer = getEl("pending-payment-orders-container");

    const activeOrders = localData.orders
      .filter((o) => o.status === Constants.ORDER_STATUS_ACTIVE)
      .sort((a, b) => {
        const consoleA = localData.consoles.find((c) => c.id === a.consoleId);
        const consoleB = localData.consoles.find((c) => c.id === b.consoleId);

        // مدیریت حالتی که کنسول برای یک سفارش وجود ندارد
        if (consoleA && !consoleB) return -1;
        if (!consoleA && consoleB) return 1;
        if (!consoleA && !consoleB) return 0;

        // مرتب‌سازی بر اساس شماره کنسول
        const numA = parseInt(consoleA.number, 10);
        const numB = parseInt(consoleB.number, 10);

        // مدیریت حالتی که شماره کنسول عدد نیست
        if (isNaN(numA)) return 1;
        if (isNaN(numB)) return -1;

        return numA - numB;
      });
    const pendingOrders = localData.orders.filter(
      (o) => o.status === "pending_payment",
    );

    if (activeOrders.length === 0) {
      activeContainer.innerHTML = `<div class="col-span-full text-center p-8 text-stone-400">
                    <p class="font-bold text-lg">جلسه فعالی وجود ندارد</p>
                    <p class="text-sm">برای شروع یک جلسه جدید، روی دکمه + در بالا کلیک کنید.</p>
                </div>`;
    } else {
      activeContainer.innerHTML = activeOrders
        .map((order) => createOrderCard(order))
        .join("");
    }

    if (pendingOrders.length === 0) {
      pendingContainer.innerHTML = `<div class="col-span-full text-center p-8 text-stone-400">
                    <p class="font-bold text-lg">فاکتوری در انتظار پرداخت نیست</p>
                    <p class="text-sm">وقتی جلسه‌ای به پایان برسد، فاکتور آن در این بخش نمایش داده می‌شود.</p>
                </div>`;
    } else {
      pendingContainer.innerHTML = pendingOrders
        .map((order) => createOrderCard(order))
        .join("");
    }

    // پاک کردن تایمرهای قبلی و راه‌اندازی تایمرهای جدید برای سفارشات فعال
    Object.values(activeOrderTimers).forEach(clearInterval);
    activeOrderTimers = {};

    activeOrders.forEach((order) => {
      updateOrderCardTimer(order.id);
      activeOrderTimers[order.id] = setInterval(
        () => updateOrderCardTimer(order.id),
        1000,
      );
    });

    renderOrderConsoleSelect();
  }

  // ایجاد HTML برای یک کارت سفارش
  function createOrderCard(order) {
    const consoleItem = localData.consoles.find(
      (c) => c.id === order.consoleId,
    );
    const customerName =
      order.customer_name ||
      localData.customers.find((c) => c.id === order.customerId)?.name ||
      "مشتری آزاد";
    const isTimed = !!order.scheduledEndTime;
    const endTimeText = order.scheduledEndTime
      ? formatTime(order.scheduledEndTime)
      : order.endDate
        ? formatTime(order.endDate)
        : "زمان آزاد";
    const rate =
      consoleItem && order.rateId != null
        ? consoleItem.rates[order.rateId]
        : null;
    const warningClass =
      order.status === Constants.ORDER_STATUS_ACTIVE ? addSessionWarnings(order) : "";

    let actionButtonsHTML = "";
    let timerHTML = "";
    let costHTML = "";
    let invoiceNumberHTML = "";

    const totalPaid = (order.payments || []).reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    let paidAmountHTML = "";
    if (totalPaid > 0) {
      paidAmountHTML = `<p class="font-bold text-green-400"><strong>مبلغ پرداخت شده:</strong> <span>${formatCurrency(totalPaid)}</span></p>`;
    }

    if (order.invoiceNumber) {
      invoiceNumberHTML = `<span class="text-xs text-stone-400 font-bold">#${order.invoiceNumber}</span>`;
    }

    if (order.status === Constants.ORDER_STATUS_ACTIVE) {
      timerHTML = `<p id="order-timer-${order.id}" class="text-lg"><strong>مدت گذشته:</strong> 00:00:00</p>`;
      costHTML = `<p id="order-cost-${order.id}" class="font-bold text-amber-400 pt-2 border-t border-stone-800"><strong>مبلغ فعلی:</strong> <span>۰ تومان</span></p>`;

      if (order.timeUp) {
        actionButtonsHTML = `
                        <button class="btn btn-danger btn-sm flex-1" onclick="showConfirmation('آیا از پایان دادن به این جلسه مطمئن هستید؟', () => endSession('${order.id}', true))">پایان</button>
                        <button class="btn btn-primary btn-sm flex-1" onclick="openExtendSessionDetailsModal('${order.id}')">ادامه</button>
                    `;
      } else {
        actionButtonsHTML = `
                        <button class="btn btn-danger btn-sm flex-grow" onclick="showConfirmation('آیا از پایان دادن به این جلسه مطمئن هستید؟', () => endSession('${order.id}'))">پایان</button>
                        <button class="icon-btn text-yellow-400" onclick="openAddBuffetToOrderModal('${order.id}')" title="افزودن بوفه">${ICONS.buffet}</button>
                        <button class="icon-btn text-green-400" onclick="openSettleOrderModal('${order.id}', true)" title="پیش پرداخت">${ICONS.cash}</button>
                        <button class="icon-btn text-blue-400" onclick="openAddServiceModal('${order.id}')" title="افزودن خدمات">${ICONS.plus}</button>
                                ${
                                  hasPermission(PERMISSIONS.DELETE_ORDERS)
                                    ? `
                                <button class="icon-btn text-red-500" onclick="deleteOrder('${order.id}')" title="حذف جلسه">${ICONS.trash}</button>
                                `
                                    : ""
                                }
                    `;
      }
    } else {
      // pending_payment
      const { durationFormatted } = calculateFinalAmount(order, "pending");
      timerHTML = `<p id="order-timer-${order.id}" class="text-lg"><strong>مدت کل:</strong> <span class="font-bold" style="font-family: 'Orbitron', sans-serif;">${durationFormatted}</span></p>`;

      const { totalAmount } = calculateFinalAmount(order, "pending");
      costHTML = `<p id="order-cost-${order.id}" class="font-bold text-amber-400 pt-2 border-t border-stone-800"><strong>مبلغ نهایی:</strong> <span>${formatCurrency(totalAmount)}</span></p>`;

      actionButtonsHTML = `
                    <button class="btn btn-primary btn-sm flex-grow" onclick="openSettleOrderModal('${order.id}')">تسویه</button>
                    <button class="icon-btn text-yellow-400" onclick="openAddBuffetToOrderModal('${order.id}')" title="افزودن بوفه">${ICONS.buffet}</button>
                    <button class="icon-btn text-blue-400" onclick="openAddServiceModal('${order.id}')" title="افزودن خدمات">${ICONS.plus}</button>
                    ${
                      hasPermission(PERMISSIONS.DELETE_ORDERS)
                        ? `
                        <button class="icon-btn text-red-500" onclick="deleteOrder('${order.id}')" title="حذف فاکتور">${ICONS.trash}</button>
                    `
                        : ""
                    }
                `;
    }

    const editIcon = (onClick, title) =>
      order.status !== Constants.ORDER_STATUS_PAID
        ? `<button class="icon-btn !p-1 text-stone-400 hover:text-white" onclick="${onClick}" title="${title}">${ICONS.pencil.replace(/<svg/g, '<svg class="w-3 h-3"')}</button>`
        : "";

    return `
                <div id="order-card-${order.id}" class="card !p-4 flex flex-col space-y-3 ${order.status === Constants.ORDER_STATUS_ACTIVE ? "border-green-500" : "border-amber-500"} ${warningClass}">
                    <div class="flex justify-between items-center">
                    <div class="flex items-center gap-x-2">
                        <h4 class="text-lg font-bold">${consoleItem ? `${consoleItem.type} ${consoleItem.number}` : "فاکتور متفرقه"}</h4>
                        ${editIcon(`openTransferOrderModal('${order.id}')`, "انتقال")}
                    </div>
                        <div class="flex items-center gap-x-2">
                            ${invoiceNumberHTML}
                            <span class="text-xs px-2 py-1 rounded-full ${order.status === Constants.ORDER_STATUS_ACTIVE ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}">
                                ${order.status === Constants.ORDER_STATUS_ACTIVE ? "فعال" : "در انتظار پرداخت"}
                            </span>
                        </div>
                    </div>
                <div class="text-sm text-stone-300 space-y-2">
                    <p><strong>مشتری:</strong> ${customerName}</p>
                    <div class="flex items-center justify-between">
                        <p class="truncate pr-2">${order.description || "بدون توضیحات"}</p>
                        ${editIcon(`openEditDescriptionModal('${order.id}')`, "ویرایش توضیحات")}
                    </div>
                        ${rate ? `<p><strong>تعرفه:</strong> ${rate.name}</p>` : ""}
                    </div>
                <div class="text-sm text-stone-400 border-t border-stone-700 pt-2 space-y-2">
                     <div class="flex items-center justify-between">
                        <span><strong>شروع:</strong> ${formatTime(order.startTime)}</span>
                     </div>
                         <p><strong>پایان:</strong> ${endTimeText} ${editIcon(`openEditOrderModal('${order.id}')`, "ویرایش زمان و محدودیت")}</p>
                         ${timerHTML}

                         <div class="text-xs space-y-1 border-t border-stone-800 pt-2 mt-2">
                             ${(order.buffetItems || [])
                               .map(
                                 (item) => `
                                 <div class="flex justify-between items-center">
                                     <span>- ${item.name} (x${item.quantity}) - ${formatCurrency(item.sellPrice * item.quantity)}</span>
                                     ${order.status !== Constants.ORDER_STATUS_PAID ? `<button class="text-red-500 hover:text-red-400 text-xs px-1" onclick="removeBuffetFromOrder('${order.id}', '${item.id}')">حذف</button>` : ""}
                                 </div>
                             `,
                               )
                               .join("")}
                             ${(order.services || [])
                               .map(
                                 (service, index) => `
                                 <div class="flex justify-between items-center">
                                     <span>- ${service.description} - ${formatCurrency(service.price)}</span>
                                     ${order.status !== Constants.ORDER_STATUS_PAID ? `<button class="text-red-500 hover:text-red-400 text-xs px-1" onclick="removeServiceFromOrder('${order.id}', ${index})">حذف</button>` : ""}
                                 </div>
                             `,
                               )
                               .join("")}
                         </div>
                        ${costHTML}
                        ${paidAmountHTML}
                        <div id="order-full-cost-${order.id}"></div>
                    </div>
                    <div id="order-buttons-${order.id}" class="flex gap-2 !mt-4 flex-wrap items-center">
                        ${actionButtonsHTML}
                    </div>
                </div>
            `;
  }

  window.openRegisterParticipantModal = (tournamentId) => {
    getEl("register-participant-tournament-id").value = tournamentId;
    openModal("register-participant-modal");
  };

  window.viewTournamentBracket = (tournamentId) => {
    if (!localData.tournaments) {
      localData.tournaments = [];
    }
    const tournament = localData.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) {
      showNotification("تورنومنت یافت نشد.", true);
      return;
    }

    if (!tournament.bracket && TimeService.nowDate() > new Date(tournament.regEndDate)) {
      generateBracket(tournament);
    }

    displayBracket(tournament);
  };

  function generateBracket(tournament) {
    let participants = [...tournament.participants];
    participants.sort(() => Math.random() - 0.5); // Shuffle participants

    const bracket = [];
    for (let i = 0; i < participants.length; i += 2) {
      if (participants[i + 1]) {
        bracket.push({
          p1: participants[i],
          p2: participants[i + 1],
          winner: null,
        });
      } else {
        bracket.push({
          p1: participants[i],
          p2: { name: "BYE" },
          winner: participants[i],
        });
      }
    }
    tournament.bracket = { round1: bracket };
  }

  function displayBracket(tournament) {
    const bracketContainer = getEl("bracket-container");
    if (!tournament.bracket) {
      bracketContainer.innerHTML =
        '<p class="text-center">جدول مسابقات هنوز ایجاد نشده است.</p>';
    } else {
      let html = "";
      for (const round in tournament.bracket) {
        html += `<h4 class="text-lg font-bold mb-2">${round}</h4>`;
        html += '<div class="space-y-2">';
        tournament.bracket[round].forEach((match, index) => {
          html += `
                            <div class="flex items-center justify-between p-2 bg-stone-800 rounded-lg">
                                <div>
                                    <p>
                                        ${match.p1.name}
                                        <button class="text-red-500 hover:text-red-400 text-xs px-1" onclick="deleteParticipant('${tournament.id}', '${match.p1.id}')">x</button>
                                        vs
                                        ${match.p2.name}
                                        <button class="text-red-500 hover:text-red-400 text-xs px-1" onclick="deleteParticipant('${tournament.id}', '${match.p2.id}')">x</button>
                                    </p>
                                    <p class="text-xs text-stone-400">Winner: ${match.winner ? match.winner.name : "TBD"}</p>
                                </div>
                                ${
                                  !match.winner
                                    ? `
                                <div class="flex gap-2">
                                    <button class="btn btn-primary btn-sm" onclick="setWinner('${tournament.id}', '${round}', ${index}, 'p1')">${match.p1.name} Wins</button>
                                    <button class="btn btn-primary btn-sm" onclick="setWinner('${tournament.id}', '${round}', ${index}, 'p2')">${match.p2.name} Wins</button>
                                </div>
                                `
                                    : ""
                                }
                            </div>
                        `;
        });
        html += "</div>";
      }
      bracketContainer.innerHTML = html;
    }
    openModal("bracket-modal");
  }

  window.openParticipantsModal = (tournamentId) => {
    const tournament = localData.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;

    getEl("add-participant-tournament-id").value = tournamentId;

    const container = getEl("participants-list");
    if (tournament.participants.length === 0) {
      container.innerHTML =
        '<p class="text-center text-stone-400">هیچ شرکت کننده ای ثبت نام نکرده است.</p>';
    } else {
      container.innerHTML = tournament.participants
        .map(
          (p) => `
                    <div class="p-2 bg-stone-800 rounded flex justify-between items-center text-sm">
                        <span>${p.name} - ${p.phone}</span>
                        <button class="text-red-400" onclick="deleteParticipant('${tournament.id}', '${p.id}')">X</button>
                    </div>
                `,
        )
        .join("");
    }
    openModal("participants-modal");
  };

  function handleAddParticipant(e) {
    e.preventDefault();
    const tournamentId = getEl("add-participant-tournament-id").value;
    const tournamentIndex = localData.tournaments.findIndex(
      (t) => t.id === tournamentId,
    );
    if (tournamentIndex === -1) {
      showNotification("تورنومنت یافت نشد.", true);
      return;
    }

    const newParticipant = {
      id: generateId(),
      name: getEl("new-participant-name").value,
      phone: getEl("new-participant-phone").value,
      description: getEl("new-participant-description").value,
    };

    localData.tournaments[tournamentIndex].participants.push(newParticipant);
    db.setItem("tournaments", localData.tournaments);
    openParticipantsModal(tournamentId); // Re-render the modal
    e.target.reset();
    showNotification("شرکت کننده با موفقیت اضافه شد.");
  }

  window.startTournament = async (tournamentId) => {
    const tournamentIndex = localData.tournaments.findIndex(
      (t) => t.id === tournamentId,
    );
    if (tournamentIndex === -1) return;

    const tournament = localData.tournaments[tournamentIndex];
    if (tournament.participants.length < 2) {
      showNotification(
        "برای شروع تورنومنت حداقل به دو شرکت‌کننده نیاز است.",
        true,
      );
      return;
    }

    generateBracket(tournament); // This now only modifies the object in memory

    try {
      setAllButtonsDisabled(true);
      const response = await api.updateItem(
        "tournaments",
        tournamentId,
        tournament,
      );
      localData.tournaments[tournamentIndex] = {
        ...tournament,
        version: response.version,
      };
      renderTournamentPage();
      showNotification("جدول مسابقات ایجاد شد.");
    } catch (error) {
      console.error("Failed to start tournament:", error);
      showNotification("خطا در شروع تورنومنت.", true);
    } finally {
      setAllButtonsDisabled(false);
    }
  };

  window.deleteTournament = (tournamentId) => {
    showConfirmation("آیا از حذف این تورنومنت مطمئن هستید؟", async () => {
      try {
        setAllButtonsDisabled(true);
        await api.deleteItem("tournaments", tournamentId);
        localData.tournaments = localData.tournaments.filter(
          (t) => t.id !== tournamentId,
        );
        renderTournamentPage();
        showNotification("تورنومنت با موفقیت حذف شد.");
      } catch (error) {
        console.error("Failed to delete tournament:", error);
        showNotification("خطا در حذف تورنومنت.", true);
      } finally {
        setAllButtonsDisabled(false);
      }
    });
  };

  window.deleteParticipant = (tournamentId, participantId) => {
    if (!participantId || participantId === "undefined") return;
    showConfirmation("آیا از حذف این شرکت کننده مطمئن هستید؟", async () => {
      const tournament = localData.tournaments.find(
        (t) => t.id === tournamentId,
      );
      if (!tournament) return;

      tournament.participants = tournament.participants.filter(
        (p) => p.id !== participantId,
      );

      // If a participant is removed, the bracket is no longer valid and should be reset.
      if (tournament.bracket) {
        tournament.bracket = null;
      }

      try {
        setAllButtonsDisabled(true);
        const response = await api.updateItem(
          "tournaments",
          tournamentId,
          tournament,
        );
        const tournamentIndex = localData.tournaments.findIndex(
          (t) => t.id === tournamentId,
        );
        if (tournamentIndex > -1) {
          localData.tournaments[tournamentIndex] = {
            ...tournament,
            version: response.version,
          };
        }
        renderTournamentPage(); // Use the main render function
        showNotification(
          "شرکت کننده با موفقیت حذف شد. جدول مسابقات بازنشانی شد.",
        );
      } catch (error) {
        console.error("Failed to delete participant:", error);
        showNotification("خطا در حذف شرکت کننده.", true);
      } finally {
        setAllButtonsDisabled(false);
      }
    });
  };

  window.setWinner = async (tournamentId, roundName, matchIndex, winnerKey) => {
    const tournament = localData.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;

    const match = tournament.bracket[roundName][matchIndex];
    match.winner = match[winnerKey];

    // Check if all matches in the round are finished to generate the next round
    const allMatchesInRoundFinished = tournament.bracket[roundName].every(
      (m) => m.winner,
    );
    if (allMatchesInRoundFinished) {
      const winners = tournament.bracket[roundName]
        .map((m) => m.winner)
        .filter(Boolean);
      if (winners.length > 1) {
        const nextRoundNum = parseInt(roundName.split("-")[1]) + 1;
        const nextRoundName = `round-${nextRoundNum}`;
        const nextRoundMatchups = [];
        for (let i = 0; i < winners.length; i += 2) {
          const p1 = winners[i];
          const p2 = winners[i + 1]
            ? winners[i + 1]
            : { id: "bye", name: "BYE" };
          nextRoundMatchups.push({
            p1,
            p2,
            winner: p2.id === "bye" ? p1 : null,
          });
        }
        tournament.bracket[nextRoundName] = nextRoundMatchups;
      } else if (winners.length === 1) {
        // We have a final winner
        tournament.winners = [winners[0]]; // simplified for now
      }
    }

    try {
      setAllButtonsDisabled(true);
      const response = await api.updateItem(
        "tournaments",
        tournamentId,
        tournament,
      );
      const tournamentIndex = localData.tournaments.findIndex(
        (t) => t.id === tournamentId,
      );
      if (tournamentIndex > -1) {
        localData.tournaments[tournamentIndex] = {
          ...tournament,
          version: response.version,
        };
      }
      renderActiveTournament(tournament);
    } catch (error) {
      console.error("Failed to set winner:", error);
      showNotification("خطا در ثبت برنده.", true);
    } finally {
      setAllButtonsDisabled(false);
    }
  };

  // بروزرسانی تایمر و هزینه کارت سفارش فعال
  function updateOrderCardTimer(orderId) {
    const order = localData.orders.find((o) => o.id === orderId);
    if (!order || order.status !== Constants.ORDER_STATUS_ACTIVE) {
      if (activeOrderTimers[orderId]) clearInterval(activeOrderTimers[orderId]);
      return;
    }

    const timerEl = getEl(`order-timer-${orderId}`);
    const costElSpan = getEl(`order-cost-${orderId}`)?.querySelector("span");
    const fullCostEl = getEl(`order-full-cost-${orderId}`);

    const now = TimeService.nowDate();
    const start = new Date(order.startTime);
    const elapsedTime = now - start;

    const isTimed = !!order.scheduledEndTime;
    if (isTimed) {
      const scheduledEnd = new Date(order.scheduledEndTime);
      const remaining = scheduledEnd - now;

      if (remaining <= 0) {
        if (!order.timeUp) {
          playSound("A4", "2n");
          const consoleItem = localData.consoles.find(
            (c) => c.id === order.consoleId,
          );
          showBrowserNotification(`زمان تمام شد!`, {
            body: `زمان کنسول ${consoleItem ? consoleItem.type + " " + consoleItem.number : ""} به پایان رسیده است.`,
            icon: "assets/logo.svg",
          });
          order.timeUp = true;
          // [FIX] Replace db.setItem with an async API call to persist the timeUp status
          (async () => {
            try {
              const response = await api.updateItem("orders", order.id, order);
              const orderIndex = localData.orders.findIndex(
                (o) => o.id === order.id,
              );
              if (orderIndex > -1) {
                localData.orders[orderIndex].version = response.version;
              }
              renderOrders();
            } catch (error) {
              if (error.status === 409) {
                const latestOrder = await handleUpdateConflict(
                  "orders",
                  order.id,
                );
                if (latestOrder) {
                  latestOrder.timeUp = true;
                  api
                    .updateItem("orders", latestOrder.id, latestOrder)
                    .catch((e) =>
                      console.error("Final timeUp attempt failed:", e),
                    );
                }
              } else {
                console.error(
                  `Failed to update order ${order.id} for timeUp status:`,
                  error,
                );
              }
            }
          })();
        }
      } else {
        if (timerEl) {
          timerEl.innerHTML = `<strong class="text-stone-400 text-sm">زمان باقی مانده:</strong> <span class="text-red-500 font-bold text-lg" style="font-family: 'Orbitron', sans-serif;">${new Date(remaining).toISOString().substr(11, 8)}</span>`;
        }
      }
    } else {
      if (timerEl)
        timerEl.innerHTML = `<strong class="text-sm">مدت گذشته:</strong> <span class="font-bold" style="font-family: 'Orbitron', sans-serif;">${new Date(elapsedTime).toISOString().substr(11, 8)}</span>`;
    }

    if (costElSpan) {
      const { totalAmount } = calculateFinalAmount(order, "active");
      costElSpan.textContent = formatCurrency(totalAmount);
    }

    if (fullCostEl) {
      const fullAmount = calculateFullAmount(order);
      if (fullAmount) {
        fullCostEl.innerHTML = `<p class="font-bold text-blue-400 pt-2 border-t border-stone-800"><strong>مبلغ کامل:</strong> <span>${formatCurrency(fullAmount)}</span></p>`;
      } else {
        fullCostEl.innerHTML = "";
      }
    }
  }

  // بروزرسانی آمار و گزارشات
  async function updateReports(period, newMoment = null) {
    reportsState.period = period;
    if (newMoment) {
      reportsState.currentMoment = newMoment;
    } else if (period === "daily") {
      reportsState.currentMoment = TimeService.nowMoment();
    }

    const navPrev = getEl("report-nav-prev");
    const navNext = getEl("report-nav-next");
    const periodButtons = document.querySelectorAll(
      "#stats-period-selector button[data-period]",
    );

    periodButtons.forEach((btn) => {
      btn.classList.toggle(
        "active-stat",
        btn.dataset.period === reportsState.period,
      );
    });

    if (navPrev && navNext) {
      if (reportsState.period === "monthly" || reportsState.period === "yearly") {
        navPrev.classList.remove("hidden");
        navNext.classList.remove("hidden");
      } else {
        navPrev.classList.add("hidden");
        navNext.classList.add("hidden");
      }
    }

    const currentMoment = reportsState.currentMoment.clone();
    let startDate, endDate;

    if (reportsState.period === "daily") {
      startDate = currentMoment.startOf("day").format("YYYY-MM-DD HH:mm:ss");
      endDate = currentMoment.endOf("day").format("YYYY-MM-DD HH:mm:ss");
    } else if (reportsState.period === "monthly") {
      // Jalali month start and end
      startDate = currentMoment
        .clone()
        .startOf("jMonth")
        .format("YYYY-MM-DD HH:mm:ss");
      endDate = currentMoment
        .clone()
        .endOf("jMonth")
        .format("YYYY-MM-DD HH:mm:ss");
    } else if (reportsState.period === "yearly") {
      // Jalali year start and end
      startDate = currentMoment
        .clone()
        .startOf("jYear")
        .format("YYYY-MM-DD HH:mm:ss");
      endDate = currentMoment
        .clone()
        .endOf("jYear")
        .format("YYYY-MM-DD HH:mm:ss");
    } else if (reportsState.period === "specific_date") {
      const specificDate = getEl("specific-date-input").value;
      if (specificDate) {
        startDate = moment(specificDate)
          .startOf("day")
          .format("YYYY-MM-DD HH:mm:ss");
        endDate = moment(specificDate)
          .endOf("day")
          .format("YYYY-MM-DD HH:mm:ss");
      } else {
        startDate = TimeService.nowMoment().startOf("day").format("YYYY-MM-DD HH:mm:ss");
        endDate = TimeService.nowMoment().endOf("day").format("YYYY-MM-DD HH:mm:ss");
      }
    }

    const reportDate = currentMoment.format("YYYY-MM-DD");

    try {
      const response = await fetch(
        `${API_BASE}?action=get_reports_summary&period=${reportsState.period}&date=${reportDate}&startDate=${startDate || ""}&endDate=${endDate || ""}`,
      );
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error("Server returned non-JSON response:", text);
        throw new Error("پاسخ نامعتبر از سرور دریافت شد.");
      }
      if (!result.success) throw new Error(result.error);

      const stats = result.data;

      document
        .querySelectorAll(".daily-cash-payment")
        .forEach((el) => (el.textContent = formatCurrency(stats.cashPayment)));
      document
        .querySelectorAll(".daily-card-payment")
        .forEach((el) => (el.textContent = formatCurrency(stats.cardPayment)));
      document
        .querySelectorAll(".daily-card-to-card-payment")
        .forEach(
          (el) => (el.textContent = formatCurrency(stats.cardToCardPayment || 0)),
        );
      document
        .querySelectorAll(".daily-credit-payment")
        .forEach(
          (el) => (el.textContent = formatCurrency(stats.creditPayment)),
        );
      document
        .querySelectorAll(".daily-check-payment")
        .forEach(
          (el) => (el.textContent = formatCurrency(stats.checkPayment || 0)),
        );

      // Update global summary cards even if the reports page is hidden
      const reportsPage = getEl("reports-page");
      const isReportsPageVisible =
        reportsPage && !reportsPage.classList.contains("hidden");

      const setElText = (id, val) => {
        const el = getEl(id);
        if (el) el.textContent = val;
      };

      setElText("total-expenses", formatCurrency(stats.totalExpenses));
      setElText("console-revenue", formatCurrency(stats.consoleRevenue));
      setElText("buffet-revenue", formatCurrency(stats.buffetRevenue));
      setElText("services-revenue", formatCurrency(stats.servicesRevenue));
      setElText("total-discounts", formatCurrency(stats.totalDiscount));
      setElText("net-profit", formatCurrency(stats.netProfit));

      // Chart only updates if the page is visible or during initialization
      if ((isReportsPageVisible || !incomeChartInstance) && getEl("incomeChart")) {
        updateIncomeChart(period, stats.points);
      }
    } catch (error) {
      console.error("Failed to fetch reports summary:", error);
      showNotification("خطا در دریافت خلاصه گزارشات.", true);
    }
  }
  // بروزرسانی نمودار درآمد
  function updateIncomeChart(period, points) {
    const chartCanvas = getEl("incomeChart");
    if (!chartCanvas) return;

    if (incomeChartInstance) {
      incomeChartInstance.destroy();
    }

    let labels = [];
    let incomeData = [];
    let expenseData = [];

    const chartTitleEl = getEl("chart-title");
    const currentMoment = reportsState.currentMoment;

    if (period === "daily" || period === "specific_date") {
      if (period === "specific_date") {
        const specificDateShamsi = moment(
          getEl("specific-date-input").value,
        ).format("jYYYY/jMM/jDD");
        if (chartTitleEl) chartTitleEl.textContent = `نمودار درآمد و هزینه برای ${specificDateShamsi}`;
      } else {
        if (chartTitleEl) chartTitleEl.textContent = `نمودار درآمد و هزینه امروز (${currentMoment.format("jYYYY/jMM/jDD")})`;
      }

      labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      incomeData = Array(24).fill(0);
      expenseData = Array(24).fill(0);

      const targetDate = currentMoment.format("YYYY-MM-DD");
      points.income.forEach((p) => {
        // Ensure we parse as local time by removing 'Z' or treating space-separated strings correctly
        const m = moment(p.t.includes("T") ? p.t : p.t.split(".")[0]);
        if (m.isValid() && m.format("YYYY-MM-DD") === targetDate) {
          incomeData[m.hour()] += p.a;
        }
      });
      points.expense.forEach((p) => {
        const m = moment(p.t.includes("T") ? p.t : p.t.split(".")[0]);
        if (m.isValid() && m.format("YYYY-MM-DD") === targetDate) {
          expenseData[m.hour()] += p.a;
        }
      });
    } else if (period === "monthly") {
      if (chartTitleEl) chartTitleEl.textContent = `نمودار درآمد و هزینه ماه ${currentMoment.format("jMMMM jYYYY")}`;
      const jYear = currentMoment.jYear();
      const jMonth = currentMoment.jMonth();
      const daysInMonth = moment.jDaysInMonth(jYear, jMonth);

      labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      incomeData = Array(daysInMonth).fill(0);
      expenseData = Array(daysInMonth).fill(0);

      points.income.forEach((p) => {
        const m = moment(p.t);
        if (m.isValid() && m.jYear() === jYear && m.jMonth() === jMonth) {
          incomeData[m.jDate() - 1] += p.a;
        }
      });
      points.expense.forEach((p) => {
        const m = moment(p.t);
        if (m.isValid() && m.jYear() === jYear && m.jMonth() === jMonth) {
          expenseData[m.jDate() - 1] += p.a;
        }
      });
    } else {
      // yearly
      if (chartTitleEl) chartTitleEl.textContent = `نمودار درآمد و هزینه سال ${currentMoment.format("jYYYY")}`;
      const jYear = currentMoment.jYear();
      labels = JALAALI_MONTHS;
      incomeData = Array(12).fill(0);
      expenseData = Array(12).fill(0);

      points.income.forEach((p) => {
        const m = moment(p.t);
        if (m.isValid() && m.jYear() === jYear) {
          incomeData[m.jMonth()] += p.a;
        }
      });
      points.expense.forEach((p) => {
        const m = moment(p.t);
        if (m.isValid() && m.jYear() === jYear) {
          expenseData[m.jMonth()] += p.a;
        }
      });
    }
    // --- پایان تغییر ---

    const ctx = getEl("incomeChart").getContext("2d");
    incomeChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "درآمد",
            data: incomeData,
            borderColor: "#4ade80",
            backgroundColor: "rgba(74, 222, 128, 0.2)",
            fill: true,
            tension: 0.3,
          },
          {
            label: "هزینه",
            data: expenseData,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        animation: {
          duration: 500,
          easing: "easeInOutQuad",
          delay: (context) => {
            let delay = 0;
            if (context.type === "data" && context.mode === "default") {
              delay = context.dataIndex * 50 + context.datasetIndex * 100;
            }
            return delay;
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: "#f0f0f0" },
            grid: { color: "#4a4a4a" },
          },
          x: { ticks: { color: "#f0f0f0" }, grid: { color: "#4a4a4a" } },
        },
        plugins: {
          legend: {
            position: "top",
            align: "start",
            rtl: true,
            labels: {
              color: "#e7e5e4",
              usePointStyle: true,
              boxWidth: 8,
              padding: 20,
              font: {
                family: "'Vazirmatn', sans-serif",
              },
            },
          },
        },
      },
    });
  }

  // [NEW] Fetches and renders the main orders history table in the reports page
  async function fetchAndRenderReports(isLoadMore = false) {
    // No loading indicator here to allow stats to load independently
    try {
      const params = {
        search_term: reportsViewState.searchTerm,
        payment_method: reportsViewState.paymentMethod,
        sort_by: reportsViewState.sortBy,
        sort_order: reportsViewState.sortOrder,
        date_from: reportsViewState.dateFrom,
        date_to: reportsViewState.dateTo,
        status: Constants.ORDER_STATUS_PAID, // We only want paid orders in reports
        page: reportsViewState.currentPage,
        limit: reportsViewState.limit,
      };
      const result = await api.getData("orders", params);
      const newData = parseDates(result.data, "orders");

      if (isLoadMore) {
        if (!reportsViewState.loadedData) reportsViewState.loadedData = [];
        reportsViewState.loadedData = [
          ...reportsViewState.loadedData,
          ...newData,
        ];
      } else {
        reportsViewState.loadedData = newData;
      }

      renderOrdersHistoryTable(reportsViewState.loadedData);

      const loadMoreBtn = getEl("reports-load-more");
      if (loadMoreBtn) {
        if (
          result.pagination &&
          result.pagination.current_page < result.pagination.total_pages
        ) {
          loadMoreBtn.classList.remove("hidden");
        } else {
          loadMoreBtn.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      showNotification("خطا در بارگذاری تاریخچه سفارشات.", true);
    }
  }

  // [MODIFIED] رندر کردن جدول تاریخچه کامل سفارشات در صفحه گزارشات
  function renderOrdersHistoryTable(orders) {
    const tableBody = getEl("orders-history-table");
    if (!tableBody) return;

    // Update sort indicators in headers
    document
      .querySelectorAll("#reports-table .sortable-header")
      .forEach((header) => {
        const sortKey = header.dataset.sort;
        header.classList.remove("sorted-asc", "sorted-desc");
        if (sortKey === reportsViewState.sortBy) {
          header.classList.add(
            reportsViewState.sortOrder === "asc" ? "sorted-asc" : "sorted-desc",
          );
        }
      });

    let filteredOrders = orders || [];
    if (reportsViewState.paymentMethod) {
      filteredOrders = filteredOrders.filter((o) =>
        (o.payments || []).some(
          (p) => p.method === reportsViewState.paymentMethod,
        ),
      );
    }

    if (!filteredOrders || filteredOrders.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="10" class="text-center p-8 text-stone-400">
                    <p class="font-bold text-lg">سفارشی یافت نشد</p>
                    <p class="text-sm">با توجه به فیلترهای انتخابی، سفارشی برای نمایش وجود ندارد.</p>
                </td></tr>`;
      return;
    }

    // Explicitly sort orders in JS as well based on reportsViewState
    const sortedOrders = [...filteredOrders].sort((a, b) => {
      let aVal = a[reportsViewState.sortBy];
      let bVal = b[reportsViewState.sortBy];

      if (
        reportsViewState.sortBy === "invoiceNumber" ||
        reportsViewState.sortBy === "totalAmount"
      ) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
        return reportsViewState.sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      } else if (reportsViewState.sortBy === "settlementTime") {
        const dateA = aVal ? moment(aVal) : moment(0);
        const dateB = bVal ? moment(bVal) : moment(0);
        const valA = dateA.isValid() ? dateA.valueOf() : 0;
        const valB = dateB.isValid() ? dateB.valueOf() : 0;
        return reportsViewState.sortOrder === "asc" ? valA - valB : valB - valA;
      } else {
        aVal = String(aVal || "");
        bVal = String(bVal || "");
        return reportsViewState.sortOrder === "asc"
          ? aVal.localeCompare(bVal, "fa")
          : bVal.localeCompare(aVal, "fa");
      }
    });

    tableBody.innerHTML = sortedOrders
      .map((order) => {
        const consoleItem = localData.consoles.find(
          (c) => c.id === order.consoleId,
        );
        const customerName =
          order.customer_name ||
          localData.customers.find((c) => c.id === order.customerId)?.name ||
          "مشتری آزاد";
        const rate =
          consoleItem && order.rateId != null && consoleItem.rates[order.rateId]
            ? consoleItem.rates[order.rateId]
            : null;

        const start = moment(order.startTime);
        const end = moment(order.endDate);
        let durationFormatted = "---";
        if (start.isValid() && end.isValid() && end.isAfter(start)) {
          const duration = moment.duration(end.diff(start));
          const hours = Math.floor(duration.asHours());
          const minutes = duration.minutes().toString().padStart(2, "0");
          durationFormatted = `${hours}:${minutes}`;
        }

        return `
                    <tr class="border-b border-stone-700 hover:bg-stone-800 text-xs">
                        <td class="px-4 py-2 whitespace-nowrap font-bold">${order.invoiceNumber || "-"}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${customerName}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${consoleItem ? `${consoleItem.type} ${consoleItem.number}` : "متفرقه"}</td>
                        <td class="px-4 py-2 whitespace-nowrap" style="direction: ltr;">${formatShamsiDate(order.startTime, true)}</td>
                        <td class="px-4 py-2 whitespace-nowrap" style="direction: ltr;">${formatShamsiDate(order.endDate, true)}</td>
                        <td class="px-4 py-2 whitespace-nowrap" style="direction: ltr;">${formatShamsiDate(order.settlementTime, true)}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${durationFormatted}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${rate ? rate.name : "---"}</td>
                        <td class="px-4 py-2 whitespace-nowrap font-bold text-white">${formatCurrency(order.totalAmount)}</td>
                        <td class="px-4 py-2 text-center">
                            <div class="flex items-center justify-center gap-x-3">
                                <button onclick="openOrderDetailsModal('${order.id}')" title="مشاهده جزئیات" class="icon-btn text-gray-400 hover:text-gray-300">${ICONS.eye}</button>
                                ${currentUser?.isAdmin ? `<button onclick="openEditPaidOrderModal('${order.id}')" title="ویرایش مجدد" class="icon-btn text-yellow-400 hover:text-yellow-300">${ICONS.pencil}</button>` : ""}
                                ${hasPermission(PERMISSIONS.DELETE_ORDERS) ? `<button onclick="deleteOrder('${order.id}')" title="حذف" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>` : ""}
                            </div>
                        </td>
                    </tr>
                `;
      })
      .join("");
  }

  // [NEW] Fetches and renders the daily orders history table
  async function fetchAndRenderDailyOrders(isLoadMore = false) {
    try {
      const params = {
        status: Constants.ORDER_STATUS_PAID,
        date_from: TimeService.nowMoment().format("YYYY-MM-DD"),
        date_to: TimeService.nowMoment().format("YYYY-MM-DD"),
        sort_by: "settlementTime",
        sort_order: "DESC",
        page: dailyOrdersViewState.currentPage,
        limit: dailyOrdersViewState.limit,
      };
      const result = await api.getData("orders", params);
      const newData = parseDates(result.data, "orders");

      if (isLoadMore) {
        if (!dailyOrdersViewState.loadedData)
          dailyOrdersViewState.loadedData = [];
        dailyOrdersViewState.loadedData = [
          ...dailyOrdersViewState.loadedData,
          ...newData,
        ];
      } else {
        dailyOrdersViewState.loadedData = newData;
      }

      renderDailyOrdersHistoryTable(dailyOrdersViewState.loadedData);

      const loadMoreBtn = getEl("daily-orders-load-more");
      if (loadMoreBtn) {
        if (
          result.pagination &&
          result.pagination.current_page < result.pagination.total_pages
        ) {
          loadMoreBtn.classList.remove("hidden");
        } else {
          loadMoreBtn.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to fetch daily orders:", error);
    }
  }

  // [MODIFIED] رندر کردن جدول تاریخچه سفارشات امروز در صفحه سفارشات
  function renderDailyOrdersHistoryTable(orders) {
    const tableBody = getEl("daily-orders-history-table");
    if (!tableBody) return;

    // Update sort indicators in headers to default: settlementTime desc
    const table = tableBody.closest("table");
    if (table) {
      table.querySelectorAll(".sortable-header").forEach((header) => {
        const sortKey = header.dataset.sort;
        header.classList.remove("sorted-asc", "sorted-desc");
        delete header.dataset.currentOrder;
        if (sortKey === "settlementTime") {
          header.classList.add("sorted-desc");
          header.dataset.currentOrder = "desc";
        }
      });
    }

    if (!orders || orders.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="10" class="text-center p-8 text-stone-400">
                    <p class="font-bold text-lg">امروز سفارشی ثبت نشده است</p>
                    <p class="text-sm">تاریخچه سفارشات تسویه شده در اینجا نمایش داده می‌شود.</p>
                </td></tr>`;
      return;
    }

    // Explicitly sort Today's Orders History by settlementTime descending by default
    const sortedOrders = [...orders].sort((a, b) => {
      const dateA = a.settlementTime ? moment(a.settlementTime) : moment(0);
      const dateB = b.settlementTime ? moment(b.settlementTime) : moment(0);
      const valA = dateA.isValid() ? dateA.valueOf() : 0;
      const valB = dateB.isValid() ? dateB.valueOf() : 0;
      return valB - valA;
    });

    tableBody.innerHTML = sortedOrders
      .map((order) => {
        const consoleItem = localData.consoles.find(
          (c) => c.id === order.consoleId,
        );
        const customerName =
          order.customer_name ||
          localData.customers.find((c) => c.id === order.customerId)?.name ||
          "مشتری آزاد";

        const rate =
          consoleItem && order.rateId != null && consoleItem.rates[order.rateId]
            ? consoleItem.rates[order.rateId]
            : null;

        const { durationFormatted } = calculateFinalAmount(order, "history");

        return `
                    <tr class="border-b border-stone-700 hover:bg-stone-800 text-xs">
                        <td class="px-4 py-2 whitespace-nowrap font-bold">${order.invoiceNumber || "-"}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${customerName}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${consoleItem ? `${consoleItem.type} ${consoleItem.number}` : "متفرقه"}</td>
                        <td class="px-4 py-2 whitespace-nowrap" style="direction: ltr;">${formatShamsiDate(order.startTime, true)}</td>
                        <td class="px-4 py-2 whitespace-nowrap" style="direction: ltr;">${formatShamsiDate(order.endDate, true)}</td>
                        <td class="px-4 py-2 whitespace-nowrap" style="direction: ltr;">${formatShamsiDate(order.settlementTime, true)}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${durationFormatted}</td>
                        <td class="px-4 py-2 whitespace-nowrap">${rate ? rate.name : "---"}</td>
                        <td class="px-4 py-2 whitespace-nowrap font-bold text-white">${formatCurrency(order.totalAmount)}</td>
                        <td class="px-4 py-2 text-center">
                            <div class="flex items-center justify-center gap-x-3">
                                <button onclick="openOrderDetailsModal('${order.id}')" title="مشاهده جزئیات" class="icon-btn text-gray-400 hover:text-gray-300">${ICONS.eye}</button>
                                ${currentUser?.isAdmin ? `<button onclick="reopenOrder('${order.id}')" title="ویرایش مجدد" class="icon-btn text-yellow-400 hover:text-yellow-300">${ICONS.pencil}</button>` : ""}
                            </div>
                        </td>
                    </tr>
                `;
      })
      .join("");
  }

  // رندر کردن لیست خدمات پیش‌فرض
  function renderDefaultServicesList() {
    const list = getEl("default-services-list");
    if (!list || !localData.defaultServices) return;
    list.innerHTML = localData.defaultServices
      .map(
        (service) => `
                <div class="p-3 bg-stone-800 rounded-lg flex justify-between items-center mb-2">
                    <div>
                        <p class="font-bold text-white">${service.description}</p>
                        <p class="text-sm text-stone-400">${formatCurrency(service.price)}</p>
                    </div>
                    ${
                      hasPermission(PERMISSIONS.VIEW_SETTINGS)
                        ? `
                        <div class="flex gap-2">
                            <button class="icon-btn text-blue-400 hover:text-blue-300" onclick="openEditDefaultServiceModal('${service.id}')" title="ویرایش">${ICONS.pencil}</button>
                            <button class="icon-btn text-red-400 hover:text-red-300" onclick="deleteDefaultService('${service.id}')" title="حذف">${ICONS.trash}</button>
                        </div>
                    `
                        : ""
                    }
                </div>
            `,
      )
      .join("");
  }

  // مدیریت افزودن خدمات پیش‌فرض جدید
  async function handleNewDefaultService(e) {
    e.preventDefault();
    const description = getEl("default-service-description").value;
    const price = getNumericValue("default-service-price");

    if (!description || price <= 0) {
      showNotification("لطفا شرح و قیمت معتبری وارد کنید.", true);
      return;
    }

    // server requires an `id` field on created items; generate on client
    const newService = {
      id: generateId(),
      description,
      price,
    };
    showLoading();
    try {
      await api.createItem("default_services", newService);
      e.target.reset();
      showNotification("خدمات پیش‌فرض جدید اضافه شد.");
      await fetchAndRenderPage("settings", true);
    } catch (error) {
      console.error("Failed to create default service:", error);
      showNotification("خطا در افزودن خدمات.", true);
      await fetchAndRenderPage("settings", true);
    } finally {
      hideLoading();
    }
  }

  // مدیریت حذف خدمات پیش‌فرض
  window.deleteDefaultService = (id) => {
    if (!hasPermission(PERMISSIONS.VIEW_SETTINGS)) return;
    showConfirmation("آیا از حذف این خدمات پیش‌فرض مطمئن هستید؟", async () => {
      showLoading();
      try {
        await api.deleteItem("default_services", id);
        showNotification("خدمات پیش‌فرض حذف شد.");
        await fetchAndRenderPage("settings", true);
      } catch (error) {
        console.error("Failed to delete default service:", error);
        showNotification("خطا در حذف خدمات.", true);
        await fetchAndRenderPage("settings", true);
      } finally {
        hideLoading();
      }
    });
  };

  // رندر کردن تقویم شمسی
  function renderShamsiCalendar() {
    const { currentMoment } = shamsiPickerState;
    const grid = getEl("shamsi-datepicker-grid");

    getEl("shamsi-month-year").textContent =
      currentMoment.format("jMMMM jYYYY");

    grid.innerHTML = "";

    // افزودن روزهای هفته
    ["ش", "ی", "د", "س", "چ", "پ", "ج"].forEach((day) => {
      grid.innerHTML += `<div class="shamsi-datepicker-cell shamsi-datepicker-weekday">${day}</div>`;
    });

    const firstDayOfMonth = currentMoment.clone().startOf("jMonth");
    const jalaaliStartDayOfWeek = (firstDayOfMonth.day() + 1) % 7;

    // افزودن خانه‌های خالی برای شروع ماه
    for (let i = 0; i < jalaaliStartDayOfWeek; i++) {
      grid.innerHTML += `<div class="shamsi-datepicker-cell"></div>`;
    }

    // --- شروع تغییر ---
    const jYear = currentMoment.jYear();
    const jMonth = currentMoment.jMonth();
    const daysInMonth = moment.jDaysInMonth(jYear, jMonth);
    // --- پایان تغییر ---

    // افزودن روزهای ماه
    for (let i = 1; i <= daysInMonth; i++) {
      const dayMoment = currentMoment.clone().jDate(i);
      const cell = document.createElement("div");
      cell.className = "shamsi-datepicker-cell shamsi-datepicker-day";
      cell.textContent = i;
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.dataset.date = dayMoment.format("YYYY-MM-DD"); // تاریخ میلادی برای ذخیره
      cell.dataset.shamsi = dayMoment.format("jYYYY/jMM/jDD"); // تاریخ شمسی برای نمایش
      if (dayMoment.isSame(TimeService.nowMoment(), "day")) {
        cell.classList.add("today");
      }
      grid.appendChild(cell);
    }
  }

  // باز کردن تقویم شمسی
  function openShamsiDatePicker(
    targetInputId,
    displayInputId,
    withTime = false,
    onSelectCallback = null,
  ) {
    shamsiPickerState.targetInput = getEl(targetInputId);
    shamsiPickerState.displayInput = getEl(displayInputId);
    shamsiPickerState.withTime = withTime;
    shamsiPickerState.onSelectCallback = onSelectCallback;
    shamsiPickerState.currentMoment = TimeService.nowMoment();
    renderShamsiCalendar();
    openModal("shamsi-datepicker-modal");
  }

  // مدیریت انتخاب تاریخ از تقوim
  function handleDateSelection(e) {
    if (
      e.type === "click" ||
      (e.type === "keydown" && (e.key === "Enter" || e.key === " "))
    ) {
      if (e.target.classList.contains("shamsi-datepicker-day")) {
        e.preventDefault(); // Prevent space from scrolling
        const selectedGregorian = e.target.dataset.date;
        let selectedShamsi = e.target.dataset.shamsi;

        if (shamsiPickerState.withTime) {
          const time = prompt("لطفا زمان را وارد کنید (HH:mm)", "12:00");
          if (time) {
            selectedShamsi += ` ${time}`;
            const finalMoment = moment(selectedShamsi, "jYYYY/jMM/jDD HH:mm");
            shamsiPickerState.targetInput.value =
              finalMoment.format("YYYY-MM-DD HH:mm");
            shamsiPickerState.displayInput.value = finalMoment.format(
              "jYYYY/jMM/jDD HH:mm",
            );
          }
        } else {
          if (shamsiPickerState.displayInput) {
            shamsiPickerState.displayInput.value = selectedShamsi;
          }
          if (shamsiPickerState.targetInput) {
            shamsiPickerState.targetInput.value = selectedGregorian;
          }
        }

        // اگر انتخاب تاریخ برای گزارش‌گیری بوده، گزارش را آپدیت کن
        if (shamsiPickerState.onSelectCallback) {
          shamsiPickerState.onSelectCallback(selectedGregorian);
        }

        closeModal("shamsi-datepicker-modal");
      }
    }
  }

  // --- Other Handlers ---
  // مدیریت خروج از حساب کاربری
  function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem("currentUser");
    if (dataSyncInterval) clearInterval(dataSyncInterval);
    const inPagesDir = window.location.pathname.includes('/pages/');
    window.location.href = inPagesDir ? 'login.html' : 'pages/login.html';
  }

  // Event listeners
  document.addEventListener("click", (e) => {
    // Handle table sorting
    if (e.target.closest(".sortable-header")) {
      handleTableSort(e);
    }
  });

  // [ENHANCED] Secretary work management with automatic salary calculation
  function renderSecretarySummary() {
    const container = getEl("secretary-summary-container");
    if (!localData.secretary_log || localData.secretary_log.length === 0) {
      container.innerHTML =
        '<p class="text-stone-400">هیچ کارکردی ثبت نشده است.</p>';
      return;
    }

    // Group by user and month
    const groupedData = {};
    localData.secretary_log.forEach((log) => {
      const user = localData.users.find((u) => u.id === log.userId);
      if (!user) return;

      const logDate = moment(log.date);
      const monthKey = logDate.format("jYYYY-jMM");
      const userKey = `${log.userId}-${monthKey}`;

      if (!groupedData[userKey]) {
        groupedData[userKey] = {
          userId: log.userId,
          userName: user.username,
          hourlyRate: user.hourly_rate || 0,
          month: logDate.format("jMMMM jYYYY"),
          totalHours: 0,
          totalAmount: 0,
          workDays: 0,
          logs: [],
        };
      }

      const clockIn = moment(`${log.date} ${log.clockIn}`);
      const clockOut = moment(`${log.date} ${log.clockOut}`);
      const duration = moment.duration(clockOut.diff(clockIn));
      const hours = duration.asHours();

      groupedData[userKey].totalHours += hours;
      groupedData[userKey].totalAmount += hours * (user.hourly_rate || 0);
      groupedData[userKey].workDays += 1;
      groupedData[userKey].logs.push(log);
    });

    const summaryHTML = Object.values(groupedData)
      .map(
        (summary) => `
                <div class="card p-4">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-bold text-white">${summary.userName} - ${summary.month}</h4>
                        <button onclick="viewSecretaryDetails('${summary.userId}', '${summary.month}')" class="btn btn-secondary btn-sm">جزئیات</button>
                    </div>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p class="text-stone-400">تعداد روزهای کار:</p>
                            <p class="font-bold">${summary.workDays} روز</p>
                        </div>
                        <div>
                            <p class="text-stone-400">مجموع ساعات:</p>
                            <p class="font-bold">${summary.totalHours.toFixed(1)} ساعت</p>
                        </div>
                        <div>
                            <p class="text-stone-400">نرخ ساعتی:</p>
                            <p class="font-bold">${formatCurrency(summary.hourlyRate)}</p>
                        </div>
                        <div>
                            <p class="text-stone-400">حقوق قابل پرداخت:</p>
                            <p class="font-bold text-green-400">${formatCurrency(summary.totalAmount)}</p>
                        </div>
                    </div>
                    ${
                      hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS)
                        ? `
                        <div class="flex gap-2 mt-4">
                            <button onclick="settleSecretary('${summary.userId}', '${summary.month}', ${summary.totalAmount})" class="btn btn-primary btn-sm flex-1">تسویه حساب</button>
                        </div>
                    `
                        : ""
                    }
                </div>
            `,
      )
      .join("");

    container.innerHTML =
      summaryHTML || '<p class="text-stone-400">هیچ کارکردی ثبت نشده است.</p>';
  }
  async function handleCreditOperation(
    customerId,
    amount,
    method,
    operation = "charge",
  ) {
    const apiAction =
      operation === "charge" ? "charge_credit" : "deduct_credit";

    try {
      setAllButtonsDisabled(true);
      const response = await fetch(`${API_BASE}?action=${apiAction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          amount: parseFloat(amount),
          method,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Update local customer data
      const customerIndex = localData.customers.findIndex(
        (c) => c.id === customerId,
      );
      if (customerIndex > -1) {
        localData.customers[customerIndex].balance = result.data.newBalance;
      }

      showNotification(
        `عملیات ${operation === "charge" ? "شارژ" : "کسر"} اعتبار با موفقیت انجام شد.`,
      );

      // Refresh customer table if visible
      const customersPage = getEl("customers-page");
      if (customersPage && !customersPage.classList.contains("hidden")) {
        fetchAndRenderCustomers();
      }

      return result.data;
    } catch (error) {
      console.error(`Credit ${operation} failed:`, error);
      showNotification(
        `خطا در ${operation === "charge" ? "شارژ" : "کسر"} اعتبار: ${error.message}`,
        true,
      );
      throw error;
    } finally {
      setAllButtonsDisabled(false);
    }
  }

  // Fetching data and rendering a page's content.
  // It can be called on initial navigation or after a write operation to refresh data.
  function updateAttendanceUI() {
    if (!currentUser) return;
    const logs = localData.secretary_log || [];
    const openSession = logs.find(
      (log) =>
        log.user_id === currentUser.id &&
        (log.clock_out === "00:00:00" || !log.clock_out),
    );

    const clockInBtn = getEl("attendance-clock-in-btn");
    const clockOutBtn = getEl("attendance-clock-out-btn");
    const statusText = getEl("attendance-status-text");

    if (openSession) {
      if (clockInBtn) clockInBtn.disabled = true;
      if (clockOutBtn) clockOutBtn.disabled = false;
      if (statusText) {
        statusText.innerHTML = `وارد شده در: <span class="text-amber-400 font-bold">${openSession.clock_in}</span>`;
        statusText.classList.remove("text-stone-300");
        statusText.classList.add("text-green-400");
      }
    } else {
      if (clockInBtn) clockInBtn.disabled = false;
      if (clockOutBtn) clockOutBtn.disabled = true;
      if (statusText) {
        statusText.textContent = "در انتظار ثبت ورود...";
        statusText.classList.remove("text-green-400");
        statusText.classList.add("text-stone-300");
      }
    }
  }

  async function handleClockIn() {
    showLoading();
    try {
      const response = await fetch(`${API_BASE}?action=clock_in`, {
        method: "POST",
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      showNotification(result.message);

      // Clear secretary log cache and fetch updated data
      localData.secretary_log = [];
      await fetchAndRenderPage("secretary", true);
    } catch (error) {
      showNotification(error.message, true);
    } finally {
      hideLoading();
    }
  }

  async function handleClockOut() {
    showConfirmation("آیا از ثبت خروج مطمئن هستید؟", async () => {
      showLoading();
      try {
        const response = await fetch(`${API_BASE}?action=clock_out`, {
          method: "POST",
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        showNotification(result.message);

        // Clear secretary log cache and fetch updated data
        localData.secretary_log = [];
        // Force a refetch to ensure the UI reflects the closed sessions
        await fetchAndRenderPage("secretary", true);
      } catch (error) {
        console.error("Clock out failed:", error);
        showNotification(error.message, true);
      } finally {
        hideLoading();
      }
    });
  }

  async function fetchAndRenderPage(
    pageId,
    forceRefetch = false,
    silent = false,
  ) {
    const pageDataRequirements = {
      customers: [], // Data is now fetched by fetchAndRenderCustomers
      buffet: [], // Data is now fetched by fetchAndRenderBuffet
      expenses: ["expenses"],
      orders: ["orders", "customers", "buffet", "consoles", "defaultServices"],
      reports: ["expenses", "customers", "buffet", "consoles"], // Removed 'orders' to optimize
      tournaments: ["tournaments"],
      secretary: ["secretary_log", "users"],
      settings: ["consoles", "users", "defaultServices"],
    };

    const requiredKeys = pageDataRequirements[pageId] || [];
    // If forceRefetch is true, we load all keys for that page. Otherwise, try cache first.
    let keysToLoad = forceRefetch ? requiredKeys : [];

    if (!forceRefetch) {
      requiredKeys.forEach((key) => {
        const apiType = key === "defaultServices" ? "default_services" : key;
        const cacheKey =
          key === "orders" && pageId === "orders"
            ? "orders_dashboard"
            : apiType;
        const cached = getFromCache(cacheKey, lastServerVersions[apiType]);

        if (cached && (!localData[key] || localData[key].length === 0)) {
          localData[key] = parseDates(cached, key);
        } else if (!localData[key] || localData[key].length === 0) {
          keysToLoad.push(key);
        }
      });
    }

    if (keysToLoad.length > 0) {
      if (!silent) showLoading();
      try {
        const dataPromises = keysToLoad.map((key) => {
          if (key === "orders" && pageId === "orders") {
            return api.getData("orders", { dashboard: "true" });
          }
          return api.getData(key);
        });
        const results = await Promise.all(dataPromises);

        results.forEach((result, index) => {
          const key = keysToLoad[index];
          localData[key] = parseDates(result.data, key);

          // [FIX] Data migration for old expenses
          if (key === "expenses") {
            localData.expenses.forEach((expense) => {
              if (!expense.type) {
                expense.type = "expense";
                expense.paidAt = expense.createdAt; // Old expenses used createdAt as payment date
                expense.category = "سایر"; // Default category
                expense.paymentMethod = "سایر"; // Default payment method
              }
            });
          }

          // Update cache for static and semi-static tables
          const cacheableTables = [
            "users",
            "consoles",
            "defaultServices",
            "customers",
            "buffet",
            "orders",
          ];
          if (cacheableTables.includes(key)) {
            const apiType =
              key === "defaultServices" ? "default_services" : key;
            // Special handling for orders: only cache dashboard view to avoid stale history
            if (key === "orders") {
              if (pageId === "orders") {
                saveToCache(
                  "orders_dashboard",
                  result.data,
                  lastServerVersions["orders"],
                );
              }
            } else {
              saveToCache(apiType, result.data, lastServerVersions[apiType]);
            }
          }
        });
      } catch (error) {
        console.error(`Failed to load data for page ${pageId}:`, error);
        if (!silent) showNotification("خطا در بارگذاری اطلاعات.", true);
        throw error; // Re-throw to be caught by the caller
      } finally {
        if (!silent) hideLoading();
      }
    }

    // Render the specific view for the page now that data is loaded
    if (silent) {
      // Suppress animations or other intrusive effects during silent refresh if needed
    }

    switch (pageId) {
      case "customers":
        customerViewState.currentPage = 1;
        fetchAndRenderCustomers();
        break;
      case "buffet":
        buffetViewState.currentPage = 1;
        fetchAndRenderBuffet();
        break;
      case "expenses":
        expensesViewState.currentPage = 1;
        fetchAndRenderExpenses();
        break;
      case "orders":
        renderOrders();
        dailyOrdersViewState.currentPage = 1;
        fetchAndRenderDailyOrders();
        updateReports("daily");
        break;
      case "tournaments":
        renderTournamentPage();
        break;
      case "secretary":
        renderSecretaryMonthlySummary();
        renderSecretaryArchive();
        setupSecretaryForm();
        updateAttendanceUI();
        break;
      case "settings":
        renderConsolesList();
        renderUsersTable();
        renderDefaultServicesList();
        break;
      case "reports":
        // Fetch the stats and the table data in parallel
        reportsViewState.currentPage = 1;
        updateReports(
          document.querySelector("#stats-period-selector .active-stat")?.dataset
            .period || "daily",
        );
        fetchAndRenderReports();
        break;
    }
    animatePageElements();
  }

  // [NEW] Update sidebar visibility based on permissions
  function updateSidebarVisibility() {
    if (!currentUser) return;

    // Update current user display
    getEl("current-user-display").innerHTML =
      `کاربر: <span class="text-red-400">${currentUser.username}</span>`;

    const setVisible = (selector, hasPerm) => {
      const el = document.querySelector(selector);
      if (el) {
        if (hasPerm) {
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      }
    };

    setVisible('a[data-page="orders"]', hasPermission(PERMISSIONS.VIEW_ORDERS));
    setVisible('a[data-page="tournaments"]', hasPermission(PERMISSIONS.VIEW_TOURNAMENTS));
    setVisible('a[data-page="reports"]', hasPermission(PERMISSIONS.VIEW_REPORTS));
    setVisible('a[data-page="customers"]', hasPermission(PERMISSIONS.VIEW_CUSTOMERS));
    setVisible('a[data-page="buffet"]', hasPermission(PERMISSIONS.VIEW_BUFFET));
    setVisible('a[data-page="expenses"]', hasPermission(PERMISSIONS.VIEW_EXPENSES));
    setVisible('a[data-page="secretary"]', hasPermission(PERMISSIONS.VIEW_SECRETARY));
    setVisible('a[data-page="settings"]', hasPermission(PERMISSIONS.VIEW_SETTINGS));
  }

  // [REFACTORED] navigateTo is now the controller for page visibility and calls the fetch/render function
  async function navigateTo(pageId) {
    const inPagesDir = window.location.pathname.includes('/pages/');
    const fileName = window.location.pathname.split('/').pop().replace('.html', '');
    const currentPath = inPagesDir ? (fileName || 'orders') : 'status';

    if (pageId === 'status') {
      window.location.href = inPagesDir ? '../index.html' : 'index.html';
      return;
    }

    if (currentPath === pageId) {
      document.querySelectorAll(".nav-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.page === pageId);
      });
      showLoading();
      try {
        await fetchAndRenderPage(pageId, true);
      } catch (error) {
        console.error(`Render ${pageId} failed:`, error);
      } finally {
        hideLoading();
      }
    } else {
      window.location.href = inPagesDir ? `${pageId}.html` : `pages/${pageId}.html`;
    }
  }

  // باز و بسته کردن سایدبار در حالت موبایل
  function toggleSidebar() {
    const sidebar = getEl("sidebar");
    const overlay = getEl("sidebar-overlay");
    sidebar.classList.toggle("translate-x-full");
    overlay.classList.toggle("hidden");
  }

  // مدیریت افزودن مشتری جدید
  async function handleNewCustomer(e) {
    e.preventDefault();

    // Validation
    const nameInput = getEl("customer-name");
    const phoneInput = getEl("customer-phone");
    const nameError = getEl("customer-name-error");
    const phoneError = getEl("customer-phone-error");
    let isValid = true;

    // Reset errors
    nameError.classList.add("hidden");
    phoneError.classList.add("hidden");
    nameInput.classList.remove("border-red-500");
    phoneInput.classList.remove("border-red-500");

    if (nameInput.value.trim() === "") {
      nameError.textContent = "نام و نام خانوادگی اجباری است.";
      nameError.classList.remove("hidden");
      nameInput.classList.add("border-red-500");
      isValid = false;
    }

    const phoneRegex = /^09[0-9]{9}$/;
    if (
      phoneInput.value.trim() !== "" &&
      !phoneRegex.test(phoneInput.value.trim())
    ) {
      phoneError.textContent = "شماره تماس معتبر نیست. (مثال: 09123456789)";
      phoneError.classList.remove("hidden");
      phoneInput.classList.add("border-red-500");
      isValid = false;
    }

    if (!isValid) {
      return;
    }

    const creditLimitVal = getEl("customer-credit-limit").value.trim();
    const creditLimit = creditLimitVal === "" ? null : getNumericValue("customer-credit-limit");

    const newCustomer = {
      id: generateId(),
      name: nameInput.value,
      subCode: getEl("customer-sub-code").value,
      phone: phoneInput.value,
      balance: 0,
      creditLimit: creditLimit,
    };
    showLoading();
    try {
      await api.createItem("customers", newCustomer);
      e.target.reset();
      showNotification("مشتری با موفقیت اضافه شد.");
      await fetchAndRenderPage("customers", true);
    } catch (error) {
      console.error("Failed to create customer:", error);
      showNotification("خطا در افزودن مشتری.", true);
      await fetchAndRenderPage("customers", true);
    } finally {
      hideLoading();
    }
  }

  // --- توابع مدیریت اعتبار مشتری ---
  window.openAddCreditPaymentModal = (customerId) => {
    const customer = localData.customers.find((c) => c.id === customerId);
    if (!customer) return;
    getEl("add-credit-payment-customer-id").value = customer.id;
    getEl("add-credit-payment-customer-name").textContent = customer.name;
    getEl("add-credit-payment-form").reset();
    getEl("add-credit-check-date-container").classList.add("hidden");
    openModal("add-credit-payment-modal");
  };

  window.openDeductCreditModal = (customerId) => {
    const customer = localData.customers.find((c) => c.id === customerId);
    if (!customer) return;
    getEl("deduct-credit-customer-id").value = customer.id;
    getEl("deduct-credit-customer-name").textContent = customer.name;
    getEl("deduct-credit-form").reset();
    openModal("deduct-credit-modal");
  };

  async function handleAddCreditPayment(e) {
    e.preventDefault();
    const customerId = getEl("add-credit-payment-customer-id").value;
    const amount = getNumericValue("add-credit-payment-amount");
    const method = getEl("add-credit-payment-method").value;

    if (!customerId || amount <= 0) {
      showNotification("مبلغ یا مشتری نامعتبر است.", true);
      return;
    }

    const payload = {
      customerId: customerId,
      amount: amount,
      method: method,
    };

    if (method === Constants.PAYMENT_TYPE_CHECK || method === "check") {
      const checkDateVal = getEl("add-credit-check-date").value;
      if (!checkDateVal) {
        showNotification("لطفاً تاریخ چک را انتخاب کنید.", true);
        return;
      }
      payload.checkDate = checkDateVal;
    }

    showLoading();
    try {
      const response = await fetch(`${API_BASE}?action=charge_credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Server error during credit charge.");
      }

      closeModal("add-credit-payment-modal");
      showNotification(`اعتبار با موفقیت افزایش یافت.`);
      // Refetch data for both pages to ensure consistency
      await fetchAndRenderPage("customers", true);
      fetchAndRenderPage("orders", true).catch((e) =>
        console.error("background orders refetch failed", e),
      );
    } catch (error) {
      console.error("Failed to add credit:", error);
      showNotification(`خطا در افزایش اعتبار: ${error.message}`, true);
      // Refetch to show the actual state after a failed attempt
      await fetchAndRenderPage("customers", true);
    } finally {
      hideLoading();
    }
  }

  async function handleDeductCredit(e) {
    e.preventDefault();
    const customerId = getEl("deduct-credit-customer-id").value;
    const amount = getNumericValue("deduct-credit-amount");

    if (!customerId || amount <= 0) {
      showNotification("مبلغ یا مشتری نامعتبر است.", true);
      return;
    }

    const payload = {
      customerId: customerId,
      amount: amount,
    };

    showLoading();
    try {
      const response = await fetch(`${API_BASE}?action=deduct_credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Server error during credit deduction.",
        );
      }

      closeModal("deduct-credit-modal");
      showNotification(`اعتبار با موفقیت کسر شد.`);
      await fetchAndRenderPage("customers", true);
      fetchAndRenderPage("orders", true).catch((e) =>
        console.error("background orders refetch failed", e),
      );
    } catch (error) {
      console.error("Failed to deduct credit:", error);
      showNotification(`خطا در کسر اعتبار: ${error.message}`, true);
      await fetchAndRenderPage("customers", true);
    } finally {
      hideLoading();
    }
  }

  window.openEditCustomerModal = (id) => {
    if (!hasPermission(PERMISSIONS.MANAGE_USERS)) return;
    const customer = localData.customers.find((c) => c.id === id);
    if (!customer) return;
    getEl("edit-customer-id").value = customer.id;
    getEl("edit-customer-name").value = customer.name;
    getEl("edit-customer-sub-code").value = customer.subCode || "";
    getEl("edit-customer-phone").value = customer.phone || "";
    getEl("edit-customer-credit-limit").value =
      customer.creditLimit !== null && customer.creditLimit !== undefined && customer.creditLimit !== ""
        ? customer.creditLimit
        : "";
    openModal("edit-customer-modal");
  };
  window.openCustomerHistoryModal = async (customerId) => {
    const customer = localData.customers.find((c) => c.id === customerId);
    if (!customer) return;

    getEl("history-customer-name").textContent = customer.name;

    const currentBalance = Number(customer.balance || 0);
    const debt = currentBalance < 0 ? Math.abs(currentBalance) : 0;
    const creditLimit = (customer.creditLimit === null || customer.creditLimit === undefined || customer.creditLimit === "") ? null : Number(customer.creditLimit);
    const availableCredit = creditLimit === null ? null : (currentBalance + creditLimit);

    const summaryEl = getEl("customer-history-summary");
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="bg-stone-900 p-2 rounded border border-stone-700">
          <div class="text-stone-400">بدهی فعلی:</div>
          <div class="text-sm font-bold ${debt > 0 ? 'text-red-400' : 'text-stone-200'}">${formatCurrency(debt)}</div>
        </div>
        <div class="bg-stone-900 p-2 rounded border border-stone-700">
          <div class="text-stone-400">سقف اعتبار:</div>
          <div class="text-sm font-bold text-stone-200">${creditLimit === null ? 'آزاد' : formatCurrency(creditLimit)}</div>
        </div>
        <div class="bg-stone-900 p-2 rounded border border-stone-700">
          <div class="text-stone-400">اعتبار قابل استفاده:</div>
          <div class="text-sm font-bold ${availableCredit !== null && availableCredit <= 0 ? 'text-red-400' : 'text-green-400'}">${availableCredit === null ? 'آزاد' : formatCurrency(availableCredit)}</div>
        </div>
        <div class="bg-stone-900 p-2 rounded border border-stone-700">
          <div class="text-stone-400">وضعیت اعتبار:</div>
          <div class="text-sm font-bold ${debt > 0 ? (availableCredit !== null && availableCredit <= 0 ? 'text-red-400' : 'text-yellow-400') : 'text-green-400'}">
            ${debt > 0 ? (availableCredit !== null && availableCredit <= 0 ? 'سقف پر شده' : 'دارای بدهی') : 'بدون بدهی'}
          </div>
        </div>
      `;
    }

    showLoading();
    try {
      // Fetch all orders for this customer from the backend (limit: 0 gets all matched records without pagination)
      const result = await api.getData("orders", {
        customer_id: customerId,
        limit: 0,
      });
      const fetchedOrders = parseDates(result.data, "orders");

      const allCreditTransactions = fetchedOrders
        .filter((order) => {
          if (order.status !== Constants.ORDER_STATUS_PAID) return false;
          const hasCreditPayment = (order.payments || []).some(
            (p) => p.method === Constants.PAYMENT_TYPE_CREDIT && p.customerId === customerId,
          );
          if (hasCreditPayment) return true;
          if (order.customerId === customerId && order.description) {
            const desc = String(order.description);
            if (
              desc.includes("شارژ اعتبار") ||
              desc.includes("کسر اعتبار") ||
              desc.includes("کاهش اعتبار")
            ) {
              return true;
            }
          }
          return false;
        })
        .flatMap((order) => {
          const transactions = [];
          const date = order.settlementTime || order.endDate || order.startTime;
          const desc = order.description ? String(order.description) : "";
          if (order.customerId === customerId && desc.includes("شارژ اعتبار")) {
            transactions.push({
              date,
              description: "شارژ اعتبار",
              amount: order.totalAmount,
              orderId: order.id,
            });
          } else if (
            order.customerId === customerId &&
            (desc.includes("کسر اعتبار") || desc.includes("کاهش اعتبار"))
          ) {
            transactions.push({
              date,
              description: "کسر اعتبار توسط ادمین",
              amount: -order.totalAmount,
              orderId: order.id,
            });
          } else {
            const creditPayment = (order.payments || []).find(
              (p) => p.method === Constants.PAYMENT_TYPE_CREDIT && p.customerId === customerId,
            );
            if (creditPayment) {
              let description = `فاکتور #${order.invoiceNumber || order.id.substr(0, 5)}`;
              const consoleItem = localData.consoles.find(
                (c) => c.id === order.consoleId,
              );
              if (consoleItem)
                description += ` (${consoleItem.type} ${consoleItem.number})`;
              else if (order.description)
                description += ` (${order.description})`;
              transactions.push({
                date,
                description: `استفاده از اعتبار: ${description}`,
                amount: -creditPayment.amount,
                orderId: order.id,
              });
            }
          }
          return transactions;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      const contentDiv = getEl("customer-history-content");
      const searchInput = getEl("customer-history-search");
      searchInput.value = "";

      const renderTable = (transactions) => {
        if (transactions.length === 0) {
          contentDiv.innerHTML =
            '<p class="text-center text-stone-400">هیچ تراکنشی یافت نشد.</p>';
          return;
        }
        let runningBalance = customer.balance;
        const tableRows = transactions
          .map((tx) => {
            const amountClass =
              tx.amount > 0 ? "text-green-400" : "text-red-400";
            const rowHtml = `
                            <tr class="border-b border-stone-700 hover:bg-stone-800 text-xs">
                                <td class="px-4 py-2 whitespace-nowrap" style="direction: ltr;">${formatShamsiDate(tx.date, true)}</td>
                                <td class="px-4 py-2 whitespace-nowrap">${tx.description}</td>
                                <td class="px-4 py-2 whitespace-nowrap font-bold ${amountClass}" style="direction: ltr;">${tx.amount > 0 ? "+" : ""}${formatCurrency(tx.amount)}</td>
                                <td class="px-4 py-2 whitespace-nowrap font-bold text-white">${formatCurrency(runningBalance)}</td>
                                <td class="px-4 py-2 text-center">
                                    <button onclick="openOrderDetailsModal('${tx.orderId}')" title="مشاهده جزئیات کامل فاکتور" class="icon-btn text-gray-400 hover:text-gray-300">${ICONS.eye}</button>
                                </td>
                            </tr>`;
            runningBalance -= tx.amount;
            return rowHtml;
          })
          .join("");

        contentDiv.innerHTML = `
                        <table class="w-full text-sm text-left text-stone-400">
                            <thead class="text-xs text-stone-300 uppercase bg-stone-700 sticky top-0">
                                <tr>
                                    <th scope="col" class="px-4 py-3">تاریخ</th>
                                    <th scope="col" class="px-4 py-3">شرح</th>
                                    <th scope="col" class="px-4 py-3">تغییر اعتبار</th>
                                    <th scope="col" class="px-4 py-3">موجودی نهایی</th>
                                    <th scope="col" class="px-4 py-3 text-center">جزئیات</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>`;
      };

      renderTable(allCreditTransactions);

      searchInput.onkeyup = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = allCreditTransactions.filter((tx) =>
          tx.description.toLowerCase().includes(searchTerm),
        );
        renderTable(filtered);
      };

      // --- Chart Logic ---
      if (creditChartInstance) {
        creditChartInstance.destroy();
      }
      const chartCanvas = getEl("customer-credit-chart");
      if (allCreditTransactions.length > 1) {
        const chronTransactions = [...allCreditTransactions].sort(
          (a, b) => new Date(a.date) - new Date(b.date),
        ); // Sort oldest to newest

        // Calculate the initial balance by subtracting all transaction amounts from the current balance
        const totalTransactionAmount = chronTransactions.reduce(
          (sum, tx) => sum + tx.amount,
          0,
        );
        let runningBalance = customer.balance - totalTransactionAmount;

        const chartData = chronTransactions.map((tx) => {
          runningBalance += tx.amount;
          return {
            x: new Date(tx.date).getTime(), // Use timestamp for accurate sorting
            y: runningBalance,
            description: tx.description,
            amount: tx.amount,
          };
        });

        chartCanvas.style.display = "block";
        const ctx = chartCanvas.getContext("2d");
        creditChartInstance = new Chart(ctx, {
          type: "line",
          data: {
            datasets: [
              {
                label: "موجودی اعتبار",
                data: chartData,
                borderColor: "#34d399", // emerald-400
                backgroundColor: "rgba(52, 211, 153, 0.1)",
                fill: true,
                tension: 0.1,
                pointBackgroundColor: "#34d399",
                pointHoverRadius: 6,
              },
            ],
          },
          options: {
            responsive: true,
            scales: {
              y: {
                ticks: {
                  color: "#d6d3d1",
                  callback: (value) => formatCurrency(value),
                },
                grid: { color: "rgba(255,255,255,0.1)" },
              },
              x: {
                type: "time",
                time: {
                  parser: "jYYYY/jMM/jDD HH:mm",
                  tooltipFormat: "jYYYY/jMM/jDD HH:mm",
                  unit: "day",
                  displayFormats: {
                    day: "jYYYY/jMM/jDD",
                  },
                },
                ticks: { color: "#d6d3d1" },
                grid: { display: false },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                rtl: true,
                callbacks: {
                  title: function (tooltipItems) {
                    return formatShamsiDate(
                      new Date(tooltipItems[0].parsed.x),
                      true,
                    );
                  },
                  label: function (context) {
                    const point = context.dataset.data[context.dataIndex];
                    const changeAmount = point.amount;
                    const changeText = `${changeAmount > 0 ? "+" : ""}${formatCurrency(changeAmount)}`;
                    return [
                      `تغییر: ${changeText}`,
                      `موجودی: ${formatCurrency(context.parsed.y)}`,
                    ];
                  },
                  afterLabel: function (context) {
                    const point = context.dataset.data[context.dataIndex];
                    return point.description;
                  },
                },
              },
            },
          },
        });
      } else {
        chartCanvas.style.display = "none";
      }

      openModal("customer-history-modal");
    } catch (error) {
      console.error("Failed to fetch customer credit transactions:", error);
      showNotification("خطا در بارگذاری تاریخچه فاکتورهای اعتباری.", true);
    } finally {
      hideLoading();
    }
  };

  async function handleEditCustomer(e) {
    e.preventDefault();
    if (!currentUser.isAdmin) return;
    const id = getEl("edit-customer-id").value;
    const customerIndex = localData.customers.findIndex((c) => c.id === id);
    if (customerIndex > -1) {
      const customer = localData.customers[customerIndex];
      const creditLimitVal = getEl("edit-customer-credit-limit").value.trim();
      const creditLimit = creditLimitVal === "" ? null : getNumericValue("edit-customer-credit-limit");

      const updatedCustomer = {
        ...customer,
        name: getEl("edit-customer-name").value,
        subCode: getEl("edit-customer-sub-code").value,
        phone: getEl("edit-customer-phone").value,
        creditLimit: creditLimit,
      };

      showLoading();
      try {
        await api.updateItem("customers", id, updatedCustomer);
        closeModal("edit-customer-modal");
        showNotification("اطلاعات مشتری ویرایش شد.");
        await fetchAndRenderPage("customers", true);
      } catch (error) {
        console.error("Failed to edit customer:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در ویرایش مشتری.", true);
        }
        await fetchAndRenderPage("customers", true);
      } finally {
        hideLoading();
      }
    }
  }
  let creditChartInstance = null;

  window.deleteCustomer = (id) => {
    if (!currentUser.isAdmin) return;
    showConfirmation("آیا از حذف این مشتری مطمئن هستید؟", async () => {
      showLoading();
      try {
        await api.deleteItem("customers", id);
        showNotification("مشتری حذف شد.");
        await fetchAndRenderPage("customers", true);
      } catch (error) {
        console.error("Failed to delete customer:", error);
        showNotification("خطا در حذف مشتری.", true);
        await fetchAndRenderPage("customers", true);
      } finally {
        hideLoading();
      }
    });
  };

  async function handleNewBuffetItem(e) {
    e.preventDefault();
    const newItem = {
      id: generateId(),
      name: getEl("buffet-item-name").value,
      buyPrice: getNumericValue("buffet-item-buy-price"),
      sellPrice: getNumericValue("buffet-item-sell-price"),
      stock: parseInt(getEl("buffet-item-stock").value),
    };
    showLoading();
    try {
      await api.createItem("buffet", newItem);
      e.target.reset();
      showNotification("محصول جدید به بوفه اضافه شد.");
      await fetchAndRenderPage("buffet", true);
    } catch (error) {
      console.error("Failed to create buffet item:", error);
      showNotification("خطا در افزودن محصول.", true);
      await fetchAndRenderPage("buffet", true);
    } finally {
      hideLoading();
    }
  }

  window.openEditBuffetModal = (id) => {
    if (!currentUser.isAdmin) return;
    const item = localData.buffet.find((i) => i.id === id);
    if (!item) return;
    getEl("edit-buffet-id").value = item.id;
    getEl("edit-buffet-name").value = item.name;
    getEl("edit-buffet-buy-price").value = item.buyPrice;
    getEl("edit-buffet-sell-price").value = item.sellPrice;
    getEl("edit-buffet-stock").value = item.stock;
    openModal("edit-buffet-modal");
  };

  async function handleEditBuffetItem(e) {
    e.preventDefault();
    if (!currentUser.isAdmin) return;
    const id = getEl("edit-buffet-id").value;
    const itemIndex = localData.buffet.findIndex((i) => i.id === id);
    if (itemIndex > -1) {
      const item = localData.buffet[itemIndex];
      const updatedItem = {
        ...item,
        name: getEl("edit-buffet-name").value,
        buyPrice: getNumericValue("edit-buffet-buy-price"),
        sellPrice: getNumericValue("edit-buffet-sell-price"),
        stock: parseInt(getEl("edit-buffet-stock").value),
      };

      showLoading();
      try {
        await api.updateItem("buffet", id, updatedItem);
        closeModal("edit-buffet-modal");
        showNotification("محصول ویرایش شد.");
        await fetchAndRenderPage("buffet", true);
      } catch (error) {
        console.error("Failed to edit buffet item:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در ویرایش محصول.", true);
        }
        await fetchAndRenderPage("buffet", true);
      } finally {
        hideLoading();
      }
    }
  }

  window.deleteBuffetItem = (id) => {
    if (!currentUser.isAdmin) return;
    showConfirmation("آیا از حذف این محصول مطمئن هستید؟", async () => {
      showLoading();
      try {
        await api.deleteItem("buffet", id);
        showNotification("محصول حذف شد.");
        await fetchAndRenderPage("buffet", true);
      } catch (error) {
        console.error("Failed to delete buffet item:", error);
        showNotification("خطا در حذف محصول.", true);
        await fetchAndRenderPage("buffet", true);
      } finally {
        hideLoading();
      }
    });
  };

  function addRateField(container, name = "", price = "") {
    const wrapper = document.createElement("div");
    wrapper.className = "grid grid-cols-11 gap-2 items-center";
    wrapper.innerHTML = `
                <input type="text" class="input-field col-span-5" placeholder="نام تعرفه (مثلا تک نفره)" value="${name}" required>
                <input type="text" class="input-field currency-input col-span-5" placeholder="قیمت (تومان)" value="${price}" required style="direction: ltr;">
                <button type="button" class="text-red-500 hover:text-red-400 col-span-1" onclick="this.parentElement.remove()">X</button>
            `;
    getEl(container).appendChild(wrapper);
  }

  async function handleNewConsole(e) {
    e.preventDefault();
    const type = getEl("console-type").value;
    const number = getEl("console-number").value;
    const rates = [];
    getEl("rate-fields-container")
      .querySelectorAll(".grid")
      .forEach((row) => {
        rates.push({
          name: row.children[0].value,
          price: getNumericValue(row.children[1]),
        });
      });

    if (
      !type ||
      !number ||
      rates.length === 0 ||
      rates.some((r) => !r.name || isNaN(r.price))
    ) {
      showNotification("لطفا تمام فیلدهای کنسول و تعرفه را پر کنید.", true);
      return;
    }

    const newConsole = {
      id: generateId(),
      type,
      number,
      rates,
      specialRate: {
        startTime: getEl("special-rate-start-time").value,
        endTime: getEl("special-rate-end-time").value,
        amount: getNumericValue("special-rate-amount"),
      },
    };

    showLoading();
    try {
      await api.createItem("consoles", newConsole);
      e.target.reset();
      getEl("rate-fields-container").innerHTML = "";
      addRateField("rate-fields-container");
      showNotification("کنسول جدید اضافه شد.");
      await fetchAndRenderPage("settings", true);
    } catch (error) {
      console.error("Failed to create console:", error);
      showNotification("خطا در افزودن کنسول.", true);
      await fetchAndRenderPage("settings", true);
    } finally {
      hideLoading();
    }
  }

  window.openEditConsoleModal = (id) => {
    if (!hasPermission(PERMISSIONS.MANAGE_CONSOLES)) return;
    const consoleItem = localData.consoles.find((c) => c.id === id);
    if (!consoleItem) return;
    getEl("edit-console-id").value = consoleItem.id;
    getEl("edit-console-type").value = consoleItem.type;
    getEl("edit-console-number").value = consoleItem.number;
    const container = getEl("edit-rate-fields-container");
    container.innerHTML = "";
    consoleItem.rates.forEach((rate) =>
      addRateField("edit-rate-fields-container", rate.name, rate.price),
    );
    if (consoleItem.specialRate) {
      getEl("edit-special-rate-start-time").value =
        consoleItem.specialRate.startTime;
      getEl("edit-special-rate-end-time").value =
        consoleItem.specialRate.endTime;
      getEl("edit-special-rate-amount").value = consoleItem.specialRate.amount;
    }
    openModal("edit-console-modal");
  };

  async function handleEditConsole(e) {
    e.preventDefault();
    if (!hasPermission(PERMISSIONS.MANAGE_CONSOLES)) return;
    const id = getEl("edit-console-id").value;
    const consoleIndex = localData.consoles.findIndex((c) => c.id === id);
    if (consoleIndex > -1) {
      const consoleItem = localData.consoles[consoleIndex];
      const rates = [];
      getEl("edit-rate-fields-container")
        .querySelectorAll(".grid")
        .forEach((row) => {
          rates.push({
            name: row.children[0].value,
            price: getNumericValue(row.children[1]),
          });
        });

      const updatedConsole = {
        ...consoleItem,
        type: getEl("edit-console-type").value,
        number: getEl("edit-console-number").value,
        rates: rates,
        specialRate: {
          startTime: getEl("edit-special-rate-start-time").value,
          endTime: getEl("edit-special-rate-end-time").value,
          amount: getNumericValue("edit-special-rate-amount"),
        },
      };

      showLoading();
      try {
        await api.updateItem("consoles", id, updatedConsole);
        closeModal("edit-console-modal");
        showNotification("اطلاعات کنسول ویرایش شد.");
        await fetchAndRenderPage("settings", true);
      } catch (error) {
        console.error("Failed to edit console:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در ویرایش کنسول.", true);
        }
        await fetchAndRenderPage("settings", true);
      } finally {
        hideLoading();
      }
    }
  }

  window.deleteConsole = (id) => {
    if (!hasPermission(PERMISSIONS.MANAGE_CONSOLES)) return;
    showConfirmation(
      "آیا از حذف این کنسول مطمئن هستید؟ این عمل ممکن است روی گزارشات قدیمی تاثیر بگذارد.",
      async () => {
        showLoading();
        try {
          await api.deleteItem("consoles", id);
          showNotification("کنسول حذف شد.");
          await fetchAndRenderPage("settings", true);
        } catch (error) {
          console.error("Failed to delete console:", error);
          showNotification("خطا در حذف کنسول.", true);
          await fetchAndRenderPage("settings", true);
        } finally {
          hideLoading();
        }
      },
    );
  };

  async function handleNewUser(e) {
    e.preventDefault();
    const username = getEl("new-user-username").value;
    const password = getEl("new-user-password").value;
    if (localData.users.some((u) => u.username === username)) {
      showNotification("این نام کاربری قبلا ثبت شده است.", true);
      return;
    }
    const newUser = {
      id: generateId(),
      username,
      password,
      isAdmin: false, // Legacy field kept for safety, but main logic uses permissions
      permissions: JSON.stringify(
        Array.from(
          document.querySelectorAll(
            '#new-user-form input[name="permissions"]:checked',
          ),
        ).map((cb) => cb.value),
      ),
      hourly_rate: getNumericValue("new-user-hourly-rate"),
    };
    showLoading();
    try {
      await api.createItem("users", newUser);
      e.target.reset();
      showNotification("کاربر جدید با موفقیت اضافه شد.");
      await fetchAndRenderPage("settings", true);
    } catch (error) {
      console.error("Failed to create user:", error);
      showNotification("خطا در افزودن کاربر.", true);
      await fetchAndRenderPage("settings", true);
    } finally {
      hideLoading();
    }
  }

  window.openEditUserModal = (id) => {
    const user = localData.users.find((u) => u.id === id);
    if (!user || user.username === "admin") return;

    getEl("edit-user-id").value = user.id;
    getEl("edit-user-username-display").textContent = user.username;

    // Populate permissions checkboxes
    const form = getEl("edit-user-form");
    const checkboxes = form.querySelectorAll('input[name="permissions"]');
    checkboxes.forEach((cb) => (cb.checked = false));

    let permissions = user.permissions;

    // Robust parsing if it's a string or invalid
    if (typeof permissions === "string") {
      try {
        permissions = JSON.parse(permissions);
      } catch (e) {
        console.error("Error parsing permissions in modal:", e);
        permissions = [];
      }
    }

    if (Array.isArray(permissions) && permissions.length > 0) {
      permissions.forEach((p) => {
        const cb = form.querySelector(`input[value="${p}"]`);
        if (cb) cb.checked = true;
      });
    } else if (user.isAdmin) {
      // If legacy admin, check all boxes
      checkboxes.forEach((cb) => (cb.checked = true));
    }

    getEl("edit-user-hourly-rate").value = user.hourly_rate || 0;
    formatCurrencyInput({ target: getEl("edit-user-hourly-rate") });
    openModal("edit-user-modal");
  };

  async function handleEditUser(e) {
    e.preventDefault();
    const id = getEl("edit-user-id").value;
    const userIndex = localData.users.findIndex((u) => u.id === id);
    if (userIndex > -1) {
      const user = localData.users[userIndex];
      const updatedUser = {
        ...user,
        permissions: JSON.stringify(
          Array.from(
            document.querySelectorAll(
              '#edit-user-form input[name="permissions"]:checked',
            ),
          ).map((cb) => cb.value),
        ),
        // If user has all permissions or specific 'admin' permission (optional), we could set isAdmin.
        // For now, let's keep isAdmin consistent if they have all critical permissions, or just set to false.
        // Safer to set isAdmin to false and rely on permissions, unless it's the root admin.
        isAdmin: user.username === "admin" ? true : false,
        hourly_rate: getNumericValue("edit-user-hourly-rate"),
      };

      showLoading();
      try {
        await api.updateItem("users", id, updatedUser);
        closeModal("edit-user-modal");
        showNotification("نقش کاربر ویرایش شد.");
        await fetchAndRenderPage("settings", true);
      } catch (error) {
        console.error("Failed to edit user:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در ویرایش کاربر.", true);
        }
        await fetchAndRenderPage("settings", true);
      } finally {
        hideLoading();
      }
    }
  }

  window.openEditDefaultServiceModal = (id) => {
    const service = localData.defaultServices.find((s) => s.id === id);
    if (!service) return;

    getEl("edit-default-service-id").value = service.id;
    getEl("edit-default-service-description").value = service.description;
    getEl("edit-default-service-price").value = service.price;
    formatCurrencyInput({ target: getEl("edit-default-service-price") });
    openModal("edit-default-service-modal");
  };

  async function handleEditDefaultService(e) {
    e.preventDefault();
    const id = getEl("edit-default-service-id").value;
    const serviceIndex = localData.defaultServices.findIndex(
      (s) => s.id === id,
    );
    if (serviceIndex > -1) {
      const updatedService = {
        ...localData.defaultServices[serviceIndex],
        description: getEl("edit-default-service-description").value,
        price: getNumericValue("edit-default-service-price"),
      };

      showLoading();
      try {
        await api.updateItem("default_services", id, updatedService);
        closeModal("edit-default-service-modal");
        showNotification("خدمات پیش‌فرض ویرایش شد.");
        await fetchAndRenderPage("settings", true);
      } catch (error) {
        console.error("Failed to edit default service:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در ویرایش خدمات.", true);
        }
        await fetchAndRenderPage("settings", true);
      } finally {
        hideLoading();
      }
    }
  }

  window.deleteUser = (id) => {
    const userToDelete = localData.users.find((u) => u.id === id);
    if (userToDelete && userToDelete.username === "admin") {
      showNotification("نمی‌توان کاربر اصلی ادمین را حذف کرد.", true);
      return;
    }
    showConfirmation("آیا از حذف این کاربر مطمئن هستید؟", async () => {
      showLoading();
      try {
        await api.deleteItem("users", id);
        showNotification("کاربر حذف شد.");
        await fetchAndRenderPage("settings", true);
      } catch (error) {
        console.error("Failed to delete user:", error);
        showNotification("خطا در حذف کاربر.", true);
        await fetchAndRenderPage("settings", true);
      } finally {
        hideLoading();
      }
    });
  };

  async function handleNewOrder(e) {
    e.preventDefault();
    const consoleId = getEl("order-console").value;

    if (consoleId) {
      const activeSessionExists = (localData.orders || []).some(
        (o) => o.consoleId === consoleId && o.status === Constants.ORDER_STATUS_ACTIVE
      );
      if (activeSessionExists) {
        showNotification("این کنسول در حال حاضر دارای یک جلسه فعال است.", true);
        return;
      }
    }

    setAllButtonsDisabled(true);
    showLoading();
    try {
      // Logic for creating a miscellaneous invoice (no console)
      if (!consoleId) {
        const newOrder = {
          id: generateId(),
          description: getEl("order-description").value || "فاکتور خدمات/بوفه",
          status: "pending_payment",
        };
        await api.createItem("orders", newOrder);
        e.target.reset();
        getEl("new-order-form-container").classList.add("hidden");
        showNotification(`فاکتور جدید به لیست انتظار پرداخت اضافه شد.`);
        await fetchAndRenderPage("orders", true);
        return;
      }

      // Logic for creating a console session order
      const rateId = getEl("order-rate").value;
      const startTimeInput = getEl("order-start-time").value;
      const limitType = document.querySelector(
        'input[name="limitType"]:checked',
      ).value;
      const now = TimeService.nowMoment();
      const startTime = startTimeInput
        ? moment(now.format("YYYY-MM-DD") + " " + startTimeInput).toDate()
        : now.toDate();
      let scheduledEndTime = null;

      if (limitType === "time") {
        const durationMinutes = parseInt(getEl("order-duration").value);
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
          showNotification("لطفا مدت زمان معتبری را به دقیقه وارد کنید.", true);
          return; // No hideLoading, as it will be caught by finally
        }
        scheduledEndTime = moment(startTime)
          .add(durationMinutes, "minutes")
          .toDate();
      } else if (limitType === "amount") {
        const targetAmount = getNumericValue("order-amount");
        if (targetAmount <= 0) {
          showNotification("لطفا مبلغ معتبری را وارد کنید.", true);
          return;
        }
        const consoleItem = localData.consoles.find((c) => c.id === consoleId);
        const ratePrice = getEffectiveRatePrice({
          consoleId: consoleItem.id,
          rateId: rateId,
          startTime: startTime,
        });
        if (!ratePrice || ratePrice <= 0) {
          showNotification("تعرفه انتخاب شده قیمت معتبری ندارد.", true);
          return;
        }
        const durationMinutes = (targetAmount / ratePrice) * 60;
        scheduledEndTime = moment(startTime)
          .add(durationMinutes, "minutes")
          .toDate();
      } else if (limitType === "endTime") {
        const endTimeInput = getEl("order-end-time").value;
        if (!endTimeInput) {
          showNotification("لطفا زمان پایان را مشخص کنید.", true);
          return;
        }
        scheduledEndTime = moment(
          now.format("YYYY-MM-DD") + " " + endTimeInput,
        ).toDate();
      }

      const newOrder = {
        id: generateId(),
        consoleId,
        rateId,
        startTime,
        scheduledEndTime,
        description: getEl("order-description").value,
        status: Constants.ORDER_STATUS_ACTIVE,
      };

      await api.createItem("orders", newOrder);
      e.target.reset();
      getEl("new-order-form-container").classList.add("hidden");
      document.querySelector('input[name="limitType"][value="open"]').checked =
        true;
      showNotification(`جلسه برای کنسول شروع شد.`);
      await fetchAndRenderPage("orders", true);
    } catch (error) {
      console.error("Failed to create order:", error);
      showNotification("خطا در ثبت سفارش.", true);
      await fetchAndRenderPage("orders", true);
    } finally {
      setAllButtonsDisabled(false);
      hideLoading();
    }
  }

  window.openTransferOrderModal = (orderId) => {
    const order = localData.orders.find((o) => o.id === orderId);
    if (!order) return;

    getEl("transfer-order-id").value = order.id;
    const consoleSelect = getEl("transfer-order-console-select");
    const rateContainer = getEl("transfer-order-rate-container");
    const rateSelect = getEl("transfer-order-rate-select");

    const availableConsoles = localData.consoles.filter(
      (c) =>
        !localData.orders.some(
          (o) =>
            o.status === Constants.ORDER_STATUS_ACTIVE && o.consoleId === c.id && o.id !== orderId,
        ),
    );
    consoleSelect.innerHTML = availableConsoles
      .map((c) => `<option value="${c.id}">${c.type} ${c.number}</option>`)
      .join("");
    consoleSelect.value = order.consoleId;

    const updateRates = (selectedConsoleId) => {
      const consoleItem = localData.consoles.find(
        (c) => c.id === selectedConsoleId,
      );
      if (consoleItem && consoleItem.rates && consoleItem.rates.length > 0) {
        rateSelect.innerHTML = consoleItem.rates
          .map(
            (rate, index) => `<option value="${index}">${rate.name}</option>`,
          )
          .join("");
        rateSelect.value =
          order.consoleId === selectedConsoleId ? order.rateId : 0;
        rateContainer.classList.remove("hidden");
      } else {
        rateContainer.classList.add("hidden");
      }
    };
    consoleSelect.onchange = (e) => updateRates(e.target.value);
    updateRates(order.consoleId);
    openModal("transfer-order-modal");
  };

  async function handleTransferOrder(e) {
    e.preventDefault();
    const orderId = getEl("transfer-order-id").value;
    const newConsoleId = getEl("transfer-order-console-select").value;
    const newRateId = getEl("transfer-order-rate-select").value;

    const orderIndex = localData.orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1) return;

    const updatedOrder = JSON.parse(
      JSON.stringify(localData.orders[orderIndex]),
    );
    const transferTime = TimeService.nowDate();

    const lastHistoryEntry =
      updatedOrder.history && updatedOrder.history.length > 0
        ? updatedOrder.history[updatedOrder.history.length - 1]
        : null;
    const segmentStartTime = lastHistoryEntry
      ? new Date(lastHistoryEntry.endTime)
      : new Date(updatedOrder.startTime);

    const finishedSegment = {
      consoleId: updatedOrder.consoleId,
      rateId: updatedOrder.rateId,
      startTime: segmentStartTime,
      endTime: transferTime,
    };

    if (!updatedOrder.history) updatedOrder.history = [];
    updatedOrder.history.push(finishedSegment);

    updatedOrder.consoleId = newConsoleId;
    updatedOrder.rateId = newRateId;

    showLoading();
    try {
      await api.updateItem("orders", updatedOrder.id, updatedOrder);
      closeModal("transfer-order-modal");
      showNotification("جلسه با موفقیت منتقل شد.");
      await fetchAndRenderPage("orders", true);
    } catch (error) {
      console.error("Failed to transfer order:", error);
      if (error.status === 409) {
        showNotification(
          "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
          true,
        );
      } else {
        showNotification("خطا در انتقال جلسه.", true);
      }
      await fetchAndRenderPage("orders", true);
    } finally {
      hideLoading();
    }
  }

  addListener("order-console", "change", (e) => {
    const consoleId = e.target.value;
    const consoleOptionsContainer = getEl("console-options-container");

    if (consoleId) {
      consoleOptionsContainer.classList.remove("hidden");
      const consoleItem = localData.consoles.find((c) => c.id === consoleId);
      const rateSelect = getEl("order-rate");
      rateSelect.innerHTML = consoleItem.rates
        .map(
          (rate, index) =>
            `<option value="${index}">${rate.name} - ${formatCurrency(rate.price)}</option>`,
        )
        .join("");
    } else {
      consoleOptionsContainer.classList.add("hidden");
    }
  });

  addListener("limit-type-selector", "change", (e) => {
    const timeContainer = getEl("time-limit-container");
    const amountContainer = getEl("amount-limit-container");
    const endTimeContainer = getEl("end-time-limit-container");

    timeContainer.classList.add("hidden");
    amountContainer.classList.add("hidden");
    endTimeContainer.classList.add("hidden");

    if (e.target.value === "time") {
      timeContainer.classList.remove("hidden");
    } else if (e.target.value === "amount") {
      amountContainer.classList.remove("hidden");
    } else if (e.target.value === "endTime") {
      endTimeContainer.classList.remove("hidden");
    }
  });

  window.endSession = async (orderId, useOriginalEndTime = false) => {
    const orderIndex = localData.orders.findIndex((o) => o.id === orderId);
    if (orderIndex > -1) {
      const order = { ...localData.orders[orderIndex] };

      if (useOriginalEndTime && order.scheduledEndTime) {
        order.endDate = new Date(order.scheduledEndTime);
      } else {
        order.endDate = TimeService.nowMoment().toDate();
      }
      order.timeUp = false;

      const { totalAmount } = calculateFinalAmount(order, "pending");
      const totalPaid = (order.payments || []).reduce(
        (sum, p) => sum + p.amount,
        0,
      );

      if (totalPaid >= totalAmount) {
        order.status = Constants.ORDER_STATUS_PAID;
        if (!order.settlementTime) {
          // Only set settlement time if it's not already set by a pre-payment
          order.settlementTime = TimeService.nowDate();
        }
      } else {
        order.status = Constants.ORDER_STATUS_PENDING;
      }

      showLoading();
      try {
        await api.updateItem("orders", order.id, order);
        if (order.status === Constants.ORDER_STATUS_PAID) {
          showNotification("جلسه پایان یافت و فاکتور به تاریخچه منتقل شد.");
        } else {
          showNotification("جلسه به لیست انتظار پرداخت منتقل شد.");
        }
        await fetchAndRenderPage("orders", true);
      } catch (error) {
        console.error("Failed to end session:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در پایان دادن به جلسه.", true);
        }
        await fetchAndRenderPage("orders", true);
      } finally {
        hideLoading();
      }
    }
  };

  window.reopenOrder = async (orderId) => {
    if (!currentUser?.isAdmin) {
      showNotification("این عملیات فقط برای ادمین امکان‌پذیر است.", true);
      return;
    }

    showConfirmation(
      "آیا می‌خواهید این فاکتور را برای ویرایش مجدد باز کنید؟ پرداخت‌های اعتباری به حساب مشتری بازگردانده خواهد شد.",
      async () => {
        showLoading();
        const orderIndex = localData.orders.findIndex((o) => o.id === orderId);
        if (orderIndex === -1) {
          hideLoading();
          showNotification("فاکتور یافت نشد.", true);
          return;
        }
        const original = localData.orders[orderIndex];
        // Keep original timing and items; backend will revert credit and stock safely
        const orderToReopen = {
          ...original,
          status: "pending_payment",
          settlementTime: null,
          payments: [],
          // Preserve start/end, items and calculated amounts for correct pending rendering
          startTime: original.startTime,
          endDate: original.endDate,
          scheduledEndTime: original.scheduledEndTime,
          buffetItems: [...(original.buffetItems || [])],
          services: [...(original.services || [])],
          finalGameCost: original.finalGameCost,
          buffetCost: original.buffetCost,
          servicesCost: original.servicesCost,
          discountAmount: original.discountAmount,
          totalAmount: original.totalAmount,
        };

        if (original.status !== Constants.ORDER_STATUS_PAID) {
          hideLoading();
          showNotification("فقط فاکتورهای تسویه شده را می‌توان باز کرد.", true);
          return;
        }

        try {
          // Use backend transactional endpoint to handle refunds/restocks and reopening
          const response = await fetch(
            `${API_BASE}?action=reopen_order&id=${encodeURIComponent(orderToReopen.id)}`,
          );
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || "Server error");
          }

          showNotification("فاکتور برای ویرایش مجدد باز شد.");
          await fetchAndRenderPage("orders", true);
          fetchAndRenderPage("customers", true).catch((e) => console.error(e));
        } catch (error) {
          console.error("Failed to reopen order:", error);
          showNotification(
            "خطا در باز کردن فاکتور. لطفا صفحه را رفرش کنید.",
            true,
          );
          await fetchAndRenderPage("orders", true);
        } finally {
          hideLoading();
        }
      },
      "بله، باز کن",
      "انصراف",
    );
  };

  // --- Edit Paid Order Logic (Admin Only - Reports Page) ---
  let currentPaidOrderEdit = null;

  window.openEditPaidOrderModal = async (orderId) => {
    if (!currentUser?.isAdmin) {
      showNotification("این عملیات فقط برای ادمین امکان‌پذیر است.", true);
      return;
    }

    let order = localData.orders
      ? localData.orders.find((o) => o.id === orderId)
      : null;
    if (
      !order &&
      typeof reportsViewState !== "undefined" &&
      reportsViewState.loadedData
    ) {
      order = reportsViewState.loadedData.find((o) => o.id === orderId);
    }

    if (!order) {
      showLoading();
      try {
        const result = await api.getData("orders", { id: orderId });
        if (result && result.data && result.data.length > 0) {
          const parsed = parseDates(result.data, "orders");
          order = parsed[0];
        }
      } catch (e) {
        console.error("Failed to fetch order details:", e);
      } finally {
        hideLoading();
      }
    }

    if (!order) {
      showNotification("فاکتور یافت نشد.", true);
      return;
    }

    currentPaidOrderEdit = {
      order: order,
      buffetItems: JSON.parse(JSON.stringify(order.buffetItems || [])),
      services: JSON.parse(JSON.stringify(order.services || [])),
      payments: JSON.parse(JSON.stringify(order.payments || [])),
      creditCustomerId: null,
      finalGameCost: order.finalGameCost || 0,
      totalAmount: 0,
    };

    const customer = localData.customers.find((c) => c.id === order.customerId);
    getEl("edit-paid-invoice-number").textContent = order.invoiceNumber
      ? `فاکتور #${order.invoiceNumber}`
      : "فاکتور بدون شماره";
    getEl("edit-paid-customer-name").textContent =
      customer?.name || order.customer_name || "مشتری آزاد";
    getEl("edit-paid-start-time").textContent = formatShamsiDate(
      order.startTime,
      true,
    );
    getEl("edit-paid-end-time").textContent = formatShamsiDate(
      order.endDate,
      true,
    );
    getEl("edit-paid-settlement-time").textContent = formatShamsiDate(
      order.settlementTime,
      true,
    );

    const errorEl = getEl("edit-paid-error");
    if (errorEl) errorEl.classList.add("hidden");

    populateEditPaidBuffetSelect();
    populateEditPaidDefaultServicesSelect();

    recalculateEditPaidOrder();
    openModal("edit-paid-order-modal");
  };

  function populateEditPaidBuffetSelect() {
    const select = getEl("edit-paid-buffet-select");
    if (!select) return;
    select.innerHTML = (localData.buffet || [])
      .map(
        (item) =>
          `<option value="${item.id}">${item.name} (${formatCurrency(item.sellPrice)}) - موجودی: ${item.stock}</option>`,
      )
      .join("");
  }

  function populateEditPaidDefaultServicesSelect() {
    const select = getEl("edit-paid-default-service-select");
    if (!select) return;
    select.innerHTML =
      '<option value="">--- انتخاب از خدمات پیش‌فرض ---</option>' +
      (localData.defaultServices || [])
        .map(
          (s) =>
            `<option value="${s.id}" data-desc="${s.description}" data-price="${s.price}">${s.description} (${formatCurrency(s.price)})</option>`,
        )
        .join("");
  }

  function recalculateEditPaidOrder() {
    if (!currentPaidOrderEdit) return;

    const gameCost = Math.round((currentPaidOrderEdit.order.finalGameCost || 0) / 1000) * 1000;
    const buffetCost = currentPaidOrderEdit.buffetItems.reduce(
      (sum, item) => sum + item.sellPrice * item.quantity,
      0,
    );
    const servicesCost = currentPaidOrderEdit.services.reduce(
      (sum, service) => sum + (Number(service.price) || 0),
      0,
    );
    const totalAmount = gameCost + buffetCost + servicesCost;
    currentPaidOrderEdit.totalAmount = totalAmount;

    getEl("edit-paid-game-cost").textContent = formatCurrency(gameCost);
    getEl("edit-paid-buffet-cost").textContent = formatCurrency(buffetCost);
    getEl("edit-paid-services-cost").textContent = formatCurrency(servicesCost);
    getEl("edit-paid-total-amount").textContent = formatCurrency(totalAmount);

    const paidTotal = currentPaidOrderEdit.payments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0,
    );
    const remaining = totalAmount - paidTotal;
    getEl("edit-paid-remaining-amount").textContent = formatCurrency(remaining > 0 ? remaining : 0);

    renderEditPaidBuffetList();
    renderEditPaidServicesList();
    renderEditPaidPaymentsList();
  }

  function renderEditPaidBuffetList() {
    const container = getEl("edit-paid-buffet-list");
    if (!container || !currentPaidOrderEdit) return;
    if (currentPaidOrderEdit.buffetItems.length === 0) {
      container.innerHTML = '<p class="text-xs text-stone-500 italic">هیچ آیتم بوفه‌ای ثبت نشده است.</p>';
      return;
    }
    container.innerHTML = currentPaidOrderEdit.buffetItems
      .map(
        (item, index) => `
          <div class="flex justify-between items-center bg-stone-700/50 p-2 rounded text-xs">
            <span>${item.name} (x${item.quantity}) - ${formatCurrency(item.sellPrice * item.quantity)}</span>
            <button type="button" class="text-red-400 hover:text-red-300 font-bold" onclick="removeEditPaidBuffetItem(${index})">حذف</button>
          </div>
        `,
      )
      .join("");
  }

  window.removeEditPaidBuffetItem = (index) => {
    if (!currentPaidOrderEdit) return;
    currentPaidOrderEdit.buffetItems.splice(index, 1);
    recalculateEditPaidOrder();
  };

  function renderEditPaidServicesList() {
    const container = getEl("edit-paid-services-list");
    if (!container || !currentPaidOrderEdit) return;
    if (currentPaidOrderEdit.services.length === 0) {
      container.innerHTML = '<p class="text-xs text-stone-500 italic">هیچ خدماتی ثبت نشده است.</p>';
      return;
    }
    container.innerHTML = currentPaidOrderEdit.services
      .map(
        (s, index) => `
          <div class="flex justify-between items-center bg-stone-700/50 p-2 rounded text-xs">
            <span>${s.description} - ${formatCurrency(s.price)}</span>
            <button type="button" class="text-red-400 hover:text-red-300 font-bold" onclick="removeEditPaidService(${index})">حذف</button>
          </div>
        `,
      )
      .join("");
  }

  window.removeEditPaidService = (index) => {
    if (!currentPaidOrderEdit) return;
    currentPaidOrderEdit.services.splice(index, 1);
    recalculateEditPaidOrder();
  };

  function renderEditPaidPaymentsList() {
    const container = getEl("edit-paid-payments-list");
    if (!container || !currentPaidOrderEdit) return;
    const methodLabels = { cash: "نقد", card: "کارتخوان", card_to_card: "کارت به کارت", credit: "اعتبار", discount: "تخفیف", check: "چک" };
    if (currentPaidOrderEdit.payments.length === 0) {
      container.innerHTML = '<p class="text-xs text-stone-500 italic">هیچ پرداختی ثبت نشده است.</p>';
      return;
    }
    container.innerHTML = currentPaidOrderEdit.payments
      .map((p, index) => {
        let paymentText = `${methodLabels[p.method] || p.method}: ${formatCurrency(p.amount)}`;
        if (p.method === Constants.PAYMENT_TYPE_CREDIT && p.customerId) {
          const creditCustomer = localData.customers.find(
            (c) => c.id === p.customerId,
          );
          if (creditCustomer) {
            paymentText = `${methodLabels[p.method]} (${creditCustomer.name}): ${formatCurrency(p.amount)}`;
          }
        } else if ((p.method === Constants.PAYMENT_TYPE_CHECK || p.method === "check") && p.checkDate) {
          paymentText += ` (تاریخ چک: ${formatShamsiDate(p.checkDate)})`;
        }
        return `
          <div class="flex justify-between items-center bg-stone-700/50 p-2 rounded text-xs">
            <span>${paymentText}</span>
            <button type="button" class="text-red-400 hover:text-red-300 font-bold" onclick="removeEditPaidPayment(${index})">حذف</button>
          </div>
        `;
      })
      .join("");
  }

  window.removeEditPaidPayment = (index) => {
    if (!currentPaidOrderEdit) return;
    currentPaidOrderEdit.payments.splice(index, 1);
    recalculateEditPaidOrder();
  };

  function setupEditPaidOrderEventListeners() {
    const addBuffetBtn = getEl("edit-paid-add-buffet-btn");
    if (addBuffetBtn) {
      addBuffetBtn.onclick = () => {
        if (!currentPaidOrderEdit) return;
        const itemId = getEl("edit-paid-buffet-select").value;
        const qty = parseInt(getEl("edit-paid-buffet-qty").value) || 1;
        if (!itemId || qty <= 0) return;
        const buffetItem = localData.buffet.find((b) => b.id === itemId);
        if (!buffetItem) return;

        const existing = currentPaidOrderEdit.buffetItems.find((i) => i.id === itemId);
        if (existing) {
          existing.quantity += qty;
        } else {
          currentPaidOrderEdit.buffetItems.push({
            id: buffetItem.id,
            name: buffetItem.name,
            buyPrice: buffetItem.buyPrice,
            sellPrice: buffetItem.sellPrice,
            quantity: qty,
          });
        }
        recalculateEditPaidOrder();
      };
    }

    const defaultServiceSelect = getEl("edit-paid-default-service-select");
    if (defaultServiceSelect) {
      defaultServiceSelect.onchange = () => {
        const selectedOpt = defaultServiceSelect.options[defaultServiceSelect.selectedIndex];
        if (selectedOpt && selectedOpt.value) {
          getEl("edit-paid-service-desc").value = selectedOpt.dataset.desc || "";
          getEl("edit-paid-service-price").value = formatCurrency(selectedOpt.dataset.price || 0);
        }
      };
    }

    const addServiceBtn = getEl("edit-paid-add-service-btn");
    if (addServiceBtn) {
      addServiceBtn.onclick = () => {
        if (!currentPaidOrderEdit) return;
        const desc = getEl("edit-paid-service-desc").value.trim();
        const price = getNumericValue("edit-paid-service-price");
        if (!desc || price < 0) return;

        currentPaidOrderEdit.services.push({
          description: desc,
          price: price,
        });
        getEl("edit-paid-service-desc").value = "";
        getEl("edit-paid-service-price").value = "";
        getEl("edit-paid-default-service-select").value = "";
        recalculateEditPaidOrder();
      };
    }

    const paymentMethodSelect = getEl("edit-paid-payment-method");
    if (paymentMethodSelect) {
      paymentMethodSelect.onchange = () => {
        const method = paymentMethodSelect.value;
        const checkContainer = getEl("edit-paid-check-date-container");
        const creditContainer = getEl("edit-paid-credit-customer-container");
        if (checkContainer) checkContainer.classList.toggle("hidden", method !== "check");
        if (creditContainer) creditContainer.classList.toggle("hidden", method !== "credit");
      };
    }

    const creditSearchInput = getEl("edit-paid-credit-search");
    if (creditSearchInput) {
      creditSearchInput.oninput = () => {
        const term = creditSearchInput.value.toLowerCase().trim();
        const resultsEl = getEl("edit-paid-credit-results");
        if (!term) {
          resultsEl.innerHTML = "";
          return;
        }
        const matches = (localData.customers || []).filter((c) =>
          c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term))
        );
        resultsEl.innerHTML = matches
          .map(
            (c) =>
              `<div class="p-2 hover:bg-stone-700 cursor-pointer text-xs" onclick="selectEditPaidCreditCustomer('${c.id}', '${c.name.replace(/'/g, "\\'")}')">${c.name} (اعتبار: ${formatCurrency(c.balance || 0)})</div>`
          )
          .join("");
      };
    }

    const addPaymentBtn = getEl("edit-paid-add-payment-btn");
    if (addPaymentBtn) {
      addPaymentBtn.onclick = () => {
        if (!currentPaidOrderEdit) return;
        const method = getEl("edit-paid-payment-method").value;
        const amountInput = getEl("edit-paid-payment-amount");
        let amount = getNumericValue(amountInput);
        const errorEl = getEl("edit-paid-error");
        errorEl.classList.add("hidden");

        const paidTotal = currentPaidOrderEdit.payments.reduce(
          (sum, p) => sum + (Number(p.amount) || 0),
          0,
        );
        const remaining = currentPaidOrderEdit.totalAmount - paidTotal;

        if (isNaN(amount) || amount <= 0) {
          amount = remaining > 0 ? remaining : 0;
        }

        let paymentPart = { method, amount, timestamp: TimeService.nowDate() };

        if (method === "credit") {
          const customerId = currentPaidOrderEdit.creditCustomerId;
          if (!customerId) {
            errorEl.textContent = "لطفا یک مشتری برای پرداخت از اعتبار انتخاب کنید.";
            errorEl.classList.remove("hidden");
            return;
          }
          paymentPart.customerId = customerId;
        } else if (method === "check") {
          const checkDateVal = getEl("edit-paid-check-date").value;
          if (!checkDateVal) {
            errorEl.textContent = "لطفاً تاریخ چک را انتخاب کنید.";
            errorEl.classList.remove("hidden");
            return;
          }
          paymentPart.checkDate = checkDateVal;
        }

        currentPaidOrderEdit.payments.push(paymentPart);
        amountInput.value = "";
        recalculateEditPaidOrder();
      };
    }

    const checkDateDisplay = getEl("edit-paid-check-date-display");
    if (checkDateDisplay) {
      checkDateDisplay.onclick = () => {
        if (window.openShamsiDatepicker) {
          window.openShamsiDatepicker((selectedDateStr) => {
            getEl("edit-paid-check-date").value = selectedDateStr;
            checkDateDisplay.value = formatShamsiDate(selectedDateStr);
          });
        }
      };
    }

    const saveBtn = getEl("edit-paid-save-btn");
    if (saveBtn) {
      saveBtn.onclick = handleSavePaidOrder;
    }
  }

  window.selectEditPaidCreditCustomer = (id, name) => {
    if (!currentPaidOrderEdit) return;
    currentPaidOrderEdit.creditCustomerId = id;
    getEl("edit-paid-credit-search").value = name;
    getEl("edit-paid-credit-results").innerHTML = "";
  };

  async function handleSavePaidOrder() {
    if (!currentPaidOrderEdit || !currentPaidOrderEdit.order) return;

    recalculateEditPaidOrder();
    const paidTotal = currentPaidOrderEdit.payments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0,
    );
    const errorEl = getEl("edit-paid-error");
    errorEl.classList.add("hidden");

    if (paidTotal < currentPaidOrderEdit.totalAmount) {
      errorEl.textContent = `مجموع پرداخت‌ها (${formatCurrency(paidTotal)}) از مبلغ کل فاکتور (${formatCurrency(currentPaidOrderEdit.totalAmount)}) کمتر است.`;
      errorEl.classList.remove("hidden");
      return;
    }

    const discountPart = currentPaidOrderEdit.payments.find(p => p.method === "discount" || p.method === Constants.PAYMENT_TYPE_DISCOUNT);
    const discountAmount = discountPart ? Number(discountPart.amount) : 0;

    const orderData = {
      customerId: currentPaidOrderEdit.order.customerId,
      buffetItems: currentPaidOrderEdit.buffetItems,
      services: currentPaidOrderEdit.services,
      payments: currentPaidOrderEdit.payments,
      finalGameCost: currentPaidOrderEdit.finalGameCost,
      discountAmount: discountAmount,
      totalAmount: currentPaidOrderEdit.totalAmount,
    };

    showLoading();
    try {
      const response = await fetch(`${API_BASE}?action=update_paid_order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: currentPaidOrderEdit.order.id,
          orderData: orderData,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      closeModal("edit-paid-order-modal");
      showNotification(result.message || "فاکتور با موفقیت بروزرسانی شد.");
      await fetchAndRenderPage("reports", true);
      fetchAndRenderPage("orders", true).catch((e) => console.error(e));
      fetchAndRenderPage("customers", true).catch((e) => console.error(e));
      fetchAndRenderPage("buffet", true).catch((e) => console.error(e));
    } catch (error) {
      console.error("Failed to update paid order:", error);
      errorEl.textContent = "خطا در بروزرسانی فاکتور: " + error.message;
      errorEl.classList.remove("hidden");
    } finally {
      hideLoading();
    }
  }

  window.deleteOrder = (id) => {
    if (!hasPermission(PERMISSIONS.DELETE_ORDERS)) return;
    showConfirmation(
      "آیا از حذف این فاکتور مطمئن هستید؟ تمام موارد (اعتبار مشتری، موجودی بوفه) به حالت قبل بازمی‌گردد.",
      async () => {
        showLoading();
        try {
          const result = await api.deleteItem("orders", id);
          showNotification(
            result.message ||
              "فاکتور با موفقیت حذف و موارد مربوطه بازگردانی شد.",
          );

          await fetchAndRenderPage("orders", true);
          fetchAndRenderPage("customers", true).catch((e) => console.error(e));
          fetchAndRenderPage("buffet", true).catch((e) => console.error(e));
          fetchAndRenderPage("reports", true).catch((e) => console.error(e));
        } catch (error) {
          console.error("Failed to delete order:", error);
          showNotification("خطا در حذف فاکتور: " + error.message, true);
          await fetchAndRenderPage("orders", true);
        } finally {
          hideLoading();
        }
      },
    );
  };

  async function handleNewExpense(e) {
    e.preventDefault();
    const newExpense = {
      id: generateId(),
      type: "expense", // Differentiate from checks
      title: getEl("expense-title").value,
      amount: getNumericValue("expense-amount"),
      category: getEl("expense-category").value,
      paymentMethod: getEl("expense-payment-method").value,
      description: getEl("expense-description").value,
    };

    if (!newExpense.title || newExpense.amount <= 0) {
      showNotification("لطفا عنوان و مبلغ معتبر وارد کنید.", true);
      return;
    }

    showLoading();
    try {
      await api.createItem("expenses", newExpense);
      e.target.reset();
      showNotification("هزینه با موفقیت ثبت شد.");
      await fetchAndRenderPage("expenses", true);
      fetchAndRenderPage("reports", true).catch((e) =>
        console.error("background reports refetch failed", e),
      );
    } catch (error) {
      console.error("Failed to create expense:", error);
      showNotification("خطا در ثبت هزینه.", true);
      await fetchAndRenderPage("expenses", true);
    } finally {
      hideLoading();
    }
  }

  async function handleNewCheck(e) {
    e.preventDefault();
    const dueDateValue = getEl("check-due-date").value;
    if (!dueDateValue) {
      showNotification("لطفا تاریخ سررسید چک را مشخص کنید.", true);
      return;
    }

    const newCheck = {
      id: generateId(),
      type: "check", // Differentiate from expenses
      title: getEl("check-title").value,
      amount: getNumericValue("check-amount"),
      description: getEl("check-description").value,
      dueDate: dueDateValue,
      status: "pending", // Initial status
    };

    if (!newCheck.title || newCheck.amount <= 0) {
      showNotification("لطفا عنوان و مبلغ معتبر وارد کنید.", true);
      return;
    }

    showLoading();
    try {
      await api.createItem("expenses", newCheck);
      e.target.reset();
      getEl("check-due-date-display").value = "";
      getEl("check-due-date").value = "";
      showNotification("چک با موفقیت ثبت شد.");
      await fetchAndRenderPage("expenses", true);
    } catch (error) {
      console.error("Failed to create check:", error);
      showNotification("خطا در ثبت چک.", true);
      await fetchAndRenderPage("expenses", true);
    } finally {
      hideLoading();
    }
  }

  window.deleteExpense = (id) => {
    if (!hasPermission(PERMISSIONS.MANAGE_EXPENSES)) return;
    showConfirmation("آیا از حذف این هزینه مطمئن هستید؟", async () => {
      showLoading();
      try {
        await api.deleteItem("expenses", id);
        showNotification("هزینه حذف شد.");
        await fetchAndRenderPage("expenses", true);
        fetchAndRenderPage("reports", true).catch((e) =>
          console.error("background reports refetch failed", e),
        );
      } catch (error) {
        console.error("Failed to delete expense:", error);
        showNotification("خطا در حذف هزینه.", true);
        await fetchAndRenderPage("expenses", true);
      } finally {
        hideLoading();
      }
    });
  };

  // [NEW] Settle check functions
  window.openSettleCheckModal = (checkId) => {
    const check = localData.expenses.find(
      (e) => e.id === checkId && e.type === "check",
    );
    if (!check) return;

    getEl("settle-check-id").value = check.id;
    getEl("settle-check-title").textContent = check.title;
    getEl("settle-check-amount").textContent = formatCurrency(check.amount);
    openModal("settle-check-modal");
  };

  async function handleSettleCheck(e) {
    e.preventDefault();
    const checkId = getEl("settle-check-id").value;
    const paymentMethod = getEl("settle-check-payment-method").value;

    const checkIndex = localData.expenses.findIndex((e) => e.id === checkId);
    if (checkIndex === -1) return;

    const originalCheck = localData.expenses[checkIndex];

    // Convert the check to a normal expense
    const settledExpense = {
      ...originalCheck,
      type: "expense",
      status: Constants.ORDER_STATUS_PAID,
      paymentMethod: paymentMethod,
      category: "پرداخت چک", // Assign a specific category
      paidAt: TimeService.nowString(),
    };

    showLoading();
    try {
      await api.updateItem("expenses", checkId, settledExpense);
      closeModal("settle-check-modal");
      showNotification("چک با موفقیت پرداخت و به هزینه‌ها منتقل شد.");
      await fetchAndRenderPage("expenses", true);
      fetchAndRenderPage("reports", true).catch((e) =>
        console.error("background reports refetch failed", e),
      );
    } catch (error) {
      console.error("Failed to settle check:", error);
      showNotification("خطا در پرداخت چک.", true);
      await fetchAndRenderPage("expenses", true);
    } finally {
      hideLoading();
    }
  }

  // [RE-IMPLEMENTED] Expense/Check Edit Functions
  window.openEditExpenseModal = (id) => {
    if (!hasPermission(PERMISSIONS.MANAGE_EXPENSES)) return;
    const expense = localData.expenses.find((e) => e.id === id);
    if (!expense) {
      showNotification(
        "خطا: مورد برای ویرایش یافت نشد. لطفا صفحه را رفرش کنید.",
        true,
      );
      return;
    }

    const expenseFields = getEl("edit-expense-fields");
    const checkFields = getEl("edit-check-fields");

    getEl("edit-expense-id").value = expense.id;
    getEl("edit-expense-type").value = expense.type;
    getEl("edit-expense-title").value = expense.title;
    getEl("edit-expense-amount").value = expense.amount;
    getEl("edit-expense-description").value = expense.description || "";
    formatCurrencyInput({ target: getEl("edit-expense-amount") });

    if (expense.type === "expense") {
      getEl("edit-expense-modal-title").textContent = "ویرایش هزینه";
      expenseFields.classList.remove("hidden");
      checkFields.classList.add("hidden");
      getEl("edit-expense-category").value = expense.category || "سایر";
      getEl("edit-expense-payment-method").value =
        expense.paymentMethod || "سایر";
    } else {
      // type === 'check'
      getEl("edit-expense-modal-title").textContent = "ویرایش چک";
      expenseFields.classList.add("hidden");
      checkFields.classList.remove("hidden");
      if (expense.dueDate) {
        getEl("edit-expense-due-date-display").value = formatShamsiDate(
          expense.dueDate,
        );
        getEl("edit-expense-due-date").value = moment(expense.dueDate).format(
          "YYYY-MM-DD",
        );
      } else {
        getEl("edit-expense-due-date-display").value = "";
        getEl("edit-expense-due-date").value = "";
      }
    }
    openModal("edit-expense-modal");
  };

  async function handleEditExpense(e) {
    e.preventDefault();
    const id = getEl("edit-expense-id").value;
    const type = getEl("edit-expense-type").value;

    const expenseIndex = localData.expenses.findIndex((e) => e.id === id);
    if (expenseIndex === -1) {
      showNotification("خطا: مورد یافت نشد.", true);
      return;
    }

    const originalExpense = localData.expenses[expenseIndex];
    const updatedExpense = {
      ...originalExpense,
      title: getEl("edit-expense-title").value,
      amount: getNumericValue("edit-expense-amount"),
      description: getEl("edit-expense-description").value,
    };

    if (type === "expense") {
      updatedExpense.category = getEl("edit-expense-category").value;
      updatedExpense.paymentMethod = getEl("edit-expense-payment-method").value;
    } else {
      // type === 'check'
      const dueDateValue = getEl("edit-expense-due-date").value;
      updatedExpense.dueDate = dueDateValue
        ? moment(dueDateValue, "YYYY-MM-DD").toDate()
        : originalExpense.dueDate;
    }

    showLoading();
    try {
      await api.updateItem("expenses", id, updatedExpense);
      closeModal("edit-expense-modal");
      showNotification("مورد با موفقیت ویرایش شد.");
      await fetchAndRenderPage("expenses", true);
      fetchAndRenderPage("reports", true).catch((e) =>
        console.error("background reports refetch failed", e),
      );
    } catch (error) {
      console.error("Failed to edit expense:", error);
      if (error.status === 409) {
        showNotification(
          "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
          true,
        );
      } else {
        showNotification("خطا در ویرایش مورد.", true);
      }
      await fetchAndRenderPage("expenses", true);
    } finally {
      hideLoading();
    }
  }

  // --- Secretary Log Functions ---
  function setupSecretaryForm() {
    const manualCard = getEl("manual-secretary-log-card");
    if (
      currentUser?.isAdmin ||
      hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS)
    ) {
      manualCard?.classList.remove("hidden");
      const userSelect = getEl("secretary-log-user");
      // Populate user dropdown
      if (userSelect && userSelect.innerHTML === "") {
        userSelect.innerHTML = localData.users
          .filter((u) => !u.isAdmin)
          .map((user) => `<option value="${user.id}">${user.username}</option>`)
          .join("");
      }
    } else {
      manualCard?.classList.add("hidden");
    }
  }

  function renderSecretaryArchive() {
    const container = getEl("secretary-archive-container");
    if (!localData.secretary_log) localData.secretary_log = [];
    const showSalaryAmounts =
      currentUser?.isAdmin || hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS);
    const accessibleLogs =
      !currentUser?.isAdmin && !hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS)
        ? localData.secretary_log.filter(
            (log) => log.status === Constants.LOG_STATUS_PAID && log.user_id === currentUser.id,
          )
        : localData.secretary_log.filter((log) => log.status === Constants.LOG_STATUS_PAID);

    const groupedByMonth = accessibleLogs.reduce((acc, log) => {
      const user = localData.users.find((u) => u.id === log.user_id);
      if (!user) return acc;

      const monthKey = moment(log.date).format("jYYYY/jMM");
      const userMonthKey = `${log.user_id}|${monthKey}`;

      if (!acc[userMonthKey]) {
        acc[userMonthKey] = {
          userId: log.user_id,
          userName: user.username,
          monthKey: monthKey,
          monthName: moment(log.date).format("jMMMM jYYYY"),
          baseAmount: 0,
          totalBonus: 0,
          totalFine: 0,
          finalAmount: 0,
          logCount: 0,
        };
      }
      const bAmount = Number(log.amount) || 0;
      const bonus = Number(log.bonus) || 0;
      const fine = Number(log.fine) || 0;

      acc[userMonthKey].baseAmount += bAmount;
      acc[userMonthKey].totalBonus += bonus;
      acc[userMonthKey].totalFine += fine;
      acc[userMonthKey].finalAmount += (bAmount + bonus - fine);
      acc[userMonthKey].logCount++;
      return acc;
    }, {});

    const sortedGroups = Object.values(groupedByMonth).sort(
      (a, b) =>
        b.monthKey.localeCompare(a.monthKey) ||
        a.userName.localeCompare(b.userName),
    );

    if (sortedGroups.length === 0) {
      container.innerHTML =
        '<p class="text-center text-stone-400">هیچ کارکرد تسویه شده‌ای برای نمایش وجود ندارد.</p>';
      return;
    }

    container.innerHTML = sortedGroups
      .map(
        (group) => `
                <div class="p-3 bg-stone-900 rounded-lg">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-2">
                        <div>
                            <p class="font-bold text-white">${group.userName} - ${group.monthName}</p>
                            <div class="text-sm">
                                ${
                                  showSalaryAmounts
                                    ? `
                                    <p class="text-green-400 font-bold">
                                      مبلغ دریافتی: ${formatCurrency(group.finalAmount)} (${group.logCount} رکورد)
                                    </p>
                                    ${
                                      group.totalBonus > 0 || group.totalFine > 0
                                        ? `<p class="text-xs text-stone-400">پایه: ${formatCurrency(group.baseAmount)} ${group.totalBonus > 0 ? `| پاداش: +${formatCurrency(group.totalBonus)}` : ""} ${group.totalFine > 0 ? `| جریمه: -${formatCurrency(group.totalFine)}` : ""}</p>`
                                        : ""
                                    }
                                  `
                                    : `<p class="text-stone-400">${group.logCount} رکورد</p>`
                                }
                            </div>
                        </div>
                        <div class="flex items-center gap-x-2">
                            <button onclick="showSecretaryLogDetails('${group.userId}', '${group.monthKey}', 'paid')" class="btn btn-secondary btn-sm">مشاهده جزئیات</button>
                            ${hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS) ? `<button onclick="deleteMonthlyArchiveLogs('${group.userId}', '${group.monthKey}')" class="btn btn-danger btn-sm">حذف</button>` : ""}
                        </div>
                    </div>
                </div>
            `,
      )
      .join("");
  }

  function renderSecretaryMonthlySummary() {
    const container = getEl("secretary-summary-container");
    getEl("secretary-detail-view").classList.add("hidden"); // Hide detail view by default
    if (!localData.secretary_log) localData.secretary_log = [];

    const accessibleLogs =
      !currentUser?.isAdmin && !hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS)
        ? localData.secretary_log.filter(
            (log) =>
              (log.status || "unpaid") === "unpaid" &&
              log.user_id === currentUser.id,
          )
        : localData.secretary_log.filter(
            (log) => (log.status || "unpaid") === "unpaid",
          );

    const groupedByMonth = accessibleLogs.reduce((acc, log) => {
      const user = localData.users.find((u) => u.id === log.user_id);
      if (!user) return acc;

      const monthKey = moment(log.date).format("jYYYY/jMM");
      const userMonthKey = `${log.user_id}|${monthKey}`;

      if (!acc[userMonthKey]) {
        acc[userMonthKey] = {
          userId: log.user_id,
          userName: user.username,
          monthKey: monthKey,
          monthName: moment(log.date).format("jMMMM jYYYY"),
          baseAmount: 0,
          totalBonus: 0,
          totalFine: 0,
          finalAmount: 0,
          logs: [],
        };
      }
      const bAmount = Number(log.amount) || 0;
      const bonus = Number(log.bonus) || 0;
      const fine = Number(log.fine) || 0;

      acc[userMonthKey].baseAmount += bAmount;
      acc[userMonthKey].totalBonus += bonus;
      acc[userMonthKey].totalFine += fine;
      acc[userMonthKey].finalAmount += (bAmount + bonus - fine);
      acc[userMonthKey].logs.push(log);
      return acc;
    }, {});

    const sortedGroups = Object.values(groupedByMonth).sort(
      (a, b) =>
        a.monthKey.localeCompare(b.monthKey) ||
        a.userName.localeCompare(b.userName),
    );

    if (sortedGroups.length === 0) {
      container.innerHTML =
        '<p class="text-center text-stone-400">هیچ کارکرد پرداخت نشده‌ای برای نمایش وجود ندارد.</p>';
      return;
    }

    const showSalaryAmounts =
      currentUser?.isAdmin || hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS);
    container.innerHTML = sortedGroups
      .map(
        (group) => `
                <div class="p-3 bg-stone-800 rounded-lg">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-2">
                        <div>
                            <p class="font-bold text-white">${group.userName} - ${group.monthName}</p>
                            ${
                              showSalaryAmounts
                                ? `
                                <div class="text-sm">
                                  <p class="text-amber-400 font-bold">
                                    حقوق قابل پرداخت: ${formatCurrency(group.finalAmount)}
                                  </p>
                                  <p class="text-xs text-stone-400">
                                    پایه: ${formatCurrency(group.baseAmount)}
                                    ${group.totalBonus > 0 ? `<span class="text-emerald-400 font-medium"> | پاداش: +${formatCurrency(group.totalBonus)}</span>` : ""}
                                    ${group.totalFine > 0 ? `<span class="text-rose-400 font-medium"> | جریمه: -${formatCurrency(group.totalFine)}</span>` : ""}
                                  </p>
                                </div>
                            `
                                : ""
                            }
                        </div>
                        <div class="flex items-center gap-x-2">
                            <button onclick="showSecretaryLogDetails('${group.userId}', '${group.monthKey}')" class="btn btn-secondary btn-sm">مشاهده جزئیات</button>
                            ${hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS) ? `<button onclick="settleMonthlyLogs('${group.userId}', '${group.monthKey}')" class="btn btn-primary btn-sm">تسویه این ماه</button>` : ""}
                        </div>
                    </div>
                </div>
            `,
      )
      .join("");
  }

  window.showSecretaryLogDetails = function (userId, monthKey, statusFilter = "unpaid") {
    if (
      !currentUser?.isAdmin &&
      !hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS) &&
      userId !== currentUser.id
    ) {
      showNotification("شما فقط می‌توانید کارکرد خودتان را مشاهده کنید.", true);
      return;
    }
    const user = localData.users.find((u) => u.id === userId);
    const monthName = moment(monthKey, "jYYYY/jMM").format("jMMMM jYYYY");

    const statusLabel = statusFilter === "paid" ? " (تسویه شده)" : "";
    getEl("secretary-detail-title").textContent =
      `جزئیات کارکرد برای ${user.username} - ${monthName}${statusLabel}`;

    const logsToShow = localData.secretary_log.filter(
      (log) =>
        log.user_id === userId &&
        moment(log.date).format("jYYYY/jMM") === monthKey &&
        (statusFilter === "paid"
          ? log.status === Constants.LOG_STATUS_PAID
          : (log.status || "unpaid") === "unpaid"),
    );

    const showSalaryAmounts =
      currentUser?.isAdmin || hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS);
    const detailTableBody = getEl("secretary-detail-table");

    // Update sort indicators in Secretary detail table headers to default: date asc
    if (detailTableBody) {
      const table = detailTableBody.closest("table");
      if (table) {
        table.querySelectorAll(".sortable-header").forEach((header) => {
          header.classList.remove("sorted-asc", "sorted-desc");
          delete header.dataset.currentOrder;
          if (header.dataset.sort === "date") {
            header.classList.add("sorted-asc");
            header.dataset.currentOrder = "asc";
          }
        });
      }
    }

    // Sort logsToShow by date and clock_in ascending
    const sortedLogs = [...logsToShow].sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      return (a.clock_in || "").localeCompare(b.clock_in || "");
    });

    detailTableBody.innerHTML = sortedLogs
      .map(
        (log) => {
          const bonusVal = Number(log.bonus) || 0;
          const fineVal = Number(log.fine) || 0;

          let bonusFineHtml = "";
          if (showSalaryAmounts) {
            const parts = [];
            if (bonusVal > 0) {
              parts.push(`
                <div class="flex items-center justify-between gap-2 text-xs bg-emerald-900/40 text-emerald-300 px-2 py-1 rounded border border-emerald-700/50">
                  <div>
                    <span class="font-bold">پاداش: +${formatCurrency(bonusVal)}</span>
                    ${log.bonus_description ? `<p class="text-[11px] text-emerald-400">${log.bonus_description}</p>` : ""}
                  </div>
                  ${hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS) ? `
                    <div class="flex items-center gap-1">
                      <button onclick="openSecretaryBonusModal('${log.id}')" title="ویرایش پاداش" class="text-emerald-300 hover:text-white">✏️</button>
                      <button onclick="deleteSecretaryBonus('${log.id}')" title="حذف پاداش" class="text-red-400 hover:text-red-200">❌</button>
                    </div>
                  ` : ""}
                </div>
              `);
            }
            if (fineVal > 0) {
              parts.push(`
                <div class="flex items-center justify-between gap-2 text-xs bg-rose-900/40 text-rose-300 px-2 py-1 rounded border border-rose-700/50">
                  <div>
                    <span class="font-bold">جریمه: -${formatCurrency(fineVal)}</span>
                    ${log.fine_description ? `<p class="text-[11px] text-rose-400">${log.fine_description}</p>` : ""}
                  </div>
                  ${hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS) ? `
                    <div class="flex items-center gap-1">
                      <button onclick="openSecretaryFineModal('${log.id}')" title="ویرایش جریمه" class="text-rose-300 hover:text-white">✏️</button>
                      <button onclick="deleteSecretaryFine('${log.id}')" title="حذف جریمه" class="text-red-400 hover:text-red-200">❌</button>
                    </div>
                  ` : ""}
                </div>
              `);
            }

            if (parts.length === 0) {
              bonusFineHtml = '<span class="text-stone-500">---</span>';
            } else {
              bonusFineHtml = `<div class="flex flex-col gap-1">${parts.join("")}</div>`;
            }
          } else {
            bonusFineHtml = '<span class="text-stone-500">مخفی</span>';
          }

          return `
                <tr class="border-b border-stone-700 hover:bg-stone-800">
                    <td class="px-4 py-2">${formatShamsiDate(log.date)}</td>
                    <td class="px-4 py-2">${moment(log.date).format("dddd")}</td>
                    <td class="px-4 py-2">${log.clock_in}</td>
                    <td class="px-4 py-2">${log.clock_out}</td>
                    <td class="px-4 py-2">${Math.floor(log.duration_minutes / 60)}h ${log.duration_minutes % 60}m</td>
                    <td class="px-4 py-2 font-bold ${showSalaryAmounts ? "text-amber-400" : "text-stone-400"}">${showSalaryAmounts ? formatCurrency(log.amount) : "مخفی"}</td>
                    <td class="px-4 py-2">${bonusFineHtml}</td>
                    <td class="px-4 py-2 text-stone-300">${log.description || "---"}</td>
                    <td class="px-4 py-2 text-center">
                        <div class="flex items-center justify-center gap-x-2">
                            ${
                              hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS)
                                ? statusFilter === "paid"
                                  ? `
                                  <button onclick="openEditSecretaryLogModal('${log.id}')" title="ویرایش کارکرد" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                                  <button onclick="deleteSecretaryLog('${log.id}')" title="حذف کارکرد" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                                `
                                  : `
                                  <button onclick="openSecretaryBonusModal('${log.id}')" class="btn btn-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold" title="افزودن/ویرایش پاداش">➕ پاداش</button>
                                  <button onclick="openSecretaryFineModal('${log.id}')" class="btn btn-xs bg-rose-600 hover:bg-rose-500 text-white font-bold" title="افزودن/ویرایش جریمه">➖ جریمه</button>
                                  <button onclick="openEditSecretaryLogModal('${log.id}')" title="ویرایش کارکرد" class="icon-btn text-blue-400 hover:text-blue-300">${ICONS.pencil}</button>
                                  <button onclick="deleteSecretaryLog('${log.id}')" title="حذف کارکرد" class="icon-btn text-red-400 hover:text-red-300">${ICONS.trash}</button>
                                `
                                : ""
                            }
                        </div>
                    </td>
                </tr>
            `;
        },
      )
      .join("");

    getEl("secretary-detail-view").classList.remove("hidden");
  };

  window.deleteMonthlyArchiveLogs = async function (userId, monthKey) {
    const user = localData.users.find((u) => u.id === userId);
    if (!user) return;
    const monthName = moment(monthKey, "jYYYY/jMM").format("jMMMM jYYYY");

    showConfirmation(
      `آیا از حذف آرشیو تسویه حساب ${user.username} برای ${monthName} مطمئن هستید؟ (تمام رکوردهای این ماه حذف خواهند شد)`,
      async () => {
        const logsToDelete = localData.secretary_log.filter(
          (log) =>
            log.user_id === userId &&
            moment(log.date).format("jYYYY/jMM") === monthKey &&
            log.status === Constants.LOG_STATUS_PAID,
        );

        if (logsToDelete.length === 0) {
          showNotification("هیچ رکوردی برای حذف یافت نشد.", true);
          return;
        }

        showLoading();
        try {
          const deletePromises = logsToDelete.map((log) =>
            api.deleteItem("secretary_log", log.id),
          );

          await Promise.all(deletePromises);

          showNotification(`آرشیو کارکرد ${user.username} برای ${monthName} با موفقیت حذف شد.`);
          await fetchAndRenderPage("secretary", true);
        } catch (error) {
          console.error("Failed to delete monthly archive logs:", error);
          showNotification(
            "خطا در حذف آرشیو تسویه حساب. لطفا دوباره تلاش کنید.",
            true,
          );
          await fetchAndRenderPage("secretary", true);
        } finally {
          hideLoading();
        }
      },
      "بله، حذف کن",
      "انصراف",
    );
  };

  window.settleMonthlyLogs = async function (userId, monthKey) {
    const user = localData.users.find((u) => u.id === userId);
    if (!user) return;
    const monthName = moment(monthKey, "jYYYY/jMM").format("jMMMM jYYYY");

    showConfirmation(
      `آیا از تسویه حساب تمام کارکردهای ${user.username} برای ${monthName} مطمئن هستید؟`,
      async () => {
        const logsToUpdate = localData.secretary_log.filter(
          (log) =>
            log.user_id === userId &&
            moment(log.date).format("jYYYY/jMM") === monthKey &&
            (log.status || "unpaid") === "unpaid",
        );

        if (logsToUpdate.length === 0) {
          showNotification("هیچ رکوردی برای تسویه یافت نشد.", true);
          return;
        }

        showLoading();
        try {
          const updatePromises = logsToUpdate.map((log) => {
            const updatedLog = { ...log, status: Constants.LOG_STATUS_PAID };
            return api.updateItem("secretary_log", log.id, updatedLog);
          });

          await Promise.all(updatePromises);

          showNotification(`تسویه حساب برای ${monthName} با موفقیت انجام شد.`);
          await fetchAndRenderPage("secretary", true);
        } catch (error) {
          console.error("Failed to settle monthly logs:", error);
          showNotification(
            "خطا در تسویه حساب ماهانه. لطفا دوباره تلاش کنید.",
            true,
          );
          await fetchAndRenderPage("secretary", true);
        } finally {
          hideLoading();
        }
      },
      "بله، تسویه کن",
      "انصراف",
    );
  };

  async function handleNewSecretaryLog(e) {
    e.preventDefault();
    const userId = hasPermission(PERMISSIONS.MANAGE_SECRETARY_LOGS)
      ? getEl("secretary-log-user").value
      : currentUser.id;
    const date = getEl("secretary-log-date").value;
    const clockIn = getEl("secretary-log-clock-in").value;
    const clockOut = getEl("secretary-log-clock-out").value;

    if (!userId || !date || !clockIn || !clockOut) {
      showNotification("لطفا تمام فیلدهای تاریخ و ساعت را پر کنید.", true);
      return;
    }

    const user = localData.users.find((u) => u.id === userId);
    if (!user || !user.hourly_rate || user.hourly_rate <= 0) {
      showNotification(
        "نرخ ساعتی برای منشی انتخاب شده ثبت نشده است. لطفا از بخش تنظیمات اقدام کنید.",
        true,
      );
      return;
    }

    const start = moment(`${date} ${clockIn}`);
    const end = moment(`${date} ${clockOut}`);

    if (end.isBefore(start)) {
      end.add(1, "day"); // Handle overnight shifts
    }

    const durationMinutes = end.diff(start, "minutes");
    if (durationMinutes <= 0) {
      showNotification("ساعت خروج باید بعد از ساعت ورود باشد.", true);
      return;
    }

    const amount = Math.round(((durationMinutes / 60) * user.hourly_rate) / 1000) * 1000;
    // Build the secretary log object expected by the server
    const newLog = {
      id: generateId(),
      user_id: userId,
      date: date,
      clock_in: clockIn,
      clock_out: clockOut,
      duration_minutes: durationMinutes,
      amount: amount,
      description: getEl("secretary-log-description").value || "",
      status: "unpaid",
    };

    showLoading();
    try {
      await api.createItem("secretary_log", newLog);
      getEl("secretary-log-date").value = "";
      getEl("secretary-log-clock-in").value = "";
      getEl("secretary-log-clock-out").value = "";
      getEl("secretary-log-description").value = "";
      showNotification("کارکرد با موفقیت ثبت شد.");
      await fetchAndRenderPage("secretary", true);
    } catch (error) {
      console.error("Failed to create secretary log:", error);
      showNotification("خطا در ثبت کارکرد.", true);
      await fetchAndRenderPage("secretary", true);
    } finally {
      hideLoading();
    }
  }

  window.deleteSecretaryLog = (id) => {
    showConfirmation("آیا از حذف این رکورد کارکرد مطمئن هستید؟", async () => {
      showLoading();
      try {
        await api.deleteItem("secretary_log", id);
        showNotification("رکورد حذف شد.");
        await fetchAndRenderPage("secretary", true);
      } catch (error) {
        console.error("Failed to delete secretary log:", error);
        showNotification("خطا در حذف رکورد.", true);
        await fetchAndRenderPage("secretary", true);
      } finally {
        hideLoading();
      }
    });
  };

  window.openSecretaryBonusModal = (logId) => {
    const log = localData.secretary_log.find((l) => l.id === logId);
    if (!log) return;

    getEl("secretary-bonus-log-id").value = log.id;
    getEl("secretary-bonus-amount").value = log.bonus || "";
    getEl("secretary-bonus-description").value = log.bonus_description || "";

    openModal("secretary-bonus-modal");
  };

  window.openSecretaryFineModal = (logId) => {
    const log = localData.secretary_log.find((l) => l.id === logId);
    if (!log) return;

    getEl("secretary-fine-log-id").value = log.id;
    getEl("secretary-fine-amount").value = log.fine || "";
    getEl("secretary-fine-description").value = log.fine_description || "";

    openModal("secretary-fine-modal");
  };

  async function handleSaveSecretaryBonus(e) {
    e.preventDefault();
    const logId = getEl("secretary-bonus-log-id").value;
    const log = localData.secretary_log.find((l) => l.id === logId);
    if (!log) return;

    const amount = parseFloat(getEl("secretary-bonus-amount").value) || 0;
    const description = getEl("secretary-bonus-description").value.trim();

    const updatedLog = {
      ...log,
      bonus: amount,
      bonus_description: description,
    };

    showLoading();
    try {
      await api.updateItem("secretary_log", logId, updatedLog);
      closeModal("secretary-bonus-modal");
      showNotification("پاداش با موفقیت ثبت شد.");
      await fetchAndRenderPage("secretary", true);
    } catch (error) {
      console.error("Failed to save secretary bonus:", error);
      showNotification("خطا در ثبت پاداش.", true);
      await fetchAndRenderPage("secretary", true);
    } finally {
      hideLoading();
    }
  }

  async function handleSaveSecretaryFine(e) {
    e.preventDefault();
    const logId = getEl("secretary-fine-log-id").value;
    const log = localData.secretary_log.find((l) => l.id === logId);
    if (!log) return;

    const amount = parseFloat(getEl("secretary-fine-amount").value) || 0;
    const description = getEl("secretary-fine-description").value.trim();

    const updatedLog = {
      ...log,
      fine: amount,
      fine_description: description,
    };

    showLoading();
    try {
      await api.updateItem("secretary_log", logId, updatedLog);
      closeModal("secretary-fine-modal");
      showNotification("جریمه با موفقیت ثبت شد.");
      await fetchAndRenderPage("secretary", true);
    } catch (error) {
      console.error("Failed to save secretary fine:", error);
      showNotification("خطا در ثبت جریمه.", true);
      await fetchAndRenderPage("secretary", true);
    } finally {
      hideLoading();
    }
  }

  window.deleteSecretaryBonus = (logId) => {
    const log = localData.secretary_log.find((l) => l.id === logId);
    if (!log) return;

    showConfirmation("آیا از حذف پاداش این رکورد مطمئن هستید؟", async () => {
      const updatedLog = {
        ...log,
        bonus: 0,
        bonus_description: "",
      };

      showLoading();
      try {
        await api.updateItem("secretary_log", logId, updatedLog);
        showNotification("پاداش حذف شد.");
        await fetchAndRenderPage("secretary", true);
      } catch (error) {
        console.error("Failed to delete secretary bonus:", error);
        showNotification("خطا در حذف پاداش.", true);
        await fetchAndRenderPage("secretary", true);
      } finally {
        hideLoading();
      }
    });
  };

  window.deleteSecretaryFine = (logId) => {
    const log = localData.secretary_log.find((l) => l.id === logId);
    if (!log) return;

    showConfirmation("آیا از حذف جریمه این رکورد مطمئن هستید؟", async () => {
      const updatedLog = {
        ...log,
        fine: 0,
        fine_description: "",
      };

      showLoading();
      try {
        await api.updateItem("secretary_log", logId, updatedLog);
        showNotification("جریمه حذف شد.");
        await fetchAndRenderPage("secretary", true);
      } catch (error) {
        console.error("Failed to delete secretary fine:", error);
        showNotification("خطا در حذف جریمه.", true);
        await fetchAndRenderPage("secretary", true);
      } finally {
        hideLoading();
      }
    });
  };

  window.openEditSecretaryLogModal = (logId) => {
    const log = localData.secretary_log.find((l) => l.id === logId);
    if (!log) return;

    getEl("edit-secretary-log-id").value = log.id;
    getEl("edit-secretary-log-date-display").value = formatShamsiDate(log.date);
    getEl("edit-secretary-log-date").value = moment(log.date).format(
      "YYYY-MM-DD",
    );
    getEl("edit-secretary-log-clock-in").value = log.clock_in;
    getEl("edit-secretary-log-clock-out").value = log.clock_out;

    openModal("edit-secretary-log-modal");
  };

  async function handleEditSecretaryLog(e) {
    e.preventDefault();
    const logId = getEl("edit-secretary-log-id").value;
    const logIndex = localData.secretary_log.findIndex((l) => l.id === logId);
    if (logIndex === -1) return;

    const originalLog = localData.secretary_log[logIndex];
    const user = localData.users.find((u) => u.id === originalLog.user_id);
    if (!user) return;

    const date = getEl("edit-secretary-log-date").value;
    const clockIn = getEl("edit-secretary-log-clock-in").value;
    const clockOut = getEl("edit-secretary-log-clock-out").value;

    const start = moment(`${date} ${clockIn}`);
    const end = moment(`${date} ${clockOut}`);

    if (end.isBefore(start)) {
      end.add(1, "day");
    }

    const durationMinutes = end.diff(start, "minutes");
    if (durationMinutes <= 0) {
      showNotification("ساعت خروج باید بعد از ساعت ورود باشد.", true);
      return;
    }

    const amount = Math.round(((durationMinutes / 60) * user.hourly_rate) / 1000) * 1000;

    const updatedLog = {
      ...originalLog,
      date: start.format("YYYY-MM-DD"),
      clock_in: clockIn,
      clock_out: clockOut,
      duration_minutes: durationMinutes,
      amount: amount,
    };

    showLoading();
    try {
      await api.updateItem("secretary_log", logId, updatedLog);
      closeModal("edit-secretary-log-modal");
      showNotification("کارکرد با موفقیت ویرایش شد.");
      await fetchAndRenderPage("secretary", true);
    } catch (error) {
      console.error("Failed to edit secretary log:", error);
      showNotification("خطا در ویرایش کارکرد.", true);
      await fetchAndRenderPage("secretary", true);
    } finally {
      hideLoading();
    }
  }

  window.openAddBuffetToOrderModal = (orderId) => {
    getEl("add-buffet-order-id").value = orderId;
    const select = getEl("buffet-item-select");
    select.innerHTML = localData.buffet
      .filter((i) => i.stock > 0)
      .map(
        (item) =>
          `<option value="${item.id}">${item.name} (${formatCurrency(item.sellPrice)}) - موجودی: ${item.stock}</option>`,
      )
      .join("");
    openModal("add-buffet-to-order-modal");
  };

  async function handleAddBuffetToOrder(e) {
    e.preventDefault();
    const orderId = getEl("add-buffet-order-id").value;
    const itemId = getEl("buffet-item-select").value;
    const quantity = parseInt(getEl("buffet-item-quantity").value) || 1;

    if (!orderId || !itemId || quantity <= 0) return;

    showLoading();
    try {
      const response = await fetch(`${API_BASE}?action=add_buffet_to_order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, itemId, quantity }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      closeModal("add-buffet-to-order-modal");
      showNotification(result.message);
      await fetchAndRenderPage("orders", true);
      fetchAndRenderPage("buffet", true).catch((e) => console.error(e));
    } catch (error) {
      console.error("Failed to add buffet to order:", error);
      showNotification("خطا در افزودن به بوفه: " + error.message, true);
    } finally {
      hideLoading();
    }
  }

  window.openAddServiceModal = (orderId) => {
    const form = getEl("add-service-form");
    form.reset();
    getEl("add-service-order-id").value = orderId;
    const select = getEl("default-service-select");
    select.innerHTML =
      '<option value="">--- انتخاب کنید یا دستی وارد کنید ---</option>' +
      localData.defaultServices
        .map(
          (s) =>
            `<option value="${s.id}">${s.description} - ${formatCurrency(s.price)}</option>`,
        )
        .join("");
    openModal("add-service-modal");
  };

  async function handleAddService(e) {
    e.preventDefault();
    const orderId = getEl("add-service-order-id").value;
    const description = getEl("service-description").value;
    const price = getNumericValue("service-price");
    const orderIndex = localData.orders.findIndex((o) => o.id === orderId);

    if (orderIndex > -1 && description && price >= 0) {
      const updatedOrder = JSON.parse(
        JSON.stringify(localData.orders[orderIndex]),
      );
      if (!updatedOrder.services) updatedOrder.services = [];
      updatedOrder.services.push({ description, price });

      showLoading();
      try {
        await api.updateItem("orders", updatedOrder.id, updatedOrder);
        closeModal("add-service-modal");
        e.target.reset();
        showNotification("خدمات به فاکتور اضافه شد.");
        await fetchAndRenderPage("orders", true);
      } catch (error) {
        if (error.status === 409) {
          const latestOrder = await handleUpdateConflict(
            "orders",
            updatedOrder.id,
          );
          if (latestOrder) {
            if (!latestOrder.services) latestOrder.services = [];
            latestOrder.services.push({ description, price });
            await api.updateItem("orders", latestOrder.id, latestOrder);
            closeModal("add-service-modal");
            e.target.reset();
            showNotification("خدمات به فاکتور اضافه شد.");
          } else {
            showNotification("خطا در رفع تداخل. لطفا صفحه را رفرش کنید.", true);
          }
        } else {
          console.error("Failed to add service:", error);
          showNotification("خطا در افزودن خدمات.", true);
        }
        await fetchAndRenderPage("orders", true);
      } finally {
        hideLoading();
      }
    } else {
      showNotification("لطفا شرح و مبلغ معتبری وارد کنید.", true);
    }
  }

  window.removeBuffetFromOrder = async (orderId, buffetItemId) => {
    showConfirmation("آیا از حذف این مورد از فاکتور مطمئن هستید؟", async () => {
      showLoading();
      try {
        const response = await fetch(
          `${API_BASE}?action=remove_buffet_from_order`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, itemId: buffetItemId }),
          },
        );
        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        showNotification(result.message);
        await fetchAndRenderPage("orders", true);
        fetchAndRenderPage("buffet", true).catch((e) => console.error(e));
      } catch (error) {
        console.error("Failed to remove buffet from order:", error);
        showNotification("خطا در حذف آیتم بوفه: " + error.message, true);
      } finally {
        hideLoading();
      }
    });
  };

  window.removeServiceFromOrder = async (orderId, serviceIndex) => {
    const orderIndex = localData.orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1 || localData.orders[orderIndex].status === Constants.ORDER_STATUS_PAID)
      return;

    const updatedOrder = JSON.parse(
      JSON.stringify(localData.orders[orderIndex]),
    );
    if (updatedOrder.services && updatedOrder.services[serviceIndex]) {
      updatedOrder.services.splice(serviceIndex, 1);

      showLoading();
      try {
        await api.updateItem("orders", updatedOrder.id, updatedOrder);
        showNotification("خدمات از فاکتور حذف شد.");
        await fetchAndRenderPage("orders", true);
      } catch (error) {
        console.error("Failed to remove service:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در حذف خدمات.", true);
        }
        await fetchAndRenderPage("orders", true);
      } finally {
        hideLoading();
      }
    }
  };

  window.openExtendSessionDetailsModal = (orderId) => {
    getEl("extend-session-order-id").value = orderId;
    getEl("extend-session-form").reset();
    getEl("extend-time-limit-container").classList.add("hidden");
    getEl("extend-amount-limit-container").classList.add("hidden");
    openModal("extend-session-details-modal");
  };

  async function handleExtendSession(e) {
    e.preventDefault();
    const orderId = getEl("extend-session-order-id").value;
    const orderIndex = localData.orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1) return;

    const updatedOrder = { ...localData.orders[orderIndex] };
    const limitType = document.querySelector(
      'input[name="extendLimitType"]:checked',
    ).value;
    let newScheduledEndTime = null;

    if (limitType === "time") {
      const durationMinutes = parseInt(getEl("extend-order-duration").value);
      if (isNaN(durationMinutes) || durationMinutes <= 0) {
        showNotification("لطفا مدت زمان معتبری را وارد کنید.", true);
        return;
      }
      newScheduledEndTime = TimeService.nowMoment().add(durationMinutes, "minutes").toDate();
    } else if (limitType === "amount") {
      const targetAmount = getNumericValue("extend-order-amount");
      if (targetAmount <= 0) {
        showNotification("لطفا مبلغ معتبری را وارد کنید.", true);
        return;
      }
      const ratePrice = getEffectiveRatePrice(updatedOrder);
      if (!ratePrice || ratePrice <= 0) {
        showNotification("تعرفه انتخاب شده قیمت معتبری ندارد.", true);
        return;
      }
      const durationMinutes = (targetAmount / ratePrice) * 60;
      newScheduledEndTime = TimeService.nowMoment().add(durationMinutes, "minutes").toDate();
    }

    updatedOrder.scheduledEndTime = newScheduledEndTime;
    updatedOrder.timeUp = false; // Reset the time's up flag

    showLoading();
    try {
      await api.updateItem("orders", updatedOrder.id, updatedOrder);
      closeModal("extend-session-details-modal");
      showNotification("جلسه با موفقیت تمدید شد.");
      await fetchAndRenderPage("orders", true);
    } catch (error) {
      console.error("Failed to extend session:", error);
      if (error.status === 409) {
        showNotification(
          "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
          true,
        );
      } else {
        showNotification("خطا در تمدید جلسه.", true);
      }
      await fetchAndRenderPage("orders", true);
    } finally {
      hideLoading();
    }
  }

  async function handleNewTournament(e) {
    e.preventDefault();
    const tournamentDate = moment(
      getEl("new-tournament-date").value,
      "jYYYY/jMM/jDD HH:mm",
    ).toDate();
    if (
      !getEl("new-tournament-name").value ||
      !getEl("new-tournament-game").value ||
      !getEl("new-tournament-fee").value ||
      !getEl("new-tournament-date").value
    ) {
      showNotification("لطفا تمام فیلدها را پر کنید.", true);
      return;
    }

    const newTournament = {
      id: generateId(),
      name: getEl("new-tournament-name").value,
      game: getEl("new-tournament-game").value,
      fee: getNumericValue("new-tournament-fee"),
      startDate: tournamentDate,
      type: "1v1",
      participants: [],
      bracket: null,
      isFinished: false,
      winners: [],
    };

    showLoading();
    try {
      await api.createItem("tournaments", newTournament);
      e.target.reset();
      getEl("new-tournament-date-display").value = "";
      getEl("new-tournament-date").value = "";
      showNotification("تورنومنت جدید با موفقیت اضافه شد.");
      await fetchAndRenderPage("tournaments", true);
    } catch (error) {
      console.error("Failed to create tournament:", error);
      showNotification("خطا در ایجاد تورنومنت.", true);
      await fetchAndRenderPage("tournaments", true);
    } finally {
      hideLoading();
    }
  }

  async function handleRegisterParticipant(e) {
    e.preventDefault();
    const tournamentId = getEl("register-participant-tournament-id").value;
    const tournament = localData.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) {
      showNotification("تورنومنت یافت نشد.", true);
      return;
    }

    const newParticipant = {
      id: generateId(),
      name: getEl("participant-name").value,
      phone: getEl("participant-phone").value,
      description: getEl("participant-description").value,
    };

    const updatedTournament = JSON.parse(JSON.stringify(tournament));
    updatedTournament.participants.push(newParticipant);

    showLoading();
    try {
      await api.updateItem("tournaments", tournamentId, updatedTournament);
      closeModal("register-participant-modal");
      e.target.reset();
      showNotification("شرکت کننده با موفقیت ثبت نام شد.");
      await fetchAndRenderPage("tournaments", true);
    } catch (error) {
      console.error("Failed to register participant:", error);
      showNotification("خطا در ثبت نام شرکت کننده.", true);
      await fetchAndRenderPage("tournaments", true);
    } finally {
      hideLoading();
    }
  }

  function renderTournamentPage() {
    const now = TimeService.nowDate();
    const upcomingTournament = localData.tournaments.find(
      (t) => !t.isFinished && new Date(t.startDate) > now,
    );
    const activeTournament = localData.tournaments.find(
      (t) => !t.isFinished && new Date(t.startDate) <= now,
    );

    const noTournamentView = getEl("no-tournament-view");
    const upcomingView = getEl("upcoming-tournament-view");
    const activeView = getEl("active-tournament-view");

    noTournamentView.classList.add("hidden");
    upcomingView.classList.add("hidden");
    activeView.classList.add("hidden");

    if (activeTournament) {
      activeView.classList.remove("hidden");
      renderActiveTournament(activeTournament);
    } else if (upcomingTournament) {
      upcomingView.classList.remove("hidden");
      renderUpcomingTournament(upcomingTournament);
    } else {
      noTournamentView.classList.remove("hidden");
    }

    renderTournamentHistory();
  }

  function renderUpcomingTournament(tournament) {
    const container = getEl("upcoming-tournament-view");
    const isRegistrationOpen = TimeService.nowDate() < new Date(tournament.startDate);

    container.innerHTML = `
                <div class="card">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold text-white">${tournament.name} - (پیش ثبت نام)</h3>
                        <span class="text-sm text-amber-400">شروع در: ${formatShamsiDate(tournament.startDate, true)}</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 class="text-lg font-bold text-white mb-3">اطلاعات تورنومنت</h4>
                            <div class="space-y-2 text-stone-300">
                                <p><strong>بازی:</strong> ${tournament.game}</p>
                                <p><strong>هزینه ثبت نام:</strong> ${formatCurrency(tournament.fee)}</p>
                                <p><strong>نوع بازی:</strong> 1v1</p>
                            </div>
                            ${
                              isRegistrationOpen
                                ? `
                                <div class="mt-6">
                                    <h4 class="text-lg font-bold text-white mb-3">ثبت نام شرکت کننده جدید</h4>
                                    <form id="quick-register-form" class="space-y-3">
                                        <input type="text" id="quick-register-name" class="input-field" placeholder="نام و نام خانوادگی" required>
                                        <input type="tel" id="quick-register-phone" class="input-field" placeholder="شماره تماس (اختیاری)">
                                        <textarea id="quick-register-description" class="input-field" placeholder="توضیحات (اختیاری)" rows="2"></textarea>
                                        <button type="submit" class="btn btn-primary w-full">ثبت نام</button>
                                    </form>
                                </div>
                            `
                                : '<p class="mt-6 text-red-400">زمان ثبت نام به پایان رسیده است.</p>'
                            }
                             <div class="mt-6 flex gap-4">
                                ${
                                  !isRegistrationOpen
                                    ? `
                                    <button onclick="startTournament('${tournament.id}')" class="btn btn-primary">ایجاد جدول مسابقات</button>
                                `
                                    : `
                                    <button class="btn btn-secondary" disabled>زمان ثبت نام تمام نشده</button>
                                `
                                }
                                <button onclick="deleteTournament('${tournament.id}')" class="btn btn-danger">حذف تورنومنت</button>
                            </div>
                        </div>
                        <div>
                            <h4 class="text-lg font-bold text-white mb-3">لیست شرکت کنندگان (${tournament.participants.length} نفر)</h4>
                            <div id="participants-list-container" class="max-h-80 overflow-y-auto space-y-2 pr-2">
                                ${
                                  tournament.participants.length > 0
                                    ? tournament.participants
                                        .map(
                                          (p) => `
                                    <div class="bg-stone-800 p-3 rounded">
                                        <div class="flex justify-between items-start">
                                            <p class="font-bold text-white">${p.name}</p>
                                            <button onclick="deleteParticipant('${tournament.id}', '${p.id}')" class="text-red-500 hover:text-red-400 text-xs">X</button>
                                        </div>
                                        <p class="text-sm text-stone-400">${p.phone || "بدون شماره"}</p>
                                        <p class="text-xs text-stone-500 mt-1">${p.description || "بدون توضیحات"}</p>
                                    </div>
                                `,
                                        )
                                        .join("")
                                    : '<p class="text-stone-400">هنوز کسی ثبت نام نکرده است.</p>'
                                }
                            </div>
                        </div>
                    </div>
                </div>
            `;

    const quickRegisterForm = getEl("quick-register-form");
    if (quickRegisterForm) {
      quickRegisterForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = getEl("quick-register-name").value;
        const phone = getEl("quick-register-phone").value;
        const description = getEl("quick-register-description").value;
        if (!name) return;

        const newParticipant = { id: generateId(), name, phone, description };
        tournament.participants.push(newParticipant);

        (async () => {
          try {
            setAllButtonsDisabled(true);
            const response = await api.updateItem(
              "tournaments",
              tournament.id,
              tournament,
            );
            const tournamentIndex = localData.tournaments.findIndex(
              (t) => t.id === tournament.id,
            );
            if (tournamentIndex > -1) {
              localData.tournaments[tournamentIndex] = {
                ...tournament,
                version: response.version,
              };
            }
            renderTournamentPage();
            getEl("quick-register-name").value = "";
            getEl("quick-register-phone").value = "";
            getEl("quick-register-description").value = "";
          } catch (error) {
            console.error("Failed to register participant:", error);
            showNotification("خطا در ثبت نام شرکت کننده.", true);
            // Rollback local change if API call fails
            tournament.participants.pop();
          } finally {
            setAllButtonsDisabled(false);
          }
        })();
        getEl("quick-register-phone").value = "";
        getEl("quick-register-description").value = "";
      });
    }
  }

  function generateBracket(tournament) {
    if (tournament.bracket) return; // Bracket already generated

    let participants = [...tournament.participants];
    // Shuffle participants for random matchups
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }

    const rounds = {};
    let currentRound = participants.map((p) => ({
      p1: p,
      p2: null,
      winner: null,
    }));
    let roundNum = 1;

    while (currentRound.length > 1) {
      const matchups = [];
      for (let i = 0; i < currentRound.length; i += 2) {
        const p1 = currentRound[i].winner || currentRound[i].p1;
        const p2 = currentRound[i + 1]
          ? currentRound[i + 1].winner || currentRound[i + 1].p1
          : { id: "bye", name: "BYE" };
        matchups.push({ p1, p2, winner: p2.id === "bye" ? p1 : null });
      }
      rounds[`round-${roundNum}`] = matchups;
      currentRound = matchups
        .filter((m) => m.winner)
        .map((m) => ({ p1: m.winner, p2: null, winner: null }));
      if (
        currentRound.length * 2 < matchups.length * 2 &&
        currentRound.length > 0
      ) {
        // This logic is complex, for now we just prepare the winners for the next round
      }
      roundNum++;
      let nextRoundWinners = [];
      for (const match of matchups) {
        if (match.winner) nextRoundWinners.push(match.winner);
      }
      if (nextRoundWinners.length === 1) break; // Final winner
      currentRound = nextRoundWinners.map((p) => ({
        p1: p,
        p2: null,
        winner: null,
      }));
    }

    tournament.bracket = rounds;
    db.setItem("tournaments", localData.tournaments);
  }

  function renderActiveTournament(tournament) {
    const container = getEl("active-tournament-view");
    let bracketHTML = "";
    if (tournament.bracket) {
      bracketHTML +=
        '<div class="flex space-x-4 overflow-x-auto p-4 bg-stone-900 rounded-lg">';
      for (const roundName in tournament.bracket) {
        bracketHTML += `<div class="flex-shrink-0 w-72 space-y-4">`;
        bracketHTML += `<h4 class="text-lg font-bold text-center text-amber-400">${roundName.replace("-", " ")}</h4>`;
        tournament.bracket[roundName].forEach((match, index) => {
          const isP1Winner = match.winner && match.winner.id === match.p1.id;
          const isP2Winner = match.winner && match.winner.id === match.p2.id;
          bracketHTML += `
                            <div class="bg-stone-800 p-3 rounded-lg">
                                <div class="flex flex-col space-y-2">
                                    <div class="flex items-center justify-between">
                                        <span class="${isP1Winner ? "text-green-400 font-bold" : ""}">${match.p1.name}</span>
                                        ${!match.winner && match.p2.id !== "bye" ? `<button class="btn btn-primary btn-sm !px-2 !py-1" onclick="setWinner('${tournament.id}', '${roundName}', ${index}, 'p1')">برنده</button>` : ""}
                                    </div>
                                    <div class="text-center text-xs text-stone-500">VS</div>
                                    <div class="flex items-center justify-between">
                                        <span class="${isP2Winner ? "text-green-400 font-bold" : ""}">${match.p2.name}</span>
                                        ${!match.winner && match.p2.id !== "bye" ? `<button class="btn btn-primary btn-sm !px-2 !py-1" onclick="setWinner('${tournament.id}', '${roundName}', ${index}, 'p2')">برنده</button>` : ""}
                                    </div>
                                </div>
                            </div>
                        `;
        });
        bracketHTML += `</div>`;
      }
      bracketHTML += "</div>";
    } else {
      bracketHTML = `
                    <div class="text-center p-8 bg-stone-900 rounded-lg">
                        <p class="text-stone-400 mb-4">جدول مسابقات هنوز ایجاد نشده است.</p>
                        <button onclick="startTournament('${tournament.id}')" class="btn btn-primary">ایجاد جدول و شروع قرعه کشی</button>
                    </div>
                `;
    }

    container.innerHTML = `
                <div class="card">
                     <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold text-white">${tournament.name} - (در حال برگزاری)</h3>
                        <button onclick="finishTournament('${tournament.id}')" class="btn btn-danger">پایان و ثبت در تاریخچه</button>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div class="lg:col-span-1">
                             <h4 class="text-lg font-bold text-white mb-3">اطلاعات و شرکت‌کنندگان</h4>
                             <div class="space-y-2 text-stone-300 mb-4">
                                <p><strong>بازی:</strong> ${tournament.game}</p>
                                <p><strong>هزینه ثبت نام:</strong> ${formatCurrency(tournament.fee)}</p>
                            </div>
                            <div id="active-participants-list" class="max-h-60 overflow-y-auto space-y-2 pr-2 mb-4">
                                 ${tournament.participants
                                   .map(
                                     (p) => `
                                    <div class="flex justify-between items-center bg-stone-800 p-2 rounded">
                                        <span>${p.name}</span>
                                        <button onclick="deleteParticipant('${tournament.id}', '${p.id}')" class="text-red-500 hover:text-red-400">X</button>
                                    </div>
                                `,
                                   )
                                   .join("")}
                            </div>
                            <h4 class="text-lg font-bold text-white mb-3">افزودن شرکت کننده</h4>
                            <form id="active-add-participant-form" class="space-y-3">
                                <input type="text" id="active-participant-name" class="input-field" placeholder="نام و نام خانوادگی" required>
                                <button type="submit" class="btn btn-primary w-full">افزودن</button>
                            </form>
                        </div>
                        <div class="lg:col-span-2">
                            ${bracketHTML}
                        </div>
                    </div>
                </div>
            `;

    addListener("active-add-participant-form", "submit", (e) => {
      e.preventDefault();
      const name = getEl("active-participant-name").value;
      if (!name) return;
      const newParticipant = {
        id: generateId(),
        name,
        phone: "",
        description: "",
      };
      tournament.participants.push(newParticipant);
      // In a real scenario, you might want to regenerate the bracket or add the new participant to a waiting list
      // For now, we just add to the list and re-render.
      tournament.bracket = null; // Force bracket regeneration

      (async () => {
        try {
          setAllButtonsDisabled(true);
          const response = await api.updateItem(
            "tournaments",
            tournament.id,
            tournament,
          );
          const tournamentIndex = localData.tournaments.findIndex(
            (t) => t.id === tournament.id,
          );
          if (tournamentIndex > -1) {
            localData.tournaments[tournamentIndex] = {
              ...tournament,
              version: response.version,
            };
          }
          renderTournamentPage();
        } catch (error) {
          console.error("Failed to add participant:", error);
          showNotification("خطا در افزودن شرکت کننده.", true);
          // Rollback local change if API call fails
          tournament.participants.pop();
        } finally {
          setAllButtonsDisabled(false);
        }
      })();
    });
  }

  window.finishTournament = async (tournamentId) => {
    const tournament = localData.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;

    // Safely try to find the winner
    if (tournament.bracket && Object.keys(tournament.bracket).length > 0) {
      const lastRoundName = Object.keys(tournament.bracket).pop();
      if (
        tournament.bracket[lastRoundName] &&
        tournament.bracket[lastRoundName].length > 0
      ) {
        const finalMatch = tournament.bracket[lastRoundName][0];
        if (finalMatch && finalMatch.winner) {
          tournament.winners = [finalMatch.winner];
        }
      }
    }

    tournament.isFinished = true;
    try {
      setAllButtonsDisabled(true);
      const response = await api.updateItem(
        "tournaments",
        tournamentId,
        tournament,
      );
      const tournamentIndex = localData.tournaments.findIndex(
        (t) => t.id === tournamentId,
      );
      if (tournamentIndex > -1) {
        localData.tournaments[tournamentIndex] = {
          ...tournament,
          version: response.version,
        };
      }
      renderTournamentPage();
      showNotification(`تورنومنت ${tournament.name} به تاریخچه منتقل شد.`);
    } catch (error) {
      console.error("Failed to finish tournament:", error);
      showNotification("خطا در پایان دادن به تورنومنت.", true);
    } finally {
      setAllButtonsDisabled(false);
    }
  };

  function renderTournamentHistory() {
    const container = getEl("tournament-history-list");
    const finishedTournaments = localData.tournaments
      .filter((t) => t.isFinished)
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    if (finishedTournaments.length === 0) {
      container.innerHTML =
        '<p class="text-stone-500 text-center">تاریخچه‌ای برای نمایش وجود ندارد.</p>';
      return;
    }

    container.innerHTML = finishedTournaments
      .map((t, index) => {
        const winner =
          t.winners && t.winners.length > 0 ? t.winners[0].name : "نامشخص";
        return `
                    <div class="card !bg-stone-800">
                         <button class="w-full text-right" onclick="document.getElementById('history-body-${index}').classList.toggle('hidden')">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-white">${t.name}</span>
                                <span class="text-sm text-stone-400">${formatShamsiDate(t.startDate)}</span>
                            </div>
                         </button>
                         <div id="history-body-${index}" class="hidden mt-4 pt-4 border-t border-stone-700">
                             <p><strong>برنده:</strong> <span class="text-yellow-400 font-bold">${winner}</span></p>
                             <p><strong>بازی:</strong> ${t.game}</p>
                             <p><strong>تعداد شرکت کنندگان:</strong> ${t.participants.length}</p>
                             <!-- Full bracket could be displayed here if needed -->
                         </div>
                    </div>
                `;
      })
      .join("");
  }

  function getEffectiveRatePrice(orderSegment) {
    const consoleItem = localData.consoles.find(
      (c) => c.id === orderSegment.consoleId,
    );
    if (!consoleItem || !consoleItem.rates[orderSegment.rateId]) return 0;
    return consoleItem.rates[orderSegment.rateId].price;
  }

  // محاسبه مبلغ نهایی با در نظر گرفتن تاریخچه انتقال
  function calculateFinalAmount(
    order,
    calculationContext = "settlement",
    useFullTime = false,
  ) {
    let totalGameCost = 0;
    let totalDurationMinutes = 0;

    if (order.history && order.history.length > 0) {
      order.history.forEach((segment) => {
        const pricePerHour = getEffectiveRatePrice(segment);
        const durationMs =
          new Date(segment.endTime) - new Date(segment.startTime);
        const durationMinutes = durationMs / 60000;
        totalDurationMinutes += durationMinutes;
        totalGameCost += (durationMinutes / 60) * pricePerHour;
      });
    }

    const activeSegmentStartTime =
      order.history && order.history.length > 0
        ? new Date(order.history[order.history.length - 1].endTime)
        : new Date(order.startTime);

    let endOfCalculationTime;
    if (useFullTime && order.scheduledEndTime) {
      endOfCalculationTime = new Date(order.scheduledEndTime);
    } else {
      endOfCalculationTime =
        order.status === Constants.ORDER_STATUS_ACTIVE ? TimeService.nowDate() : new Date(order.endDate);
    }

    // [FIX] اگر زمان فاکتور به پایان رسیده باشد، محاسبه را در زمان پایان متوقف کن
    if (
      order.status === Constants.ORDER_STATUS_ACTIVE &&
      order.scheduledEndTime &&
      TimeService.nowDate() > new Date(order.scheduledEndTime)
    ) {
      endOfCalculationTime = new Date(order.scheduledEndTime);
    }

    if (endOfCalculationTime > activeSegmentStartTime) {
      const activeSegmentDurationMs =
        endOfCalculationTime - activeSegmentStartTime;
      const activeSegmentDurationMinutes = activeSegmentDurationMs / 60000;
      totalDurationMinutes += activeSegmentDurationMinutes;
      const consoleItem = localData.consoles.find(
        (c) => c.id === order.consoleId,
      );
      let activeSegmentPricePerHour = getEffectiveRatePrice(order);

      if (
        consoleItem &&
        consoleItem.specialRate &&
        consoleItem.specialRate.amount > 0 &&
        consoleItem.specialRate.startTime &&
        consoleItem.specialRate.endTime
      ) {
        const specialRate = consoleItem.specialRate;
        const specialStartTime = moment(specialRate.startTime, "HH:mm");
        const specialEndTime = moment(specialRate.endTime, "HH:mm");

        // Handle overnight times
        if (specialEndTime.isBefore(specialStartTime)) {
          specialEndTime.add(1, "day");
        }

        const segmentStartMoment = moment(activeSegmentStartTime);
        const segmentEndMoment = moment(endOfCalculationTime);

        let totalMinutesInSpecialRate = 0;

        // Create a clone of the segment start to iterate through days
        let currentDay = segmentStartMoment.clone().startOf("day");

        while (currentDay.isBefore(segmentEndMoment)) {
          let specialStartForDay = specialStartTime
            .clone()
            .year(currentDay.year())
            .month(currentDay.month())
            .date(currentDay.date());
          let specialEndForDay = specialEndTime
            .clone()
            .year(currentDay.year())
            .month(currentDay.month())
            .date(currentDay.date());

          // Find the intersection between the game segment and the special rate period for the current day
          const overlapStart = moment.max(
            segmentStartMoment,
            specialStartForDay,
          );
          const overlapEnd = moment.min(segmentEndMoment, specialEndForDay);

          if (overlapStart.isBefore(overlapEnd)) {
            totalMinutesInSpecialRate += moment
              .duration(overlapEnd.diff(overlapStart))
              .asMinutes();
          }

          // Move to the next day
          currentDay.add(1, "day");
        }

        const normalMinutes =
          activeSegmentDurationMinutes - totalMinutesInSpecialRate;

        totalGameCost += (normalMinutes / 60) * activeSegmentPricePerHour;
        totalGameCost +=
          (totalMinutesInSpecialRate / 60) *
          (activeSegmentPricePerHour + specialRate.amount);
      } else {
        totalGameCost +=
          (activeSegmentDurationMinutes / 60) * activeSegmentPricePerHour;
      }
    }

    const roundedGameCost = Math.round(totalGameCost / 1000) * 1000;
    const buffetCost = (order.buffetItems || []).reduce(
      (sum, item) => sum + item.sellPrice * item.quantity,
      0,
    );
    const servicesCost = (order.services || []).reduce(
      (sum, service) => sum + service.price,
      0,
    );
    const subTotal = roundedGameCost + buffetCost + servicesCost;

    const discount =
      calculationContext === "settlement" && typeof currentSettlement !== "undefined" && currentSettlement.payments
        ? currentSettlement.payments
            .filter(
              (p) =>
                p.method === "discount" ||
                p.method === Constants.PAYMENT_TYPE_DISCOUNT,
            )
            .reduce((sum, p) => sum + p.amount, 0)
        : order.discountAmount || 0;
    const totalWithDiscount = subTotal - discount;
    const totalAmount = Math.round(totalWithDiscount / 1000) * 1000;

    const duration = moment.duration(totalDurationMinutes, "minutes");
    const hours = Math.floor(duration.asHours()).toString().padStart(2, "0");
    const minutes = duration.minutes().toString().padStart(2, "0");
    const seconds = duration.seconds().toString().padStart(2, "0");
    const durationFormatted = `${hours}:${minutes}:${seconds}`;

    return {
      gameCost: roundedGameCost,
      buffetCost,
      servicesCost,
      subTotal,
      totalAmount,
      discount,
      durationFormatted,
    };
  }

  // محاسبه مبلغ کامل فاکتور برای جلسات زمان‌دار
  function calculateFullAmount(order) {
    if (!order.scheduledEndTime) {
      return null; // برای فاکتورهای آزاد، مبلغ کامل نداریم
    }

    const { totalAmount: currentAmount } = calculateFinalAmount(
      order,
      "active",
    );

    const fullOrder = JSON.parse(JSON.stringify(order));
    fullOrder.endDate = fullOrder.scheduledEndTime;
    fullOrder.status = "pending_payment"; // شبیه‌سازی حالت پایان یافته

    const { totalAmount: fullAmount } = calculateFinalAmount(
      fullOrder,
      "pending",
    );

    // اگر مبلغ کامل کمتر از مبلغ فعلی بود (مثلا بخاطر تخفیف یا منطق خاص)، همان مبلغ فعلی را نشان بده
    return fullAmount > currentAmount ? fullAmount : null;
  }

  // محاسبه مجدد تسویه حساب
  function recalculateSettlement() {
    const order = currentSettlement.order;
    if (!order) return;

    const isPrepayment = order.status === Constants.ORDER_STATUS_ACTIVE;
    const useFullTime = isPrepayment && !!order.scheduledEndTime;

    const {
      gameCost,
      buffetCost,
      servicesCost,
      subTotal,
      totalAmount,
      discount,
    } = calculateFinalAmount(order, "settlement", useFullTime);

    currentSettlement.finalGameCost = gameCost;
    currentSettlement.totalAmount = totalAmount;
    currentSettlement.discountAmount = discount;

    getEl("settle-game-cost").textContent = formatCurrency(gameCost);
    getEl("settle-buffet-cost").textContent = formatCurrency(buffetCost);
    getEl("settle-services-cost").textContent = formatCurrency(servicesCost);
    getEl("settle-subtotal-amount").textContent = formatCurrency(subTotal);
    getEl("settle-total-amount").textContent = formatCurrency(totalAmount);

    const historyContainer = getEl("settle-history-details");
    historyContainer.innerHTML = "";
    if (order.history && order.history.length > 0) {
      let historyHTML =
        '<h4 class="font-bold text-stone-300">جزئیات بازی:</h4>';
      order.history.forEach((segment) => {
        const consoleItem = localData.consoles.find(
          (c) => c.id === segment.consoleId,
        );
        const rate = consoleItem.rates[segment.rateId];
        const duration = moment.duration(
          new Date(segment.endTime) - new Date(segment.startTime),
        );
        const cost = Math.round(((duration.asMinutes() / 60) * rate.price) / 1000) * 1000;
        historyHTML += `
                        <div class="flex justify-between items-center">
                            <span>- ${consoleItem.type} ${consoleItem.number} (${rate.name})</span>
                            <span class="text-stone-400">${Math.floor(duration.asMinutes())} دقیقه</span>
                            <span>${formatCurrency(cost)}</span>
                        </div>
                    `;
      });
      historyContainer.innerHTML = historyHTML;
    }

    updateSettlementRemaining();
  }

  async function updateSettlementCreditInfo() {
    const infoContainer = getEl("settle-credit-info-container");
    const addBtn = getEl("add-payment-part-btn");
    const method = getEl("payment-method")?.value;

    if (!infoContainer || method !== Constants.PAYMENT_TYPE_CREDIT || !currentSettlement?.creditPaymentCustomerId) {
      if (infoContainer) infoContainer.classList.add("hidden");
      if (addBtn) addBtn.disabled = false;
      return;
    }

    const customerId = currentSettlement.creditPaymentCustomerId;
    let customer = null;
    try {
      const res = await api.getData("customers", { id: customerId });
      if (res && res.data && res.data.length > 0) {
        customer = res.data[0];
      }
    } catch (e) {
      console.error("Failed to fetch customer data for settlement check:", e);
    }
    if (!customer) {
      customer = localData.customers.find((c) => c.id === customerId);
    }

    if (!customer) {
      infoContainer.classList.add("hidden");
      if (addBtn) addBtn.disabled = false;
      return;
    }

    const currentBalance = Number(customer.balance || 0);
    const debt = currentBalance < 0 ? Math.abs(currentBalance) : 0;
    const creditLimit = (customer.creditLimit === null || customer.creditLimit === undefined || customer.creditLimit === "") ? null : Number(customer.creditLimit);
    const availableCredit = creditLimit === null ? null : (currentBalance + creditLimit);

    const inputAmount = getNumericValue("payment-amount");
    const realPaid = currentSettlement.payments
      .filter((p) => p.method !== "discount" && p.method !== Constants.PAYMENT_TYPE_DISCOUNT)
      .reduce((sum, p) => sum + p.amount, 0);
    const remaining = currentSettlement.totalAmount - realPaid;
    const amountToCheck = inputAmount > 0 ? inputAmount : (remaining > 0 ? remaining : 0);

    const isSufficient = creditLimit === null || (amountToCheck <= availableCredit);

    if (addBtn) {
      addBtn.disabled = !isSufficient;
    }

    infoContainer.innerHTML = `
      <div class="flex justify-between"><span class="text-stone-400">بدهی فعلی:</span><span class="${debt > 0 ? 'text-red-400 font-bold' : 'text-stone-200'}">${formatCurrency(debt)}</span></div>
      <div class="flex justify-between"><span class="text-stone-400">سقف اعتبار:</span><span class="text-stone-200">${creditLimit === null ? 'آزاد' : formatCurrency(creditLimit)}</span></div>
      <div class="flex justify-between"><span class="text-stone-400">اعتبار قابل استفاده:</span><span class="${availableCredit !== null && availableCredit < amountToCheck ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}">${availableCredit === null ? 'آزاد' : formatCurrency(availableCredit)}</span></div>
      <div class="flex justify-between border-t border-stone-700 pt-1 mt-1 font-bold"><span>وضعیت اعتبار:</span><span class="${isSufficient ? 'text-green-400' : 'text-red-400'}">${isSufficient ? 'کافی (مجاز)' : 'ناکافی - سقف اعتبار پاسخگو نیست'}</span></div>
    `;
    infoContainer.classList.remove("hidden");
  }

  window.openSettleOrderModal = (orderId) => {
    const order = localData.orders.find((o) => o.id === orderId);
    if (!order) return;

    currentSettlement = {
      order: order,
      payments: [...(order.payments || [])],
      customerId: order.customerId || "guest_customer",
      discountAmount: order.discountAmount || 0,
      creditPaymentCustomerId: null,
      finalGameCost: order.finalGameCost || 0,
      totalAmount: order.totalAmount || 0,
    };

    const customer = localData.customers.find(
      (c) => c.id === currentSettlement.customerId,
    );
    getEl("settle-customer-name").textContent = customer?.name || "مشتری آزاد";
    const invoiceNumberEl = getEl("settle-invoice-number");
    if (order.invoiceNumber) {
      invoiceNumberEl.textContent = `فاکتور #${order.invoiceNumber}`;
    } else {
      invoiceNumberEl.textContent = "";
    }

    const infoContainer = getEl("settle-credit-info-container");
    if (infoContainer) infoContainer.classList.add("hidden");

    recalculateSettlement();
    renderPaymentParts();
    openModal("settle-order-modal");
  };

  function updateSettlementRemaining() {
    const realPaid = currentSettlement.payments
      .filter(
        (p) =>
          p.method !== "discount" &&
          p.method !== Constants.PAYMENT_TYPE_DISCOUNT,
      )
      .reduce((sum, p) => sum + p.amount, 0);
    const remaining = currentSettlement.totalAmount - realPaid;
    getEl("settle-remaining-amount").textContent = formatCurrency(remaining);

    const finalizeBtn = getEl("finalize-settlement-btn");
    const isPrepayment =
      currentSettlement.order && currentSettlement.order.status === Constants.ORDER_STATUS_ACTIVE;

    // برای پیش‌پرداخت، دکمه را فعال کن اگر حداقل یک پرداخت وجود داشته باشد
    if (isPrepayment) {
      finalizeBtn.disabled = currentSettlement.payments.length === 0;
    } else {
      finalizeBtn.disabled = remaining > 0;
    }
  }

  function renderPaymentParts() {
    const list = getEl("payment-parts-list");
    const methodLabels = { cash: "نقد", card: "کارتخوان", card_to_card: "کارت به کارت", credit: "اعتبار", discount: "تخفیف", check: "چک" };
    list.innerHTML = currentSettlement.payments
      .map((p, index) => {
        let paymentText = `${methodLabels[p.method] || p.method}: ${formatCurrency(p.amount)}`;
        if (p.method === Constants.PAYMENT_TYPE_CREDIT && p.customerId) {
          const creditCustomer = localData.customers.find(
            (c) => c.id === p.customerId,
          );
          if (creditCustomer) {
            paymentText = `${methodLabels[p.method]} (${creditCustomer.name}): ${formatCurrency(p.amount)}`;
          }
        } else if ((p.method === Constants.PAYMENT_TYPE_CHECK || p.method === "check") && p.checkDate) {
          paymentText += ` (تاریخ چک: ${formatShamsiDate(p.checkDate)})`;
        }
        return `
                    <div class="p-2 bg-stone-700 rounded flex justify-between items-center text-sm">
                        <span>${paymentText}</span>
                        <button class="text-red-400" onclick="removePaymentPart(${index})">X</button>
                    </div>
                `;
      })
      .join("");
  }

  window.removePaymentPart = (index) => {
    currentSettlement.payments.splice(index, 1);
    recalculateSettlement();
    renderPaymentParts();
  };

  function handleAddPaymentPart() {
    const method = getEl("payment-method").value;
    const amountInput = getEl("payment-amount");
    let amount = getNumericValue(amountInput);
    const errorEl = getEl("settle-error");
    errorEl.classList.add("hidden");

    const realPaid = currentSettlement.payments
      .filter(
        (p) =>
          p.method !== "discount" &&
          p.method !== Constants.PAYMENT_TYPE_DISCOUNT,
      )
      .reduce((sum, p) => sum + p.amount, 0);
    const remaining = currentSettlement.totalAmount - realPaid;

    if (isNaN(amount) || amount <= 0) {
      amount = remaining;
    }

    let paymentPart = { method, amount, timestamp: TimeService.nowDate() };

    if (method === Constants.PAYMENT_TYPE_CREDIT) {
      const customerId = currentSettlement.creditPaymentCustomerId;
      if (!customerId) {
        const msg = "لطفا یک مشتری برای پرداخت از اعتبار انتخاب کنید.";
        errorEl.textContent = msg;
        errorEl.classList.remove("hidden");
        showNotification(msg, true, "تسویه فاکتور");
        return;
      }
      const customer = localData.customers.find((c) => c.id === customerId);

      paymentPart.customerId = customerId;
    } else if (method === Constants.PAYMENT_TYPE_CHECK || method === "check") {
      const checkDateVal = getEl("check-payment-date").value;
      if (!checkDateVal) {
        const msg = "لطفاً تاریخ چک را انتخاب کنید.";
        errorEl.textContent = msg;
        errorEl.classList.remove("hidden");
        showNotification(msg, true, "تسویه فاکتور");
        return;
      }
      paymentPart.checkDate = checkDateVal;
    }

    currentSettlement.payments.push(paymentPart);
    recalculateSettlement();
    renderPaymentParts();
    amountInput.value = "";
  }

  async function handleFinalizeSettlement() {
    if (!currentSettlement.order) return;

    recalculateSettlement(); // Make sure all amounts are up-to-date

    const isPrepayment = currentSettlement.order.status === Constants.ORDER_STATUS_ACTIVE;
    const settlementData = {
      customerId: currentSettlement.customerId,
      finalGameCost: currentSettlement.finalGameCost,
      totalAmount: currentSettlement.totalAmount,
      discountAmount: currentSettlement.discountAmount,
      payments: currentSettlement.payments,
      isPrepayment: isPrepayment,
    };

    showLoading();
    try {
      const response = await fetch(`${API_BASE}?action=finalize_settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: currentSettlement.order.id,
          settlementData: settlementData,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      closeModal("settle-order-modal");
      showNotification(result.message);
      await fetchAndRenderPage("orders", true);
      fetchAndRenderPage("customers", true).catch((e) => console.error(e));
      fetchAndRenderPage("reports", true).catch((e) => console.error(e));
    } catch (error) {
      console.error("Failed to finalize settlement:", error);
      showNotification("خطا در تسویه حساب: " + error.message, true);
      await fetchAndRenderPage("orders", true);
    } finally {
      hideLoading();
    }
  }

  window.openOrderDetailsModal = async (orderId) => {
    let order = localData.orders
      ? localData.orders.find((o) => o.id === orderId)
      : null;
    if (
      !order &&
      typeof reportsViewState !== "undefined" &&
      reportsViewState.loadedData
    ) {
      order = reportsViewState.loadedData.find((o) => o.id === orderId);
    }

    if (!order) {
      showLoading();
      try {
        const result = await api.getData("orders", { id: orderId });
        if (result && result.data && result.data.length > 0) {
          const parsed = parseDates(result.data, "orders");
          order = parsed[0];
          if (!localData.orders) {
            localData.orders = [];
          }
          localData.orders.push(order);
        }
      } catch (e) {
        console.error("Failed to fetch order details from server:", e);
      } finally {
        hideLoading();
      }
    }

    if (!order) {
      showNotification("سفارش یافت نشد.", true);
      return;
    }

    const customer = localData.customers.find((c) => c.id === order.customerId);
    const consoleItem = localData.consoles.find(
      (c) => c.id === order.consoleId,
    );

    getEl("details-customer-name").textContent = customer?.name || "مشتری آزاد";
    getEl("details-console-name").textContent = consoleItem
      ? `${consoleItem.type} ${consoleItem.number}`
      : "---";
    getEl("details-date").textContent = formatShamsiDate(order.endDate, true);

    const costsContainer = getEl("details-costs-container");
    const buffetCost = (order.buffetItems || []).reduce(
      (sum, i) => sum + i.sellPrice * i.quantity,
      0,
    );
    const servicesCost = (order.services || []).reduce(
      (sum, s) => sum + s.price,
      0,
    );
    const finalGameCost = Math.round((order.finalGameCost || 0) / 1000) * 1000;
    const subTotal = finalGameCost + buffetCost + servicesCost;

    let historyHTML = "";
    if (order.history && order.history.length > 0) {
      historyHTML += '<h4 class="font-bold text-stone-300">جزئیات بازی:</h4>';
      order.history.forEach((segment) => {
        const consoleHist = localData.consoles.find(
          (c) => c.id === segment.consoleId,
        );
        const rate = consoleHist ? consoleHist.rates[segment.rateId] : null;
        const duration = moment.duration(
          new Date(segment.endTime) - new Date(segment.startTime),
        );
        const price = rate ? rate.price : 0;
        const cost = Math.round(((duration.asMinutes() / 60) * price) / 1000) * 1000;
        const consoleName = consoleHist
          ? `${consoleHist.type} ${consoleHist.number}`
          : "نامشخص";
        const rateName = rate ? rate.name : "نامشخص";
        historyHTML += `<div class="flex justify-between items-center text-xs pl-2"><span class="text-stone-400">- ${consoleName} (${rateName})</span><span class="text-stone-400">${Math.floor(duration.asMinutes())} دقیقه</span><span>${formatCurrency(cost)}</span></div>`;
      });
      const lastConsole = localData.consoles.find(
        (c) => c.id === order.consoleId,
      );
      const lastRate = lastConsole ? lastConsole.rates[order.rateId] : null;
      const lastSegmentStartTime = new Date(
        order.history[order.history.length - 1].endTime,
      );
      const lastSegmentDuration = moment.duration(
        new Date(order.endDate) - lastSegmentStartTime,
      );
      const lastPrice = lastRate ? lastRate.price : 0;
      const lastSegmentCost =
        Math.round(((lastSegmentDuration.asMinutes() / 60) * lastPrice) / 1000) * 1000;
      const lastConsoleName = lastConsole
        ? `${lastConsole.type} ${lastConsole.number}`
        : "نامشخص";
      const lastRateName = lastRate ? lastRate.name : "نامشخص";
      historyHTML += `<div class="flex justify-between items-center text-xs pl-2"><span class="text-stone-400">- ${lastConsoleName} (${lastRateName})</span><span class="text-stone-400">${Math.floor(lastSegmentDuration.asMinutes())} دقیقه</span><span>${formatCurrency(lastSegmentCost)}</span></div>`;
    }

    // -- Start of change: Itemized list generation --
    let buffetDetailsHTML = "";
    if (order.buffetItems && order.buffetItems.length > 0) {
      buffetDetailsHTML +=
        '<h4 class="text-md font-bold text-white pt-2">بوفه:</h4>';
      buffetDetailsHTML += (order.buffetItems || [])
        .map(
          (item) => `
                    <div class="flex justify-between text-xs pl-2">
                        <span class="text-stone-400">- ${item.name} (x${item.quantity})</span>
                        <span>${formatCurrency(item.sellPrice * item.quantity)}</span>
                    </div>
                `,
        )
        .join("");
    }

    let servicesDetailsHTML = "";
    if (order.services && order.services.length > 0) {
      servicesDetailsHTML +=
        '<h4 class="text-md font-bold text-white pt-2">خدمات:</h4>';
      servicesDetailsHTML += (order.services || [])
        .map(
          (service) => `
                    <div class="flex justify-between text-xs pl-2">
                        <span class="text-stone-400">- ${service.description}</span>
                        <span>${formatCurrency(service.price)}</span>
                    </div>
                `,
        )
        .join("");
    }
    // -- End of change --

    costsContainer.innerHTML = `
                ${historyHTML}
                <div class="flex justify-between pt-2 border-t border-stone-600"><span>هزینه کل بازی:</span><span>${formatCurrency(finalGameCost)}</span></div>
                ${buffetDetailsHTML}
                ${servicesDetailsHTML}
                <div class="border-t border-stone-700 my-1"></div>
                <div class="flex justify-between text-sm text-stone-400"><span>جمع:</span><span>${formatCurrency(subTotal)}</span></div>
                ${(order.discountAmount || 0) > 0 ? `<div class="flex justify-between text-sm text-stone-400"><span>تخفیف:</span><span>(${formatCurrency(order.discountAmount)})</span></div>` : ""}
                <div class="border-t border-stone-700 my-1"></div>
                <div class="flex justify-between font-bold"><span>مبلغ نهایی:</span><span>${formatCurrency(order.totalAmount)}</span></div>
            `;

    const paymentsList = getEl("details-payments-list");
    const methodLabels = { cash: "نقد", card: "کارتخوان", card_to_card: "کارت به کارت", credit: "اعتبار", discount: "تخفیف" };
    if (order.payments && order.payments.length > 0) {
      paymentsList.innerHTML = order.payments
        .map((p) => {
          let paymentText = methodLabels[p.method] || p.method;
          if (p.method === Constants.PAYMENT_TYPE_CREDIT && p.customerId) {
            const creditCustomer = localData.customers.find(
              (c) => c.id === p.customerId,
            );
            if (creditCustomer) {
              paymentText += ` (${creditCustomer.name})`;
            }
          } else if ((p.method === Constants.PAYMENT_TYPE_CHECK || p.method === "check") && p.checkDate) {
            paymentText += ` (تاریخ چک: ${formatShamsiDate(p.checkDate)})`;
          }
          return `<div class="flex justify-between"><span>${paymentText}:</span><span>${formatCurrency(p.amount)}</span></div>`;
        })
        .join("");
    } else {
      paymentsList.innerHTML = "<span>پرداختی ثبت نشده است.</span>";
    }

    openModal("order-details-modal");
  };

  function updateLiveClock() {
    const clockEl = getEl("live-clock");
    const dateEl = getEl("live-date");
    if (clockEl && dateEl) {
      const now = TimeService.nowMoment();
      clockEl.textContent = now.format("HH:mm:ss");
      dateEl.textContent = now.format("dddd jYYYY/jMM/jDD");
    }
  }

  function setupEventListeners() {
    setupEditPaidOrderEventListeners();

    // Notification Center Event Listeners
    const notifBellMobile = getEl("notif-bell-btn-mobile");
    if (notifBellMobile) {
      notifBellMobile.addEventListener("click", () => openModal("notification-history-modal"));
    }
    const notifBellDesktop = getEl("notif-bell-btn-desktop");
    if (notifBellDesktop) {
      notifBellDesktop.addEventListener("click", () => openModal("notification-history-modal"));
    }
    const notifMarkAllRead = getEl("notif-mark-all-read-btn");
    if (notifMarkAllRead) {
      notifMarkAllRead.addEventListener("click", () => window.NotificationCenter.markAllAsRead());
    }
    const notifClearHistory = getEl("notif-clear-history-btn");
    if (notifClearHistory) {
      notifClearHistory.addEventListener("click", () => window.NotificationCenter.clearHistory());
    }
    const notifTabAll = getEl("notif-tab-all");
    if (notifTabAll) {
      notifTabAll.addEventListener("click", () => window.NotificationCenter.setFilter("all"));
    }
    const notifTabUnread = getEl("notif-tab-unread");
    if (notifTabUnread) {
      notifTabUnread.addEventListener("click", () => window.NotificationCenter.setFilter("unread"));
    }
    addListener("login-form", "submit", handleLogin);
    addListener("new-customer-form", "submit", handleNewCustomer);
    addListener("edit-customer-form", "submit", handleEditCustomer);
    addListener("add-credit-payment-form", 
      "submit",
      handleAddCreditPayment,
    );
    addListener("deduct-credit-form", "submit", handleDeductCredit);
    addListener("new-buffet-item-form", 
      "submit",
      handleNewBuffetItem,
    );
    addListener("edit-buffet-form", "submit", handleEditBuffetItem);
    addListener("new-console-form", "submit", handleNewConsole);
    addListener("edit-console-form", "submit", handleEditConsole);
    addListener("new-user-form", "submit", handleNewUser);
    addListener("edit-user-form", "submit", handleEditUser);
    addListener("new-expense-form", "submit", handleNewExpense);
    addListener("new-check-form", "submit", handleNewCheck);
    addListener("settle-check-form", "submit", handleSettleCheck);
    addListener("edit-expense-form", "submit", handleEditExpense);
    addListener("new-secretary-log-form", 
      "submit",
      handleNewSecretaryLog,
    );
    addListener("edit-secretary-log-form", 
      "submit",
      handleEditSecretaryLog,
    );
    addListener("secretary-bonus-form", 
      "submit",
      handleSaveSecretaryBonus,
    );
    addListener("secretary-fine-form", 
      "submit",
      handleSaveSecretaryFine,
    );

    addListener("new-order-form", "submit", handleNewOrder);
    addListener("add-buffet-to-order-form", 
      "submit",
      handleAddBuffetToOrder,
    );
    addListener("add-service-form", "submit", handleAddService);
    addListener("transfer-order-form", 
      "submit",
      handleTransferOrder,
    );
    addListener("logout-button", "click", handleLogout);
    addListener("add-rate-field-btn", "click", () =>
      addRateField("rate-fields-container"),
    );
    addListener("edit-add-rate-field-btn", "click", () =>
      addRateField("edit-rate-fields-container"),
    );
    addListener("notification-ok-btn", "click", () =>
      closeModal("notification-modal"),
    );
    addListener("add-payment-part-btn", 
      "click",
      handleAddPaymentPart,
    );
    addListener("finalize-settlement-btn", 
      "click",
      handleFinalizeSettlement,
    );
    addListener("settle-close-btn", "click", () =>
      closeModal("settle-order-modal"),
    );
    addListener("details-close-btn", "click", () =>
      closeModal("order-details-modal"),
    );
    addListener("mobile-menu-button", "click", toggleSidebar);
    addListener("sidebar-overlay", "click", toggleSidebar);
    addListener("customer-history-close-btn", "click", () =>
      closeModal("customer-history-modal"),
    );
    addListener("back-to-summary-btn", "click", () => {
      getEl("secretary-detail-view").classList.add("hidden");
    });
    addListener("attendance-clock-in-btn", "click", handleClockIn);
    addListener("attendance-clock-out-btn", "click", handleClockOut);
    addListener("toggle-archive-btn", "click", () => {
      getEl("secretary-archive-container").classList.toggle("hidden");
    });
    addListener("sidebar-nav", "click", (e) => {
      const link = e.target.closest(".nav-link");
      if (link) {
        e.preventDefault();
        navigateTo(link.dataset.page);
      }
    });
    addListener("create-tournament-form", 
      "submit",
      handleNewTournament,
    );
    addListener("new-tournament-date-display", "click", () =>
      openShamsiDatePicker(
        "new-tournament-date",
        "new-tournament-date-display",
        true,
      ),
    );
    // The following listeners are now set dynamically when the forms are rendered
    // addListener('register-participant-form', 'submit', handleRegisterParticipant);
    // addListener('add-participant-form', 'submit', handleAddParticipant);
    // addListener('tournament-date-display', 'click', () => openShamsiDatePicker('tournament-date', 'tournament-date-display', true));

    // [NEW] Event listeners for Customers table searching and sorting
    let customerSearchTimeout;
    addListener("customer-search-input", "input", (e) => {
      clearTimeout(customerSearchTimeout);
      customerSearchTimeout = setTimeout(() => {
        customerViewState.searchTerm = e.target.value;
        customerViewState.currentPage = 1; // Reset to first page on new search
        fetchAndRenderCustomers();
      }, 300); // Debounce for 300ms
    });

    addListener("customers-load-more", "click", () =>
      loadMore("customers"),
    );

    // [NEW] Event listeners for Buffet table searching and sorting
    let buffetSearchTimeout;
    addListener("buffet-search-input", "input", (e) => {
      clearTimeout(buffetSearchTimeout);
      buffetSearchTimeout = setTimeout(() => {
        buffetViewState.searchTerm = e.target.value;
        buffetViewState.currentPage = 1;
        fetchAndRenderBuffet();
      }, 300);
    });

    addListener("buffet-load-more", "click", () =>
      loadMore("buffet"),
    );

    // [NEW] Event listeners for Reports table filtering
    let reportSearchTimeout;
    addListener("report-search-input", "input", (e) => {
      clearTimeout(reportSearchTimeout);
      reportSearchTimeout = setTimeout(() => {
        reportsViewState.searchTerm = e.target.value;
        reportsViewState.currentPage = 1;
        fetchAndRenderReports();
      }, 300);
    });

    addListener("report-payment-method-filter", "change", (e) => {
      reportsViewState.paymentMethod = e.target.value;
      reportsViewState.currentPage = 1;
      fetchAndRenderReports();
    });

    addListener("reports-load-more", "click", () =>
      loadMore("reports"),
    );

    addListener("report-date-from", "click", () => {
      openShamsiDatePicker(null, "report-date-from", false, (selectedDate) => {
        reportsViewState.dateFrom = selectedDate;
        reportsViewState.currentPage = 1;
        fetchAndRenderReports();
      });
    });

    addListener("report-date-to", "click", () => {
      openShamsiDatePicker(null, "report-date-to", false, (selectedDate) => {
        reportsViewState.dateTo = selectedDate;
        reportsViewState.currentPage = 1;
        fetchAndRenderReports();
      });
    });

    addListener("daily-orders-load-more", "click", () =>
      loadMore("dailyOrders"),
    );

    // [NEW] Event listeners for Expenses table searching and sorting
    let expenseSearchTimeout;
    addListener("expense-search-input", "input", (e) => {
      clearTimeout(expenseSearchTimeout);
      expenseSearchTimeout = setTimeout(() => {
        expensesViewState.searchTerm = e.target.value;
        expensesViewState.currentPage = 1;
        fetchAndRenderExpenses();
      }, 300);
    });

    addListener("expenses-load-more", "click", () =>
      loadMore("expenses"),
    );

    addListener("edit-description-form", 
      "submit",
      handleEditDescription,
    );
    addListener("edit-order-form", "submit", handleEditOrder);
    addListener("edit-limit-type-selector", "change", (e) => {
      const timeContainer = getEl("edit-time-limit-container");
      const amountContainer = getEl("edit-amount-limit-container");
      const endTimeContainer = getEl("edit-end-time-limit-container");

      timeContainer.classList.add("hidden");
      amountContainer.classList.add("hidden");
      endTimeContainer.classList.add("hidden");

      if (e.target.value === "time") {
        timeContainer.classList.remove("hidden");
      } else if (e.target.value === "amount") {
        amountContainer.classList.remove("hidden");
      } else if (e.target.value === "endTime") {
        endTimeContainer.classList.remove("hidden");
      }
    });

    // Event listener for report period buttons
    addListener("stats-period-selector", "click", (e) => {
      const target = e.target.closest("button");
      if (!target) return;

      const period = target.dataset.period;

      if (period) {
        reportsState.period = period;
        if (period === "specific_date") {
          openShamsiDatePicker(
            "specific-date-input",
            null,
            false,
            (selectedDate) => {
              const newMoment = moment(selectedDate, "YYYY-MM-DD");
              updateReports("specific_date", newMoment);
            },
          );
        } else {
          updateReports(period, TimeService.nowMoment());
        }
      } else if (target.id === "report-nav-prev") {
        const newMoment = reportsState.currentMoment
          .clone()
          .subtract(1, reportsState.period === "monthly" ? "months" : "years");
        updateReports(reportsState.period, newMoment);
      } else if (target.id === "report-nav-next") {
        const newMoment = reportsState.currentMoment
          .clone()
          .add(1, reportsState.period === "monthly" ? "months" : "years");
        updateReports(reportsState.period, newMoment);
      }
    });

    addListener("payment-method", "change", (e) => {
      const creditCustomerContainer = getEl(
        "credit-customer-selection-container",
      );
      const checkDateContainer = getEl("check-payment-date-container");
      const paymentAmountContainer = getEl("payment-amount-container");

      if (e.target.value === Constants.PAYMENT_TYPE_CREDIT) {
        creditCustomerContainer.classList.remove("hidden");
        checkDateContainer.classList.add("hidden");
        paymentAmountContainer.classList.remove("hidden");
        getEl("credit-customer-search").value = "";
        getEl("credit-customer-results").innerHTML = "";
        updateSettlementCreditInfo();
      } else if (e.target.value === Constants.PAYMENT_TYPE_CHECK || e.target.value === "check") {
        creditCustomerContainer.classList.add("hidden");
        checkDateContainer.classList.remove("hidden");
        paymentAmountContainer.classList.remove("hidden");
        const infoContainer = getEl("settle-credit-info-container");
        if (infoContainer) infoContainer.classList.add("hidden");
        const addBtn = getEl("add-payment-part-btn");
        if (addBtn) addBtn.disabled = false;
      } else {
        creditCustomerContainer.classList.add("hidden");
        checkDateContainer.classList.add("hidden");
        paymentAmountContainer.classList.remove("hidden");
        const infoContainer = getEl("settle-credit-info-container");
        if (infoContainer) infoContainer.classList.add("hidden");
        const addBtn = getEl("add-payment-part-btn");
        if (addBtn) addBtn.disabled = false;
      }
    });

    addListener("payment-amount", "input", () => {
      if (getEl("payment-method")?.value === Constants.PAYMENT_TYPE_CREDIT) {
        updateSettlementCreditInfo();
      }
    });

    addListener("check-payment-date-display", "click", () => {
      openShamsiDatePicker("check-payment-date", "check-payment-date-display");
    });

    addListener("add-credit-payment-method", "change", (e) => {
      const container = getEl("add-credit-check-date-container");
      if (e.target.value === Constants.PAYMENT_TYPE_CHECK || e.target.value === "check") {
        container.classList.remove("hidden");
      } else {
        container.classList.add("hidden");
      }
    });

    addListener("add-credit-check-date-display", "click", () => {
      openShamsiDatePicker("add-credit-check-date", "add-credit-check-date-display");
    });
    let creditCustomerSearchTimeout;
    addListener("credit-customer-search", "input", (e) => {
      const searchTerm = e.target.value.trim();
      const resultsContainer = getEl("credit-customer-results");
      if (!searchTerm) {
        resultsContainer.innerHTML = "";
        return;
      }
      clearTimeout(creditCustomerSearchTimeout);
      creditCustomerSearchTimeout = setTimeout(async () => {
        try {
          const result = await api.getData("customers", {
            search_term: searchTerm,
            limit: 10,
          });
          const filtered = result.data.filter((c) => c.id !== "guest_customer");
          resultsContainer.innerHTML = filtered
            .map(
              (c) =>
                `<div class="p-2 hover:bg-stone-700 cursor-pointer" data-id="${c.id}">${c.name} - ${formatCurrency(c.balance)}</div>`,
            )
            .join("");
        } catch (error) {
          console.error("Credit customer search failed:", error);
        }
      }, 300);
    });
    addListener("credit-customer-results", "click", (e) => {
      if (e.target.dataset.id) {
        const customerId = e.target.dataset.id;
        const customerName = e.target.textContent.split(" - ")[0];
        getEl("credit-customer-search").value = customerName;
        currentSettlement.creditPaymentCustomerId = customerId;
        getEl("credit-customer-results").innerHTML = "";
        updateSettlementCreditInfo();
      }
    });
    window.addEventListener("click", (e) => {
      const container = getEl("credit-customer-selection-container");
      if (container && !container.contains(e.target)) {
        const results = getEl("credit-customer-results");
        if (results) results.innerHTML = "";
      }
    });

    addListener("new-default-service-form", 
      "submit",
      handleNewDefaultService,
    );
    addListener("edit-default-service-form", 
      "submit",
      handleEditDefaultService,
    );

    addListener("default-service-select", "change", (e) => {
      const serviceId = e.target.value;
      if (!serviceId) {
        getEl("service-description").value = "";
        getEl("service-price").value = "";
        return;
      }
      const service = localData.defaultServices.find((s) => s.id === serviceId);
      if (service) {
        getEl("service-description").value = service.description;
        getEl("service-price").value = service.price;
      }
    });

    addListener("check-due-date-display", "click", () => {
      openShamsiDatePicker("check-due-date", "check-due-date-display");
    });
    addListener("edit-expense-due-date-display", "click", () => {
      openShamsiDatePicker(
        "edit-expense-due-date",
        "edit-expense-due-date-display",
      );
    });
    addListener("secretary-log-date-display", "click", () => {
      openShamsiDatePicker("secretary-log-date", "secretary-log-date-display");
    });
    addListener("shamsi-prev-month", "click", () => {
      shamsiPickerState.currentMoment.subtract(1, "jMonth");
      renderShamsiCalendar();
    });
    addListener("shamsi-next-month", "click", () => {
      shamsiPickerState.currentMoment.add(1, "jMonth");
      renderShamsiCalendar();
    });
    addListener("shamsi-datepicker-grid", 
      "click",
      handleDateSelection,
    );
    addListener("shamsi-datepicker-grid", 
      "keydown",
      handleDateSelection,
    );

    addListener("extend-session-form", 
      "submit",
      handleExtendSession,
    );
    addListener("extend-limit-type-selector", "change", (e) => {
      const timeContainer = getEl("extend-time-limit-container");
      const amountContainer = getEl("extend-amount-limit-container");
      timeContainer.classList.add("hidden");
      amountContainer.classList.add("hidden");
      if (e.target.value === "time") {
        timeContainer.classList.remove("hidden");
      } else if (e.target.value === "amount") {
        amountContainer.classList.remove("hidden");
      }
    });

    addListener("show-new-order-form-btn", "click", () => {
      getEl("new-order-form-container").classList.toggle("hidden");
    });

    // [NEW] Export button listeners
    addListener("export-excel-btn", "click", () =>
      exportTableToExcel("reports-table", "گزارش سفارشات"),
    );
    addListener("print-reports-btn", "click", () =>
      printTable("reports-table"),
    );

    // [NEW] Event listener for all currency inputs
    document.body.addEventListener("input", (e) => {
      if (e.target.classList.contains("currency-input")) {
        formatCurrencyInput(e);
      }
    });

    // Notification Settings Listeners
    const requestPermissionBtn = getEl("request-notification-permission-btn");
    if (requestPermissionBtn) {
      if (Notification.permission === "granted") {
        requestPermissionBtn.textContent = "دسترسی داده شده";
        requestPermissionBtn.disabled = true;
      } else if (Notification.permission === "denied") {
        requestPermissionBtn.textContent = "دسترسی رد شده";
        requestPermissionBtn.disabled = true;
      }
      requestPermissionBtn.addEventListener("click", () => {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            requestPermissionBtn.textContent = "دسترسی داده شده";
            requestPermissionBtn.disabled = true;
            showNotification("دسترسی برای نوتیفیکیشن‌ها با موفقیت داده شد.");
          } else {
            showNotification("شما دسترسی به نوتیفیکیشن‌ها را ندادید.", true);
          }
        });
      });
    }

    const enableNotificationsCheckbox = getEl("enable-notifications-checkbox");
    if (enableNotificationsCheckbox) {
      enableNotificationsCheckbox.checked =
        localData.appSettings?.notificationsEnabled ?? true;
      addListener("enable-notifications-checkbox", "change", (e) => {
        if (!localData.appSettings) localData.appSettings = {};
        localData.appSettings.notificationsEnabled = e.target.checked;
        localStorage.setItem(
          "appSettings",
          JSON.stringify(localData.appSettings),
        );
      });
    }

    const enableAutoSyncCheckbox = getEl("enable-autosync-checkbox");
    if (enableAutoSyncCheckbox) {
      enableAutoSyncCheckbox.checked = autoSyncEnabled;
      enableAutoSyncCheckbox.addEventListener("change", (e) => {
        autoSyncEnabled = e.target.checked;
        localStorage.setItem("autoSyncEnabled", autoSyncEnabled);
        if (autoSyncEnabled) pollVersions();
      });
    }

    addListener("show-login-btn", "click", () => {
      getEl("public-status-screen").classList.add("hidden");
      getEl("login-screen").classList.remove("hidden");
    });
    addListener("back-to-status-btn", "click", () => {
      getEl("login-screen").classList.add("hidden");
      getEl("public-status-screen").classList.remove("hidden");
    });
  }

  const formatDateForTimeInput = (date) => {
    if (!date) return "";
    return moment(date).format("HH:mm");
  };

  window.openEditDescriptionModal = (orderId) => {
    const order = localData.orders.find((o) => o.id === orderId);
    if (!order) return;

    getEl("edit-description-order-id").value = order.id;
    getEl("edit-order-description").value = order.description || "";
    openModal("edit-description-modal");
  };

  async function handleEditDescription(e) {
    e.preventDefault();
    const orderId = getEl("edit-description-order-id").value;
    const orderIndex = localData.orders.findIndex((o) => o.id === orderId);

    if (orderIndex > -1) {
      const updatedOrder = { ...localData.orders[orderIndex] };
      updatedOrder.description = getEl("edit-order-description").value;

      showLoading();
      try {
        await api.updateItem("orders", updatedOrder.id, updatedOrder);
        closeModal("edit-description-modal");
        showNotification("توضیحات سفارش با موفقیت ویرایش شد.");
        await fetchAndRenderPage("orders", true);
      } catch (error) {
        console.error("Failed to edit description:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در ویرایش توضیحات.", true);
        }
        await fetchAndRenderPage("orders", true);
      } finally {
        hideLoading();
      }
    }
  }

  window.openEditOrderModal = (orderId) => {
    const order = localData.orders.find((o) => o.id === orderId);
    if (!order) return;

    getEl("edit-order-id").value = order.id;
    getEl("edit-order-start-time").value = formatDateForTimeInput(
      order.startTime,
    );

    // Reset form
    getEl("edit-order-form").reset();
    getEl("edit-time-limit-container").classList.add("hidden");
    getEl("edit-amount-limit-container").classList.add("hidden");
    getEl("edit-end-time-limit-container").classList.add("hidden");
    document.querySelector(
      'input[name="editLimitType"][value="open"]',
    ).checked = true;

    // TODO: Logic to determine current limit type and populate fields
    // This is a simplified version for now. A more robust solution would
    // analyze the scheduledEndTime and rate to reverse-calculate the limit.
    if (order.scheduledEndTime) {
      document.querySelector(
        'input[name="editLimitType"][value="endTime"]',
      ).checked = true;
      getEl("edit-end-time-limit-container").classList.remove("hidden");
      getEl("edit-order-end-time").value = formatDateForTimeInput(
        order.scheduledEndTime,
      );
    }

    openModal("edit-order-modal");
  };

  async function handleEditOrder(e) {
    e.preventDefault();
    const orderId = getEl("edit-order-id").value;
    const orderIndex = localData.orders.findIndex((o) => o.id === orderId);

    if (orderIndex > -1) {
      const updatedOrder = { ...localData.orders[orderIndex] };
      const startTimeValue = getEl("edit-order-start-time").value;

      if (startTimeValue) {
        const originalDate = moment(updatedOrder.startTime).format(
          "YYYY-MM-DD",
        );
        updatedOrder.startTime = moment(
          `${originalDate} ${startTimeValue}`,
        ).toDate();
      }

      const limitType = document.querySelector(
        'input[name="editLimitType"]:checked',
      ).value;
      let scheduledEndTime = null;

      if (limitType === "time") {
        const durationMinutes = parseInt(getEl("edit-order-duration").value);
        if (!isNaN(durationMinutes) && durationMinutes > 0) {
          scheduledEndTime = moment(updatedOrder.startTime)
            .add(durationMinutes, "minutes")
            .toDate();
        }
      } else if (limitType === "amount") {
        const targetAmount = getNumericValue("edit-order-amount");
        const ratePrice = getEffectiveRatePrice(updatedOrder);
        if (targetAmount > 0 && ratePrice > 0) {
          const durationMinutes = (targetAmount / ratePrice) * 60;
          scheduledEndTime = moment(updatedOrder.startTime)
            .add(durationMinutes, "minutes")
            .toDate();
        } else if (ratePrice <= 0) {
          showNotification(
            "برای محدودیت مبلغ، کنسول باید یک تعرفه با قیمت مشخص داشته باشد.",
            true,
          );
          return;
        }
      } else if (limitType === "endTime") {
        const endTimeInput = getEl("edit-order-end-time").value;
        if (endTimeInput) {
          const originalDate = moment(updatedOrder.startTime).format(
            "YYYY-MM-DD",
          );
          scheduledEndTime = moment(`${originalDate} ${endTimeInput}`).toDate();
        }
      }

      updatedOrder.scheduledEndTime = scheduledEndTime;

      showLoading();
      try {
        await api.updateItem("orders", updatedOrder.id, updatedOrder);
        closeModal("edit-order-modal");
        showNotification("زمان و محدودیت سفارش با موفقیت ویرایش شد.");
        await fetchAndRenderPage("orders", true);
      } catch (error) {
        console.error("Failed to edit order:", error);
        if (error.status === 409) {
          showNotification(
            "این اطلاعات توسط کاربر دیگری تغییر کرده است. لطفا صفحه را رفرش کرده و دوباره تلاش کنید.",
            true,
          );
        } else {
          showNotification("خطا در ویرایش سفارش.", true);
        }
        await fetchAndRenderPage("orders", true);
      } finally {
        hideLoading();
      }
    }
  }

  // --- [NEW] Export and Print Functions ---
  function exportTableToExcel(tableId, filename = "") {
    const table = getEl(tableId);
    const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet JS" });
    const finalFilename = `${filename}_${TimeService.nowDate().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, finalFilename);
  }

  function printTable(tableId) {
    const table = getEl(tableId);
    const newWin = window.open("");
    newWin.document.write("<html><head><title>Print</title>");
    newWin.document.write(
      '<style>body { font-family: "Vazirmatn", sans-serif; direction: rtl; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 8px; } th { background-color: #f2f2f2; }</style>',
    );
    newWin.document.write("</head><body>");
    newWin.document.write(table.outerHTML);
    newWin.document.write("</body></html>");
    newWin.document.close();
    newWin.focus();
    newWin.print();
    newWin.close();
  }

  let publicStatusInterval = null;
  let publicClockInterval = null;
  let publicTimerInterval = null;
  let previousPublicStatus = {};

  function initPublicStatus() {
    getEl("public-status-screen").classList.remove("hidden");
    getEl("current-year-status").textContent = TimeService.nowDate().getFullYear();

    updatePublicClock();
    if (publicClockInterval) clearInterval(publicClockInterval);
    publicClockInterval = setInterval(updatePublicClock, 1000);

    if (publicTimerInterval) clearInterval(publicTimerInterval);
    publicTimerInterval = setInterval(updatePublicElapsedTimers, 1000);

    fetchAndDisplayPublicStatus();
    if (publicStatusInterval) clearInterval(publicStatusInterval);
    publicStatusInterval = setInterval(fetchAndDisplayPublicStatus, 30000);
  }

  function updatePublicClock() {
    const clockDiv = getEl("digital-clock");
    if (!clockDiv) return;
    const now = TimeService.nowDate();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    clockDiv.textContent = `${hours}:${minutes}:${seconds}`;
  }

  function updatePublicElapsedTimers() {
    document.querySelectorAll('#status-container .card-timer[data-start-time]').forEach(timerDiv => {
      const startTime = moment(timerDiv.dataset.startTime);
      const now = TimeService.nowMoment();
      const duration = moment.duration(now.diff(startTime));
      const hours = String(Math.floor(duration.asHours())).padStart(2, '0');
      const minutes = String(duration.minutes()).padStart(2, '0');
      const seconds = String(duration.seconds()).padStart(2, '0');
      timerDiv.innerHTML = `مدت گذشته: <strong>${hours}:${minutes}:${seconds}</strong>`;
    });
  }

  async function fetchAndDisplayPublicStatus() {
    const statusContainer = getEl("status-container");
    if (!statusContainer) return;

    try {
      const response = await fetch(`${API_BASE}?action=public_status`);
      if (!response.ok) throw new Error('Network response error');

      const data = await response.json();

      if (data.success) {
        renderPublicStatus(data.data);
        renderPublicTournamentsStatus(data.data.tournaments);
        previousPublicStatus = data.data;
      } else {
        statusContainer.innerHTML = `<p class="text-center col-span-full text-red-400">خطا: ${data.error}</p>`;
      }
    } catch (error) {
      console.error("Fetch error:", error);
      statusContainer.innerHTML = `<p class="text-center col-span-full text-red-400">امکان برقراری ارتباط با سرور وجود ندارد.</p>`;
    }
  }

  function renderPublicStatus(data) {
    const statusContainer = getEl("status-container");
    if (!statusContainer) return;

    statusContainer.innerHTML = '';

    const { consoles, active_orders } = data;
    consoles.sort((a, b) => parseInt(a.number) - parseInt(b.number));

    const ICONS_STATUS = {
      AVAILABLE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1.5rem; height: 1.5rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
      OCCUPIED: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1.5rem; height: 1.5rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`
    };

    consoles.forEach((consoleItem, index) => {
      const activeOrder = active_orders.find(order => order.consoleId === consoleItem.id);
      const card = document.createElement('div');
      // card.style.animationDelay disabled

      let statusClass, statusIcon, statusText, timerHTML = '';

      if (activeOrder) {
        statusClass = 'occupied';
        statusIcon = ICONS_STATUS.OCCUPIED;
        statusText = 'مشغول';

        if (activeOrder.scheduledEndTime) {
          const endTime = moment(activeOrder.scheduledEndTime);
          const now = TimeService.nowMoment();
          if (endTime.isAfter(now)) {
            const duration = moment.duration(endTime.diff(now));
            const hours = String(Math.floor(duration.asHours())).padStart(2, '0');
            const minutes = String(duration.minutes()).padStart(2, '0');
            timerHTML = `<div class="card-timer">حدود <strong>${hours}:${minutes}</strong> دیگر خالی می‌شود</div>`;
          } else {
            timerHTML = `<div class="card-timer">زمان به پایان رسیده</div>`;
          }
        } else if (activeOrder.startTime) {
          timerHTML = `<div class="card-timer" data-start-time="${activeOrder.startTime}"></div>`;
        } else {
          timerHTML = `<div class="card-timer">زمان بازی: <strong>آزاد</strong></div>`;
        }
      } else {
        statusClass = 'available';
        statusIcon = ICONS_STATUS.AVAILABLE;
        statusText = 'آماده و خالی';
      }

      card.className = `status-card ${statusClass}`;
      card.innerHTML = `
        <div class="card-title">${consoleItem.type} ${consoleItem.number}</div>
        <div class="card-status-container">
          <div class="card-status-icon">${statusIcon}</div>
          <div class="card-status-text">${statusText}</div>
        </div>
        ${timerHTML}
      `;
      statusContainer.appendChild(card);
    });
  }

  function renderPublicTournamentsStatus(tournaments) {
    const container = getEl('tournaments-list-status');
    if (!container) return;
    const now = TimeService.nowDate();

    const upcomingAndActiveTournaments = tournaments.filter(t => !t.isFinished);

    if (!upcomingAndActiveTournaments || upcomingAndActiveTournaments.length === 0) {
      container.innerHTML = '<p class="text-center text-stone-400 col-span-full">در حال حاضر تورنومنتی فعال یا در صف برگزاری نیست.</p>';
      return;
    }

    container.innerHTML = upcomingAndActiveTournaments.map(tournament => {
      const startTime = new Date(tournament.startDate);
      const isActive = startTime <= now;

      if (isActive) {
        let bracketHTML = '<div class="text-left">';
        if (tournament.bracket && Object.keys(tournament.bracket).length > 0) {
          bracketHTML += '<h4 class="text-lg font-bold mt-4 mb-2 text-center text-amber-400">جدول مسابقات</h4>';
          bracketHTML += '<div class="flex space-x-4 overflow-x-auto p-4">';
          for (const roundName in tournament.bracket) {
            bracketHTML += `<div class="flex-shrink-0 w-72 space-y-4">`;
            bracketHTML += `<h5 class="text-md font-bold text-center text-amber-400">${roundName.replace('-', ' ')}</h5>`;
            tournament.bracket[roundName].forEach((match) => {
              const isP1Winner = match.winner && match.winner.id === match.p1.id;
              const isP2Winner = match.winner && match.winner.id === match.p2.id;
              bracketHTML += `
                <div class="bg-stone-800 p-3 rounded-lg">
                  <div class="flex flex-col space-y-2">
                    <span class="p-2 ${isP1Winner ? 'text-green-400 font-bold' : ''}">${match.p1.name}</span>
                    <div class="text-center text-xs text-stone-500">VS</div>
                    <span class="p-2 ${isP2Winner ? 'text-green-400 font-bold' : ''}">${match.p2.name}</span>
                  </div>
                </div>
              `;
            });
            bracketHTML += `</div>`;
          }
          bracketHTML += '</div>';
        } else {
          bracketHTML += '<p class="text-stone-400 text-center mt-4">قرعه‌کشی هنوز انجام نشده است.</p>';
        }
        bracketHTML += '</div>';

        return `
          <div>
            <div class="status-card occupied animate-pulse">
              <div class="card-title">${tournament.name}</div>
              <div class="text-lg text-stone-300 mt-2 space-y-2">
                <div class="flex justify-between"><span>وضعیت:</span><span class="font-bold text-red-400">در حال برگزاری</span></div>
                <div class="flex justify-between"><span>بازی:</span><span class="font-bold">${tournament.game}</span></div>
                <div class="flex justify-between"><span>شرکت کنندگان:</span><span class="font-bold">${tournament.participants.length} نفر</span></div>
              </div>
              ${bracketHTML}
            </div>
          </div>
        `;
      } else {
        return `
          <div class="status-card available">
            <div class="card-title">${tournament.name}</div>
            <div class="text-lg text-stone-300 mt-2 space-y-2">
              <div class="flex justify-between"><span>وضعیت:</span><span class="font-bold text-green-400">پیش ثبت نام</span></div>
              <div class="flex justify-between"><span>بازی:</span><span class="font-bold">${tournament.game}</span></div>
              <div class="flex justify-between"><span>زمان شروع:</span><span class="font-bold">${new Date(tournament.startDate).toLocaleString('fa-IR')}</span></div>
              <div class="flex justify-between"><span>ظرفیت:</span><span class="font-bold">${tournament.participants.length} نفر ثبت نام کرده‌اند</span></div>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  async function init() {
    window.NotificationCenter.init();
    resetLocalData();
    setupEventListeners();
    addRateField("rate-fields-container");

    const savedUser = sessionStorage.getItem("currentUser");
    if (savedUser) {
      currentUser = JSON.parse(savedUser);

      // Verify session on server and load essential data
      try {
        const response = await fetch(`${API_BASE}?action=get_versions`);
        if (response.status === 401) {
          handleLogout();
          return;
        }
        const result = await response.json();
        if (result.success) {
          lastServerVersions = result.data.versions;
          if (result.data.server_time) TimeService.sync(result.data.server_time);
        }

        await loadEssentialData();

        // Verify user still exists in the freshly loaded data
        const userExistsOnServer = localData.users.find(
          (u) => u.id === currentUser.id,
        );
        if (userExistsOnServer) {
          updateSidebarVisibility();
          showApp();
        } else {
          handleLogout();
        }
      } catch (e) {
        console.error("Initial session check or data load failed", e);
        showNotification(
          "خطا در ارتباط با سرور. لطفا صفحه را رفرش کنید.",
          true,
        );
      }
    } else {
      initPublicStatus();
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const usernameEl = getEl("username");
    const passwordEl = getEl("password");
    if (!usernameEl || !passwordEl) return;

    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();

    const response = await fetch(`${API_BASE}?action=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json();

    if (result.success) {
      const user = result.data;
      currentUser = {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        permissions:
          user.permissions || (user.isAdmin ? Object.values(PERMISSIONS) : []),
      };
      sessionStorage.setItem("currentUser", JSON.stringify(currentUser));

      const inPagesDir = window.location.pathname.includes('/pages/');
      window.location.href = inPagesDir ? 'orders.html' : 'pages/orders.html';
    } else {
      const errorEl = getEl("login-error");
      if (errorEl) {
        errorEl.textContent = "نام کاربری یا رمز عبور اشتباه است.";
        errorEl.classList.remove("hidden");
      }
    }
  }

    async function pollVersions() {
    if (!autoSyncEnabled || !currentUser) return;

    // Also update Attendance UI if on secretary page during polling
    const activePageEl = document.querySelector(".nav-link.active");
    if (activePageEl && activePageEl.dataset.page === "secretary") {
      updateAttendanceUI();
    }

    try {
      const response = await fetch(`${API_BASE}?action=get_versions`);
      const result = await response.json();
      if (!result.success) return;

      const newVersions = result.data.versions;
      if (result.data.server_time) TimeService.sync(result.data.server_time);

      // On first run, just populate and return
      if (Object.keys(lastServerVersions).length === 0) {
        lastServerVersions = newVersions;
        return;
      }

      let changedTables = [];
      for (const table in newVersions) {
        if (
          !lastServerVersions[table] ||
          newVersions[table].total_version !==
            lastServerVersions[table].total_version ||
          newVersions[table].count !== lastServerVersions[table].count
        ) {
          changedTables.push(table);
        }
      }

      if (changedTables.length > 0) {
        // Map tables to pages
        const tableToPages = {
          orders: ["orders", "reports"],
          customers: ["customers", "orders", "reports"],
          buffet: ["buffet", "orders", "reports"],
          expenses: ["expenses", "reports"],
          consoles: ["orders", "settings"],
          users: ["settings", "secretary"],
          default_services: ["settings", "orders"],
          tournaments: ["tournaments"],
          secretary_log: ["secretary"],
        };

        const activePageEl = document.querySelector(".nav-link.active");
        const activePage = activePageEl ? activePageEl.dataset.page : null;

        if (activePage) {
          const needsRefresh = changedTables.some(
            (table) =>
              tableToPages[table] && tableToPages[table].includes(activePage),
          );

          if (needsRefresh) {
            console.log(
              `Auto Sync: Refreshing ${activePage} due to changes in ${changedTables.join(", ")}`,
            );
            await fetchAndRenderPage(activePage, true, true);
          }
        }
      }

      lastServerVersions = newVersions;
    } catch (error) {
      console.error("Auto Sync Polling failed:", error);
    }
  }

function showAppForPage(pageId) {
    const loginScreen = getEl("login-screen");
    if (loginScreen) loginScreen.classList.add("hidden");
    const appContainer = getEl("app-container");
    if (appContainer) {
      appContainer.classList.remove("hidden");
      appContainer.classList.add("flex", "flex-col", "md:flex-row");
    }
    const navSettings = getEl("nav-settings");
    if (navSettings) {
      navSettings.style.display = hasPermission(PERMISSIONS.VIEW_SETTINGS) ? "flex" : "none";
    }
    const navReports = getEl("nav-reports");
    if (navReports) {
      navReports.style.display = hasPermission(PERMISSIONS.VIEW_REPORTS) ? "flex" : "none";
    }

    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.page === pageId);
    });

    const targetPage = getEl(`${pageId}-page`);
    if (targetPage) {
      targetPage.classList.remove("hidden");
    }

    fetchAndRenderPage(pageId, false);

    setInterval(pollVersions, 30000);
  }

  async function init() {
    window.NotificationCenter.init();
    resetLocalData();
    setupEventListeners();

    const path = window.location.pathname;
    const inPagesDir = path.includes('/pages/');
    const fileName = path.split('/').pop().replace('.html', '');
    const currentPage = inPagesDir ? (fileName || 'orders') : (fileName === 'index' || fileName === '' ? 'status' : 'status');

    if (currentPage === 'status') {
      initPublicStatus();
      return;
    }

    const savedUser = sessionStorage.getItem("currentUser");
    if (savedUser) {
      currentUser = JSON.parse(savedUser);

      try {
        const response = await fetch(`${API_BASE}?action=get_versions`);
        if (response.status === 401) {
          handleLogout();
          return;
        }
        const result = await response.json();
        if (result.success) {
          lastServerVersions = result.data.versions;
          if (result.data.server_time) TimeService.sync(result.data.server_time);
        }

        await loadEssentialData();

        const userExistsOnServer = localData.users.find(
          (u) => u.id === currentUser.id,
        );
        if (userExistsOnServer) {
          const firstPermittedPage = Object.keys(PAGE_PERMISSIONS).find((p) => hasPermission(PAGE_PERMISSIONS[p])) || "orders";

          if (currentPage === 'login') {
            window.location.href = inPagesDir ? `${firstPermittedPage}.html` : `pages/${firstPermittedPage}.html`;
            return;
          }

          const requiredPerm = PAGE_PERMISSIONS[currentPage];
          if (requiredPerm && !hasPermission(requiredPerm)) {
            showNotification("شما دسترسی لازم برای مشاهده این صفحه را ندارید.", true);
            window.location.href = inPagesDir ? `${firstPermittedPage}.html` : `pages/${firstPermittedPage}.html`;
            return;
          }

          updateSidebarVisibility();
          showAppForPage(currentPage);
        } else {
          handleLogout();
        }
      } catch (e) {
        console.error("Initial session check or data load failed", e);
        showNotification(
          "خطا در ارتباط با سرور. لطفا صفحه را رفرش کنید.",
          true,
        );
      }
    } else {
      if (currentPage !== 'login') {
        window.location.href = inPagesDir ? 'login.html' : 'pages/login.html';
      } else {
        const loginScreen = getEl("login-screen");
        if (loginScreen) loginScreen.classList.remove("hidden");
      }
    }
  }

  init();
});
