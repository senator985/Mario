<?php

namespace Core;

class Constants
{
    // Order Statuses
    public const ORDER_STATUS_ACTIVE = 'active';
    public const ORDER_STATUS_PENDING = 'pending_payment';
    public const ORDER_STATUS_PAID = 'paid';
    public const ORDER_STATUS_CANCELLED = 'cancelled';

    // Payment Types
    public const PAYMENT_TYPE_CASH = 'cash';
    public const PAYMENT_TYPE_CARD = 'card';
    public const PAYMENT_TYPE_CARD_TO_CARD = 'card_to_card';
    public const PAYMENT_TYPE_CREDIT = 'credit';
    public const PAYMENT_TYPE_DISCOUNT = 'discount';
    public const PAYMENT_TYPE_CHECK = 'check';

    // User Statuses
    public const USER_STATUS_ACTIVE = 'active';
    public const USER_STATUS_INACTIVE = 'inactive';

    // Secretary / Attendance Log Statuses
    public const LOG_STATUS_OPEN = 'open';
    public const LOG_STATUS_CLOSED = 'closed';
    public const LOG_STATUS_PAID = 'paid';

    // Constant Messages
    public const MSG_SUCCESS = 'عملیات با موفقیت انجام شد';
    public const MSG_ERROR = 'خطایی رخ داده است';
    public const MSG_UNAUTHORIZED = 'دسترسی غیرمجاز';
    public const MSG_INVALID_ACTION = 'عملیات نامعتبر.';
    public const MSG_ORDER_NOT_FOUND = 'سفارش یافت نشد.';
    public const MSG_ORDER_PAID = 'امکان ویرایش سفارش تسویه شده وجود ندارد.';
    public const MSG_INVALID_PARAMS = 'پارامترهای نامعتبر.';
    public const MSG_INCOMPLETE_INFO = 'اطلاعات ناقص.';
    public const MSG_CUSTOMER_NOT_FOUND = 'Customer not found.';
}
