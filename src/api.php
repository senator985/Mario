<?php
namespace Core {

    use DateTime;
    use DateTimeZone;

    class TimeService
    {
        private static ?string $timezone = 'Asia/Tehran';

        public static function setTimezone(string $timezone): void
        {
            self::$timezone = $timezone;
            date_default_timezone_set($timezone);
        }

        public static function getTimezone(): string
        {
            return self::$timezone ?? date_default_timezone_get();
        }

        public static function createDateTime(string $datetime = 'now'): DateTime
        {
            return new DateTime($datetime, new DateTimeZone(self::getTimezone()));
        }

        public static function now(string $format = 'Y-m-d H:i:s'): string
        {
            return self::createDateTime()->format($format);
        }

        public static function date(string $format = 'Y-m-d'): string
        {
            return self::createDateTime()->format($format);
        }

        public static function time(string $format = 'H:i:s'): string
        {
            return self::createDateTime()->format($format);
        }

        public static function timestampMs(): float
        {
            return round(microtime(true) * 1000);
        }
    }
}

namespace {

    require_once __DIR__ . '/Constants.php';
    use Core\TimeService;
    use Core\Constants;

    // نمایش خطاها برای دیباگ فعال شد
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
    date_default_timezone_set('Asia/Tehran');

    header("Content-Type: application/json; charset=utf-8");

    // Load database configuration from .env file
    $envFile = __DIR__ . '/../.env';
    if (file_exists($envFile)) {
        $env = parse_ini_file($envFile);
        $db_host = $env['DB_HOST'] ?? '127.0.0.1';
        $db_user = $env['DB_USER'] ?? '';
        $db_pass = $env['DB_PASS'] ?? '';
        $db_name = $env['DB_NAME'] ?? '';
    } else {
        $db_host = getenv('DB_HOST') ?: '127.0.0.1';
        $db_user = getenv('DB_USER') ?: '';
        $db_pass = getenv('DB_PASS') ?: '';
        $db_name = getenv('DB_NAME') ?: '';
    }

    session_start();

    TimeService::setTimezone('Asia/Tehran');

    try {
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
        $conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
        $conn->set_charset("utf8mb4");
    } catch (mysqli_sql_exception $e) {
        http_response_code(503); // Service Unavailable
        die(json_encode([
            'success' => false,
            'error' => 'Service temporarily unavailable. Please try again in a few moments.',
            'details' => $e->getMessage() // فقط برای دیباگ - در محیط پروداکشن حذف شود
        ]));
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $action = $_GET['action'] ?? null;

    // Enforce authentication for all actions except login and public_status
    if ($action !== 'login' && $action !== 'public_status' && !isset($_SESSION['user_id'])) {
        http_response_code(401);
        die(json_encode(['success' => false, 'error' => 'Unauthorized']));
    }

    function send_success($data = null, $message = "Operation successful") {
        echo json_encode(['success' => true, 'data' => $data, 'message' => $message]);
        exit;
    }

    function send_error($message, $code = 400) {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $message]);
        exit;
    }

    function get_order_by_id($conn, $order_id, $for_update = false) {
        $sql = "SELECT data, version FROM orders WHERE id = ?";
        if ($for_update) {
            $sql .= " FOR UPDATE";
        }
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('s', $order_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $order_row = $result->fetch_assoc();
        if (!$order_row) return null;
        
        $order_data = json_decode($order_row['data'], true);
        $order_data['version'] = (int)$order_row['version'];
        return $order_data;
    }

    function get_next_invoice_number($conn) {
        // This function should be called within an existing transaction
        $inv_res = $conn->query("SELECT MAX(CAST(JSON_EXTRACT(data, '$.invoiceNumber') AS UNSIGNED)) as max_inv FROM orders FOR UPDATE");
        if (!$inv_res) {
            throw new Exception("Failed to query for max invoice number: " . $conn->error);
        }
        $max_inv_row = $inv_res->fetch_assoc();
        return ($max_inv_row && $max_inv_row['max_inv']) ? (int)$max_inv_row['max_inv'] + 1 : 1;
    }

    switch ($action) {
        default:
            send_error("Invalid action specified.");
            break;

        case 'public_status':
            $data = [];
            $tables_with_fields = [
                'consoles' => ['id', 'type', 'number'],
                'tournaments' => ['id', 'name', 'game', 'startDate', 'participants', 'isFinished', 'bracket']
            ];

            foreach ($tables_with_fields as $table => $fields) {
                $json_object_params = [];
                foreach ($fields as $field) {
                    if (in_array($field, ['participants', 'bracket', 'isFinished'])) {
                        $json_object_params[] = "'$field', JSON_EXTRACT(data, '$.$field')";
                    } else {
                        $json_object_params[] = "'$field', JSON_UNQUOTE(JSON_EXTRACT(data, '$.$field'))";
                    }
                }
                $json_object_string = implode(', ', $json_object_params);

                $query = "SELECT JSON_OBJECT($json_object_string) as data FROM `$table`";
                $result = $conn->query($query);
                if ($result === false) send_error("Failed to fetch $table: " . $conn->error);

                $rows = [];
                while($row = $result->fetch_assoc()) {
                    if (isset($row['data'])) {
                        $decoded_data = json_decode($row['data'], true);
                        if (json_last_error() === JSON_ERROR_NONE) {
                           $rows[] = $decoded_data;
                        }
                    }
                }
                $data[$table] = $rows;
            }

            // Securely fetch only active orders instead of all orders
            $result = $conn->query("SELECT data FROM `orders` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = '" . Constants::ORDER_STATUS_ACTIVE . "'");
            if ($result === false) send_error("Failed to fetch active orders: " . $conn->error);

            $active_orders = [];
            while($row = $result->fetch_assoc()) {
                $decoded_data = json_decode($row['data'], true);
                if (json_last_error() === JSON_ERROR_NONE) {
                   $active_orders[] = $decoded_data;
                }
            }
            $data['active_orders'] = $active_orders;

            send_success($data);
            break;

        case 'login':
            $username = $input['username'] ?? '';
            $password = $input['password'] ?? '';
            $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
            $stmt->bind_param("s", $username);
            $stmt->execute();
            $user = $stmt->get_result()->fetch_assoc();
            if ($user && ($password === $user['password'] || password_verify($password, $user['password']))) {
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['isAdmin'] = (bool)$user['isAdmin'];
                unset($user['password']);
                send_success($user);
            } else {
                send_error("نام کاربری یا رمز عبور اشتباه است.");
            }
            break;

        case 'get_versions':
            $tables = ['users', 'customers', 'consoles', 'buffet', 'orders', 'expenses', 'default_services', 'tournaments', 'secretary_log'];
            $versions = [];
            foreach ($tables as $table) {
                $res = $conn->query("SELECT SUM(version) as total_version, COUNT(*) as count FROM `$table` shadow_table");
                if ($res) {
                    $row = $res->fetch_assoc();
                    $versions[$table] = [
                        'total_version' => (int)($row['total_version'] ?? 0),
                        'count' => (int)($row['count'] ?? 0)
                    ];
                } else {
                    $versions[$table] = ['total_version' => 0, 'count' => 0];
                }
            }
            send_success([
                'versions' => $versions,
                'server_time' => TimeService::timestampMs()
            ]);
            break;

        case 'get_reports_summary':
            $period = $_GET['period'] ?? 'daily';
            $date = $_GET['date'] ?? TimeService::date();
            $start_date = $_GET['startDate'] ?? '';
            $end_date = $_GET['endDate'] ?? '';

            if (!$start_date || !$end_date || $start_date === 'undefined' || $end_date === 'undefined') {
                if ($period === 'daily' || $period === 'specific_date') {
                    $start_date = date('Y-m-d 00:00:00', strtotime($date));
                    $end_date = date('Y-m-d 23:59:59', strtotime($date));
                } elseif ($period === 'monthly') {
                    $start_date = date('Y-m-01 00:00:00', strtotime($date));
                    $end_date = date('Y-m-t 23:59:59', strtotime($date));
                } elseif ($period === 'yearly') {
                    $start_date = date('Y-01-01 00:00:00', strtotime($date));
                    $end_date = date('Y-12-31 23:59:59', strtotime($date));
                }
            }

            // Fetch All Paid Orders
            $stmt = $conn->prepare("SELECT data FROM orders WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = '" . Constants::ORDER_STATUS_PAID . "'");
            if (!$stmt) send_error("Internal server error: " . $conn->error);
            $stmt->execute();
            $orders_res = $stmt->get_result();

            $stats = [
                'consoleRevenue' => 0, 'buffetRevenue' => 0, 'servicesRevenue' => 0, 'buffetProfit' => 0,
                'cashPayment' => 0, 'cardPayment' => 0, 'cardToCardPayment' => 0, 'creditPayment' => 0, 'checkPayment' => 0, 'totalDiscount' => 0,
                'totalExpenses' => 0, 'netProfit' => 0,
                'points' => ['income' => [], 'expense' => []]
            ];

            $filter_start_day = substr($start_date, 0, 10);
            $filter_end_day = substr($end_date, 0, 10);

            while ($row = $orders_res->fetch_assoc()) {
                $order = json_decode($row['data'], true);
                $orderSettlementTime = str_replace('T', ' ', $order['settlementTime'] ?? $order['endDate'] ?? '');
                $orderSettlementDay = substr($orderSettlementTime, 0, 10);
                $isOrderInDateRange = ($orderSettlementDay >= $filter_start_day && $orderSettlementDay <= $filter_end_day);

                if ($isOrderInDateRange) {
                    $stats['consoleRevenue'] += $order['finalGameCost'] ?? 0;
                    $stats['totalDiscount'] += $order['discountAmount'] ?? 0;
                    foreach ($order['buffetItems'] ?? [] as $item) {
                        $r = $item['sellPrice'] * $item['quantity'];
                        $stats['buffetRevenue'] += $r;
                        $stats['buffetProfit'] += ($r - ($item['buyPrice'] * $item['quantity']));
                    }
                    foreach ($order['services'] ?? [] as $s) { $stats['servicesRevenue'] += $s['price']; }
                }

                $orderIncomePoint = 0;
                foreach ($order['payments'] ?? [] as $p) {
                    $paymentMethod = $p['method'] ?? '';
                    // For check payments, effective date is checkDate; otherwise order's settlementTime
                    if ($paymentMethod === Constants::PAYMENT_TYPE_CHECK || $paymentMethod === 'check') {
                        $paymentDate = $p['checkDate'] ?? $orderSettlementDay;
                    } else {
                        $paymentDate = $orderSettlementDay;
                    }
                    $paymentDay = substr(str_replace('T', ' ', $paymentDate), 0, 10);

                    if ($paymentDay >= $filter_start_day && $paymentDay <= $filter_end_day) {
                        if ($paymentMethod === Constants::PAYMENT_TYPE_CASH) $stats['cashPayment'] += $p['amount'];
                        if ($paymentMethod === Constants::PAYMENT_TYPE_CARD) $stats['cardPayment'] += $p['amount'];
                        if ($paymentMethod === Constants::PAYMENT_TYPE_CARD_TO_CARD) $stats['cardToCardPayment'] += $p['amount'];
                        if ($paymentMethod === Constants::PAYMENT_TYPE_CREDIT) $stats['creditPayment'] += $p['amount'];
                        if ($paymentMethod === Constants::PAYMENT_TYPE_CHECK || $paymentMethod === 'check') $stats['checkPayment'] += $p['amount'];

                        if ($paymentMethod === Constants::PAYMENT_TYPE_CASH || $paymentMethod === Constants::PAYMENT_TYPE_CARD || $paymentMethod === Constants::PAYMENT_TYPE_CARD_TO_CARD || $paymentMethod === Constants::PAYMENT_TYPE_CHECK || $paymentMethod === 'check') {
                            $orderIncomePoint += $p['amount'];
                        }
                    }
                }

                if ($orderIncomePoint > 0) {
                    $stats['points']['income'][] = [
                        't' => $orderSettlementTime,
                        'a' => $orderIncomePoint
                    ];
                }
            }

            // Fetch Expenses
            // Note: paidAt is DATETIME, while dueDate and createdAt are TEXT.
            // We use a unified effective date for both filtering and plotting to ensure consistency.
            // We handle both camelCase 'paidAt' and underscore 'paid_at' columns.
            $eff_date_sql = "COALESCE(NULLIF(paidAt, '0000-00-00 00:00:00'), NULLIF(paid_at, '0000-00-00 00:00:00'), NULLIF(dueDate, ''), NULLIF(createdAt, ''))";
            $stmt_exp = $conn->prepare("SELECT amount, $eff_date_sql AS eff_date FROM expenses WHERE type = 'expense' AND LEFT(REPLACE($eff_date_sql, 'T', ' '), 10) BETWEEN LEFT(?, 10) AND LEFT(?, 10)");
            $stmt_exp->bind_param("ss", $start_date, $end_date);
            $stmt_exp->execute();
            $exp_res = $stmt_exp->get_result();
            while ($row = $exp_res->fetch_assoc()) {
                $stats['totalExpenses'] += $row['amount'];
                $stats['points']['expense'][] = [
                    't' => str_replace('T', ' ', $row['eff_date'] ?? ''),
                    'a' => $row['amount']
                ];
            }

            // Note: Paid Secretary Logs are currently excluded from totalExpenses because users
            // manually log wages as normal expenses. This avoids double-counting.

            $stats['netProfit'] = $stats['cashPayment'] + $stats['cardPayment'] + $stats['cardToCardPayment'] + $stats['checkPayment'] - $stats['totalExpenses'];
            send_success($stats);
            break;

        case 'get_data':
            $type = $_GET['type'] ?? null;
            if (!$type || !in_array($type, ['users', 'customers', 'consoles', 'buffet', 'orders', 'expenses', 'default_services', 'tournaments', 'secretary_log'])) {
                send_error("Invalid data type provided.");
            }

            // --- Parameters for Filtering, Sorting, and Searching ---
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 0; // 0 means no pagination, get all

            $customer_id = $_GET['customer_id'] ?? null;

            // Set default limit for potentially large tables if not specified
            if ($limit === 0 && !$customer_id && in_array($type, ['orders', 'customers', 'buffet', 'expenses'])) {
                $limit = 50;
            }
            $search_term = $_GET['search_term'] ?? null;
            $sort_by = $_GET['sort_by'] ?? null;
            $sort_order = $_GET['sort_order'] ?? 'ASC';
            $date_from = $_GET['date_from'] ?? null;
            $date_to = $_GET['date_to'] ?? null;
            $filter_id = $_GET['id'] ?? null;
            $status = $_GET['status'] ?? null;
            $dashboard = isset($_GET['dashboard']) && $_GET['dashboard'] === 'true';

            // --- Whitelists for Security ---
            $sortable_columns = [
                'customers' => ['name', 'subCode', 'balance'],
                'buffet' => ['name', 'buyPrice', 'sellPrice', 'stock'],
                'orders' => ['invoiceNumber', 'settlementTime', 'totalAmount'], // JSON fields
            ];
            $searchable_columns_json = [
                 'orders' => ['invoiceNumber', 'description']
            ];

            // --- Dynamic Query Building ---
            $where_clauses = [];
            $bind_params = [];
            $bind_types = '';
            $base_query = "FROM `$type`";
            $select_cols = ($type === 'orders') ? "o.*, c.name AS customer_name" : "$type.*";

            if ($type === 'orders') {
                $base_query = "FROM `orders` o LEFT JOIN `customers` c ON JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.customerId')) = c.id";
            }

            // ID Filtering (for targeted sync)
            if ($filter_id) {
                $col_id = ($type === 'orders') ? "o.id" : "id";
                $where_clauses[] = "$col_id = ?";
                $bind_params[] = $filter_id;
                $bind_types .= 's';
            }

            // Status Filtering (for orders)
            if ($type === 'orders' && $status) {
                $where_clauses[] = "JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.status')) = ?";
                $bind_params[] = $status;
                $bind_types .= 's';
            }

            // Customer Filtering (for orders)
            if ($type === 'orders' && $customer_id) {
                $where_clauses[] = "(JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.customerId')) = ? OR o.data LIKE ?)";
                $bind_params[] = $customer_id;
                $bind_params[] = "%" . $customer_id . "%";
                $bind_types .= 'ss';
            }

            // Payment Method Filtering (for orders)
            $payment_method = $_GET['payment_method'] ?? null;
            if ($type === 'orders' && $payment_method) {
                $where_clauses[] = "(o.data LIKE ? OR o.data LIKE ?)";
                $bind_params[] = '%"method":"' . $payment_method . '"%';
                $bind_params[] = '%"method": "' . $payment_method . '"%';
                $bind_types .= 'ss';
            }

            // Dashboard Optimization (get all non-paid orders)
            if ($type === 'orders' && $dashboard) {
                $today_start = TimeService::now('Y-m-d 00:00:00');
                $where_clauses[] = "(JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.status')) != '" . Constants::ORDER_STATUS_PAID . "' OR LEFT(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.settlementTime')), 'T', ' '), 19) >= ?)";
                $bind_params[] = $today_start;
                $bind_types .= 's';
            }

            // Search Term
            if ($search_term) {
                $search_param = "%{$search_term}%";
                $search_conditions = [];
                switch ($type) {
                    case 'customers':
                        $search_conditions[] = "name LIKE ?";
                        $search_conditions[] = "subCode LIKE ?";
                        $bind_params = array_merge($bind_params, [$search_param, $search_param]);
                        $bind_types .= 'ss';
                        break;
                    case 'buffet':
                        $search_conditions[] = "name LIKE ?";
                        $bind_params[] = $search_param;
                        $bind_types .= 's';
                        break;
                    case 'orders':
                        foreach ($searchable_columns_json['orders'] as $col) {
                            $search_conditions[] = "JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.$col')) LIKE ?";
                            $bind_params[] = $search_param;
                            $bind_types .= 's';
                        }
                        $search_conditions[] = "c.name LIKE ?";
                        $bind_params[] = $search_param;
                        $bind_types .= 's';
                        break;
                    case 'expenses':
                        $search_conditions[] = "title LIKE ?";
                        $search_conditions[] = "description LIKE ?";
                        $search_conditions[] = "category LIKE ?";
                        $bind_params = array_merge($bind_params, [$search_param, $search_param, $search_param]);
                        $bind_types .= 'sss';
                        break;
                }
                if (!empty($search_conditions)) {
                    $where_clauses[] = "(" . implode(' OR ', $search_conditions) . ")";
                }
            }

            // Date Range (only for orders)
            if ($type === 'orders' && $date_from && $date_to) {
                $start_date = date('Y-m-d H:i:s', strtotime($date_from));
                $end_date = date('Y-m-d H:i:s', strtotime($date_to . ' 23:59:59'));
                $where_clauses[] = "LEFT(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.settlementTime')), 'T', ' '), 19) BETWEEN ? AND ?";
                $bind_params = array_merge($bind_params, [$start_date, $end_date]);
                $bind_types .= 'ss';
            }

            $where_sql = !empty($where_clauses) ? " WHERE " . implode(' AND ', $where_clauses) : '';

            // --- Count Query ---
            $count_query = "SELECT COUNT(*) as total " . $base_query . $where_sql;
            $stmt_count = $conn->prepare($count_query);
            if (!empty($bind_params)) {
                $stmt_count->bind_param($bind_types, ...$bind_params);
            }
            if (!$stmt_count->execute()) send_error("Failed to count records: " . $stmt_count->error);
            $total_records = $stmt_count->get_result()->fetch_assoc()['total'];
            $stmt_count->close();

            // --- Data Query ---
            // Order By Clause
            $order_by_clause = '';
            if ($sort_by && isset($sortable_columns[$type]) && in_array($sort_by, $sortable_columns[$type])) {
                $order_direction = strtoupper($sort_order) === 'DESC' ? 'DESC' : 'ASC';
                $sort_col = $sort_by;

                if ($type === 'orders') {
                    if ($sort_by === 'settlementTime') {
                        $sort_col = "LEFT(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.settlementTime')), 'T', ' '), 19)";
                    } else {
                        $cast_type = 'CHAR';
                        if ($sort_by === 'invoiceNumber' || $sort_by === 'totalAmount') $cast_type = 'UNSIGNED';
                        $sort_col = "CAST(JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.$sort_by')) AS $cast_type)";
                    }
                } else {
                     $sort_col = "`$sort_by`";
                }
                $order_by_clause = "ORDER BY $sort_col $order_direction";
            } else {
                if ($type === 'orders') {
                    $order_by_clause = "ORDER BY LEFT(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(o.data, '$.settlementTime')), 'T', ' '), 19) DESC";
                } elseif ($type === 'expenses') {
                    $eff_date_sql = "COALESCE(NULLIF(paidAt, '0000-00-00 00:00:00'), NULLIF(paid_at, '0000-00-00 00:00:00'), NULLIF(dueDate, ''), createdAt)";
                    $order_by_clause = "ORDER BY $eff_date_sql DESC";
                } else {
                    $order_by_clause = "ORDER BY id DESC";
                }
            }

            // Pagination
            $limit_clause = '';
            if ($limit > 0) {
                $offset = ($page - 1) * $limit;
                $limit_clause = " LIMIT ? OFFSET ?";
            }

            $query = "SELECT $select_cols " . $base_query . $where_sql . " " . $order_by_clause . " " . $limit_clause;

            $stmt_data = $conn->prepare($query);

            $final_bind_params = $bind_params;
            $final_bind_types = $bind_types;
            if ($limit > 0) {
                 $final_bind_params[] = $limit;
                 $final_bind_params[] = $offset;
                 $final_bind_types .= 'ii';
            }
            if (!empty($final_bind_params)) {
                $stmt_data->bind_param($final_bind_types, ...$final_bind_params);
            }

            if (!$stmt_data->execute()) send_error("Failed to fetch $type: " . $stmt_data->error);
            $result = $stmt_data->get_result();

            // --- Process Results ---
            $rows = [];
            while($row = $result->fetch_assoc()) {
                if (isset($row['data'])) {
                    $decoded_data = json_decode($row['data'], true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                       if (isset($row['version'])) $decoded_data['version'] = (int)$row['version'];
                       if (isset($row['id'])) $decoded_data['id'] = $row['id'];
                       if (isset($row['customer_name'])) $decoded_data['customer_name'] = $row['customer_name'];
                       $rows[] = $decoded_data;
                    }
                } else {
                    // Type casting for non-JSON tables
                    if (isset($row['isAdmin'])) $row['isAdmin'] = (bool)$row['isAdmin'];
                    if (isset($row['balance'])) $row['balance'] = (float)$row['balance'];
                    if (isset($row['buyPrice'])) $row['buyPrice'] = (float)$row['buyPrice'];
                    if (isset($row['sellPrice'])) $row['sellPrice'] = (float)$row['sellPrice'];
                    if (isset($row['stock'])) $row['stock'] = (int)$row['stock'];
                    if (isset($row['amount'])) $row['amount'] = (float)$row['amount'];
                    if (isset($row['version'])) $row['version'] = (int)$row['version'];

                    // Privacy: Strip sensitive financial info for non-admins
                    if (!$_SESSION['isAdmin']) {
                        if ($type === 'users') {
                            unset($row['hourly_rate']);
                            unset($row['password']);
                        }
                        if ($type === 'secretary_log') {
                            unset($row['amount']);
                            unset($row['bonus']);
                            unset($row['bonus_description']);
                            unset($row['fine']);
                            unset($row['fine_description']);
                        }
                    }

                    $rows[] = $row;
                }
            }
            $stmt_data->close();

            send_success([
                'data' => $rows,
                'pagination' => [
                    'total_records' => (int)$total_records,
                    'current_page' => $page,
                    'per_page' => $limit,
                    'total_pages' => ($limit > 0) ? ceil($total_records / $limit) : 1
                ]
            ]);
            break;

        case 'create_item':
            $type = $_GET['type'] ?? null;
            $item = $input['data'] ?? null;

            if (!$type || !$item || !is_array($item) || !isset($item['id'])) {
                send_error("Invalid type or data for creating item.");
            }

            $allowed_mutable_types = ['users', 'customers', 'consoles', 'buffet', 'orders', 'expenses', 'default_services', 'tournaments', 'secretary_log'];
            if (!in_array($type, $allowed_mutable_types)) {
                send_error("Invalid type specified for creation.");
            }

            $item['version'] = 1;

            $conn->begin_transaction();
            try {
                if ($type === 'orders') {
                    // Assign an invoice number for all new orders
                    $item['invoiceNumber'] = get_next_invoice_number($conn);
                } elseif ($type === 'expenses') {
                    $nowTime = TimeService::now();
                    $item['createdAt'] = $nowTime;
                    if (!isset($item['type']) || $item['type'] === 'expense') {
                        $item['paidAt'] = $nowTime;
                    }
                }

                if ($type === 'customers') {
                    $item['balance'] = 0;
                    if (array_key_exists('creditLimit', $item)) {
                        if ($item['creditLimit'] === '' || $item['creditLimit'] === null) {
                            $item['creditLimit'] = null;
                        } else {
                            $item['creditLimit'] = (float)$item['creditLimit'];
                        }
                    } else {
                        $item['creditLimit'] = null;
                    }
                }

                if (in_array($type, ['consoles', 'orders', 'tournaments'])) {
                    $stmt = $conn->prepare("INSERT INTO `$type` (id, data, version) VALUES (?, ?, ?)");
                    $json_data = json_encode($item, JSON_UNESCAPED_UNICODE);
                    $stmt->bind_param("ssi", $item['id'], $json_data, $item['version']);
                } else {
                    $keys = array_keys($item);
                    $placeholders = implode(',', array_fill(0, count($keys), '?'));
                    $columns = '`' . implode('`,`', $keys) . '`';
                    $stmt = $conn->prepare("INSERT INTO `$type` ($columns) VALUES ($placeholders)");
                    $types = str_repeat('s', count($item));
                    $stmt->bind_param($types, ...array_values($item));
                }

                if (!$stmt->execute()) throw new Exception("Execution failed: " . $stmt->error);

                $conn->commit();
                send_success(['id' => $item['id'], 'version' => $item['version']], ucfirst($type) . " item created successfully.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error("Failed to create item in $type. Error: " . $e->getMessage());
            }
            break;

        case 'deduct_credit':
            $customerId = $input['customerId'] ?? null;
            $amount = $input['amount'] ?? null;

            if (!$customerId || !is_numeric($amount) || $amount <= 0) {
                send_error("Invalid customer ID or amount provided.");
            }

            $conn->begin_transaction();
            try {
                // 1. Lock and get customer
                $stmt_customer = $conn->prepare("SELECT * FROM customers WHERE id = ? FOR UPDATE");
                $stmt_customer->bind_param('s', $customerId);
                $stmt_customer->execute();
                $customer_res = $stmt_customer->get_result();
                if ($customer_res->num_rows === 0) throw new Exception("Customer not found.");
                $customer = $customer_res->fetch_assoc();

                $current_version = (int)$customer['version'];
                $new_version = $current_version + 1;

                // 2. Check credit limit and calculate new balance
                $current_balance = (float)$customer['balance'];
                $credit_limit = ($customer['creditLimit'] !== null && $customer['creditLimit'] !== '') ? (float)$customer['creditLimit'] : null;
                $new_balance = $current_balance - (float)$amount;

                if ($credit_limit !== null && $new_balance < -$credit_limit) {
                    $available = $credit_limit + $current_balance;
                    if ($available < 0) $available = 0;
                    throw new Exception("اعتبار مشتری برای این کسر کافی نیست. اعتبار قابل استفاده: " . number_format($available) . " تومان");
                }

                $stmt_update_customer = $conn->prepare("UPDATE customers SET balance = ?, version = ? WHERE id = ? AND version = ?");
                $stmt_update_customer->bind_param('disi', $new_balance, $new_version, $customerId, $current_version);
                if (!$stmt_update_customer->execute() || $stmt_update_customer->affected_rows === 0) {
                    throw new Exception("Failed to update customer balance, possibly due to a version conflict.");
                }

                // 3. Create a transaction log order
                $orderId = uniqid('ord_');
                $nowTime = TimeService::now();
                $order_data = [
                    'id' => $orderId,
                    'invoiceNumber' => null,
                    'customerId' => $customerId,
                    'description' => "کسر اعتبار توسط ادمین",
                    'status' => Constants::ORDER_STATUS_PAID,
                    'startTime' => $nowTime,
                    'endDate' => $nowTime,
                    'settlementTime' => $nowTime,
                    'services' => [['description' => 'کسر اعتبار', 'price' => (float)$amount]],
                    'totalAmount' => (float)$amount,
                    'finalGameCost' => 0,
                    'buffetCost' => 0,
                    'servicesCost' => (float)$amount,
                    'discountAmount' => 0,
                    'payments' => [['method' => Constants::PAYMENT_TYPE_CREDIT, 'amount' => (float)$amount, 'customerId' => $customerId]], // Note: This is an internal transaction
                    'version' => 1
                ];

                $stmt_order = $conn->prepare("INSERT INTO orders (id, data, version) VALUES (?, ?, ?)");
                $json_order_data = json_encode($order_data, JSON_UNESCAPED_UNICODE);
                $order_version = 1;
                $stmt_order->bind_param("ssi", $orderId, $json_order_data, $order_version);
                if (!$stmt_order->execute()) {
                    throw new Exception("Failed to create transaction log order for deduction.");
                }

                $conn->commit();
                send_success(['newBalance' => $new_balance, 'orderId' => $orderId], "Credit deducted successfully.");

            } catch (Exception $e) {
                $conn->rollback();
                send_error("Transaction failed: " . $e->getMessage());
            }
            break;

        case 'update_item':
            $type = $_GET['type'] ?? null;
            $id = $_GET['id'] ?? null;
            $item = $input['data'] ?? null;

            if (!$type || !$id || !$item || !is_array($item)) {
                send_error("Invalid type, id, or data for updating item.");
            }

            $allowed_mutable_types = ['users', 'customers', 'consoles', 'buffet', 'orders', 'expenses', 'default_services', 'tournaments', 'secretary_log'];
            if (!in_array($type, $allowed_mutable_types)) {
                send_error("Invalid type specified for update.");
            }

            $client_version = isset($item['version']) ? (int)$item['version'] : 0;

            $conn->begin_transaction();
            try {
                $stmt_ver = $conn->prepare("SELECT version FROM `$type` WHERE id = ? FOR UPDATE");
                $stmt_ver->bind_param('s', $id);
                $stmt_ver->execute();
                $db_item = $stmt_ver->get_result()->fetch_assoc();

                if (!$db_item) throw new Exception("Item with ID $id not found in $type.");
                $current_version = (int)$db_item['version'];

                if ($client_version !== $current_version) {
                    throw new Exception("Conflict detected for item ID $id. Your data is stale. Please refresh and try again.");
                }

                $new_version = $current_version + 1;
                $item['version'] = $new_version;

                if ($type === 'customers') {
                    if (array_key_exists('creditLimit', $item)) {
                        if ($item['creditLimit'] === '' || $item['creditLimit'] === null) {
                            $item['creditLimit'] = null;
                        } else {
                            $item['creditLimit'] = (float)$item['creditLimit'];
                        }
                    }
                }

                if (in_array($type, ['consoles', 'orders', 'tournaments'])) {
                    $stmt = $conn->prepare("UPDATE `$type` SET data = ?, version = ? WHERE id = ? AND version = ?");
                    $json_data = json_encode($item, JSON_UNESCAPED_UNICODE);
                    $stmt->bind_param("sisi", $json_data, $new_version, $id, $current_version);
                } else {
                    $update_item = $item;
                    unset($update_item['id']);
                    $keys = array_keys($update_item);
                    $set_clause = '`' . implode('` = ?, `', $keys) . '` = ?';
                    $stmt = $conn->prepare("UPDATE `$type` SET $set_clause WHERE id = ? AND version = ?");
                    $types = str_repeat('s', count($update_item)) . 'si';
                    $values = array_values($update_item);
                    $values[] = $id;
                    $values[] = $current_version;
                    $stmt->bind_param($types, ...$values);
                }

                if (!$stmt->execute()) throw new Exception("Execution failed: " . $stmt->error);
                if ($stmt->affected_rows === 0) throw new Exception("Conflict detected for item ID $id during update.");

                $conn->commit();
                send_success(['id' => $id, 'version' => $new_version], ucfirst($type) . " item updated successfully.");
            } catch (Exception $e) {
                $conn->rollback();
                if (strpos($e->getMessage(), 'Conflict detected') !== false) {
                     send_error($e->getMessage(), 409);
                } else {
                     send_error("Failed to update item in $type. Error: " . $e->getMessage());
                }
            }
            break;

        case 'delete_item':
            $type = $_GET['type'] ?? null;
            $id = $_GET['id'] ?? null;
            if (!$type || !$id) send_error("Invalid parameters for deletion.");

            $allowed_mutable_types = ['users', 'customers', 'consoles', 'buffet', 'orders', 'expenses', 'default_services', 'tournaments', 'secretary_log'];
            if (!in_array($type, $allowed_mutable_types)) {
                send_error("Invalid type specified for deletion.");
            }

            $conn->begin_transaction();
            try {
                // Special handling for orders to revert transactions
                if ($type === 'orders') {
                    $order = get_order_by_id($conn, $id, true); // Lock the row
                    if ($order) {
                        // Revert customer credit if it was a credit-charge order
                        if (isset($order['description']) && strpos($order['description'], 'شارژ اعتبار') !== false && isset($order['customerId'])) {
                            $amount_to_revert = $order['totalAmount'];
                            // Lock customer row
                            $stmt_lock = $conn->prepare("SELECT balance FROM customers WHERE id = ? FOR UPDATE");
                            $stmt_lock->bind_param("s", $order['customerId']);
                            $stmt_lock->execute();
                            $stmt_lock->get_result(); // Consume result

                            $stmt_customer = $conn->prepare("UPDATE customers SET balance = balance - ?, version = version + 1 WHERE id = ?");
                            $stmt_customer->bind_param('ds', $amount_to_revert, $order['customerId']);
                            $stmt_customer->execute();
                        }
                        // Handle refunding credit for "deduct_credit" admin actions
                        elseif (isset($order['description']) && strpos($order['description'], 'کسر اعتبار توسط ادمین') !== false && isset($order['customerId'])) {
                            $amount_to_refund = $order['totalAmount'];
                            // Lock customer row
                            $stmt_lock = $conn->prepare("SELECT balance FROM customers WHERE id = ? FOR UPDATE");
                            $stmt_lock->bind_param("s", $order['customerId']);
                            $stmt_lock->execute();
                            $stmt_lock->get_result(); // Consume result

                            $stmt_customer = $conn->prepare("UPDATE customers SET balance = balance + ?, version = version + 1 WHERE id = ?");
                            $stmt_customer->bind_param('ds', $amount_to_refund, $order['customerId']);
                            $stmt_customer->execute();
                        }
                        // Refund any payments made from customer credit
                        if (!empty($order['payments'])) {
                            foreach ($order['payments'] as $payment) {
                                if ($payment['method'] === Constants::PAYMENT_TYPE_CREDIT && isset($payment['customerId'])) {
                                    // Lock customer row
                                    $stmt_lock = $conn->prepare("SELECT balance FROM customers WHERE id = ? FOR UPDATE");
                                    $stmt_lock->bind_param("s", $payment['customerId']);
                                    $stmt_lock->execute();
                                    $stmt_lock->get_result(); // Consume result

                                    $stmt_refund = $conn->prepare("UPDATE customers SET balance = balance + ?, version = version + 1 WHERE id = ?");
                                    $stmt_refund->bind_param('ds', $payment['amount'], $payment['customerId']);
                                    $stmt_refund->execute();
                                }
                            }
                        }
                        // Restock buffet items
                        if (!empty($order['buffetItems'])) {
                            foreach ($order['buffetItems'] as $item) {
                                // Lock buffet row
                                $stmt_lock = $conn->prepare("SELECT stock FROM buffet WHERE id = ? FOR UPDATE");
                                $stmt_lock->bind_param("s", $item['id']);
                                $stmt_lock->execute();
                                $stmt_lock->get_result(); // Consume result

                                $stmt_buffet = $conn->prepare("UPDATE buffet SET stock = stock + ?, version = version + 1 WHERE id = ?");
                                $stmt_buffet->bind_param('is', $item['quantity'], $item['id']);
                                $stmt_buffet->execute();
                            }
                        }
                    }
                }

                // Delete the item itself
                $stmt = $conn->prepare("DELETE FROM `$type` WHERE id = ?");
                $stmt->bind_param('s', $id);
                $stmt->execute();

                $conn->commit();
                send_success(['id' => $id], ucfirst($type) . " item deleted successfully.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error("Failed to delete item from $type. Error: " . $e->getMessage());
            }
            break;

        case 'charge_credit':
            $customerId = $input['customerId'] ?? null;
            $amount = $input['amount'] ?? null;
            $method = $input['method'] ?? null;

            if (!$customerId || !is_numeric($amount) || $amount <= 0 || !$method) {
                send_error("Invalid customer ID, amount, or payment method provided.");
            }

            $conn->begin_transaction();
            try {
                // 1. Lock and get customer
                $stmt_customer = $conn->prepare("SELECT * FROM customers WHERE id = ? FOR UPDATE");
                $stmt_customer->bind_param('s', $customerId);
                $stmt_customer->execute();
                $customer_res = $stmt_customer->get_result();
                if ($customer_res->num_rows === 0) throw new Exception("Customer not found.");
                $customer = $customer_res->fetch_assoc();

                $current_version = (int)$customer['version'];
                $new_version = $current_version + 1;

                // 2. Update customer's balance
                $new_balance = (float)$customer['balance'] + (float)$amount;
                $stmt_update_customer = $conn->prepare("UPDATE customers SET balance = ?, version = ? WHERE id = ? AND version = ?");
                $stmt_update_customer->bind_param('disi', $new_balance, $new_version, $customerId, $current_version);
                if (!$stmt_update_customer->execute() || $stmt_update_customer->affected_rows === 0) {
                    throw new Exception("Failed to update customer balance, possibly due to a version conflict.");
                }

                // 3. Create a transaction log order
                $orderId = uniqid('ord_');
                $description = $method === 'discount'
                ? "شارژ اعتبار با تخفیف برای " . $customer['name']
                : "شارژ اعتبار برای " . $customer['name'];
            $serviceDescription = $method === 'discount' ? 'تخفیف شارژ اعتبار' : 'شارژ اعتبار';
            $discountAmount = $method === 'discount' ? (float)$amount : 0;

            $nowTime = TimeService::now();
            $checkDate = $input['checkDate'] ?? null;
            $paymentObj = ['method' => $method, 'amount' => (float)$amount];
            if (($method === Constants::PAYMENT_TYPE_CHECK || $method === 'check') && $checkDate) {
                $paymentObj['checkDate'] = $checkDate;
                $effectiveSettlementTime = strlen($checkDate) === 10 ? $checkDate . ' ' . TimeService::time() : $checkDate;
            } else {
                $effectiveSettlementTime = $nowTime;
            }

            $order_data = [
                    'id' => $orderId,
                    'invoiceNumber' => null,
                    'customerId' => $customerId,
                    'description' => $description,
                    'status' => Constants::ORDER_STATUS_PAID,
                    'startTime' => $nowTime,
                    'endDate' => $nowTime,
                    'settlementTime' => $effectiveSettlementTime,
                    'services' => [['description' => $serviceDescription, 'price' => (float)$amount]],
                    'totalAmount' => (float)$amount,
                    'finalGameCost' => 0,
                    'buffetCost' => 0,
                    'servicesCost' => (float)$amount,
                    'discountAmount' => $discountAmount,
                    'payments' => [$paymentObj],
                    'version' => 1
                ];

                $stmt_order = $conn->prepare("INSERT INTO orders (id, data, version) VALUES (?, ?, ?)");
                $json_order_data = json_encode($order_data, JSON_UNESCAPED_UNICODE);
                $order_version = 1;
                $stmt_order->bind_param("ssi", $orderId, $json_order_data, $order_version);
                if (!$stmt_order->execute()) {
                    throw new Exception("Failed to create transaction log order.");
                }

                $conn->commit();
                send_success(['newBalance' => $new_balance, 'orderId' => $orderId], "Credit charged successfully.");

            } catch (Exception $e) {
                $conn->rollback();
                send_error("Transaction failed: " . $e->getMessage());
            }
            break;

        case 'clock_in':
            $userId = $_SESSION['user_id'];

            $conn->begin_transaction();
            try {
                // Check for existing open session with lock
                $stmt = $conn->prepare("SELECT id FROM secretary_log WHERE user_id = ? AND clock_out = '00:00:00' FOR UPDATE");
                $stmt->bind_param("s", $userId);
                $stmt->execute();
                if ($stmt->get_result()->num_rows > 0) throw new Exception("شما قبلاً وارد شده‌اید.");

                $id = uniqid('log_');
                $date = TimeService::date();
                $time = TimeService::time();
                $status = 'unpaid';
                $version = 1;

                $stmt = $conn->prepare("INSERT INTO secretary_log (id, user_id, date, clock_in, clock_out, duration_minutes, amount, status, version) VALUES (?, ?, ?, ?, '00:00:00', 0, 0, ?, ?)");
                $stmt->bind_param("sssssi", $id, $userId, $date, $time, $status, $version);
                if (!$stmt->execute()) throw new Exception("خطا در ثبت ورود.");

                $conn->commit();
                send_success(['id' => $id, 'clock_in' => $time], "ورود با موفقیت ثبت شد.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error($e->getMessage());
            }
            break;

        case 'update_paid_order':
            if (empty($_SESSION['isAdmin'])) {
                send_error("دسترسی غیرمجاز. فقط ادمین به این بخش دسترسی دارد.", 403);
            }

            $orderId = $input['orderId'] ?? null;
            $updatedOrder = $input['orderData'] ?? null;

            if (!$orderId || !$updatedOrder) send_error("اطلاعات ناقص.");

            $conn->begin_transaction();
            try {
                $order = get_order_by_id($conn, $orderId, true);
                if (!$order) throw new Exception(Constants::MSG_ORDER_NOT_FOUND);

                if ($order['status'] !== Constants::ORDER_STATUS_PAID) {
                    throw new Exception("فقط فاکتورهای تسویه شده را می‌توان ویرایش کرد.");
                }

                // 1. Revert previous customer credit payments (if any)
                if (!empty($order['payments'])) {
                    foreach ($order['payments'] as $oldPayment) {
                        if ($oldPayment['method'] === Constants::PAYMENT_TYPE_CREDIT && isset($oldPayment['customerId'])) {
                            $revertAmount = (float)$oldPayment['amount'];
                            $revertCid = $oldPayment['customerId'];

                            $stmt_lock = $conn->prepare("SELECT balance FROM customers WHERE id = ? FOR UPDATE");
                            $stmt_lock->bind_param("s", $revertCid);
                            $stmt_lock->execute();
                            $stmt_lock->get_result();

                            $stmt_revert = $conn->prepare("UPDATE customers SET balance = balance + ?, version = version + 1 WHERE id = ?");
                            $stmt_revert->bind_param("ds", $revertAmount, $revertCid);
                            $stmt_revert->execute();
                        }
                    }
                }

                // 2. Adjust Buffet Items Stock based on differences between old and new buffetItems
                $oldBuffetMap = [];
                if (!empty($order['buffetItems'])) {
                    foreach ($order['buffetItems'] as $bi) {
                        $oldBuffetMap[$bi['id']] = (int)($bi['quantity'] ?? 0);
                    }
                }

                $newBuffetMap = [];
                if (!empty($updatedOrder['buffetItems'])) {
                    foreach ($updatedOrder['buffetItems'] as $bi) {
                        $newBuffetMap[$bi['id']] = (int)($bi['quantity'] ?? 0);
                    }
                }

                $allBuffetIds = array_unique(array_merge(array_keys($oldBuffetMap), array_keys($newBuffetMap)));
                foreach ($allBuffetIds as $bId) {
                    $oldQty = $oldBuffetMap[$bId] ?? 0;
                    $newQty = $newBuffetMap[$bId] ?? 0;
                    $diff = $newQty - $oldQty; // positive diff means items added -> reduce stock

                    if ($diff !== 0) {
                        $stmt_b = $conn->prepare("SELECT stock FROM buffet WHERE id = ? FOR UPDATE");
                        $stmt_b->bind_param("s", $bId);
                        $stmt_b->execute();
                        $res_b = $stmt_b->get_result()->fetch_assoc();
                        if (!$res_b) {
                            throw new Exception("محصول بوفه یافت نشد.");
                        }
                        if ($diff > 0 && $res_b['stock'] < $diff) {
                            throw new Exception("موجودی بوفه برای این محصول کافی نیست.");
                        }

                        $stmt_up_b = $conn->prepare("UPDATE buffet SET stock = stock - ?, version = version + 1 WHERE id = ?");
                        $stmt_up_b->bind_param("is", $diff, $bId);
                        $stmt_up_b->execute();
                    }
                }

                // 3. Apply new Credit Payments
                if (!empty($updatedOrder['payments'])) {
                    foreach ($updatedOrder['payments'] as $payment) {
                        if ($payment['method'] === Constants::PAYMENT_TYPE_CREDIT && isset($payment['customerId'])) {
                            $amount = (float)$payment['amount'];
                            $cid = $payment['customerId'];

                            $stmt_lock = $conn->prepare("SELECT balance, creditLimit, name FROM customers WHERE id = ? FOR UPDATE");
                            $stmt_lock->bind_param("s", $cid);
                            $stmt_lock->execute();
                            $c_res = $stmt_lock->get_result()->fetch_assoc();

                            if (!$c_res) throw new Exception("مشتری مربوط به پرداخت اعتباری یافت نشد.");

                            $current_bal = (float)$c_res['balance'];
                            $credit_lim = ($c_res['creditLimit'] !== null && $c_res['creditLimit'] !== '') ? (float)$c_res['creditLimit'] : null;
                            $new_bal = $current_bal - $amount;

                            if ($credit_lim !== null && $new_bal < -$credit_lim) {
                                $avail = $credit_lim + $current_bal;
                                if ($avail < 0) $avail = 0;
                                throw new Exception("اعتبار مشتری (" . ($c_res['name'] ?? '') . ") کافی نیست. اعتبار قابل استفاده: " . number_format($avail) . " تومان");
                            }

                            $stmt = $conn->prepare("UPDATE customers SET balance = balance - ?, version = version + 1 WHERE id = ?");
                            $stmt->bind_param("ds", $amount, $cid);
                            $stmt->execute();
                        }
                    }
                }

                // 4. Update order JSON, strictly preserving original startTime, endDate, settlementTime
                if (isset($updatedOrder['customerId'])) {
                    $order['customerId'] = $updatedOrder['customerId'];
                }
                if (isset($updatedOrder['buffetItems'])) {
                    $order['buffetItems'] = $updatedOrder['buffetItems'];
                }
                if (isset($updatedOrder['services'])) {
                    $order['services'] = $updatedOrder['services'];
                }
                if (isset($updatedOrder['payments'])) {
                    $order['payments'] = $updatedOrder['payments'];
                }
                if (isset($updatedOrder['finalGameCost'])) {
                    $order['finalGameCost'] = (float)$updatedOrder['finalGameCost'];
                }
                if (isset($updatedOrder['discountAmount'])) {
                    $order['discountAmount'] = (float)$updatedOrder['discountAmount'];
                }
                if (isset($updatedOrder['totalAmount'])) {
                    $order['totalAmount'] = (float)$updatedOrder['totalAmount'];
                }

                $order['version'] = $order['version'] + 1;

                $stmt = $conn->prepare("UPDATE orders SET data = ?, version = ? WHERE id = ?");
                $json_data = json_encode($order, JSON_UNESCAPED_UNICODE);
                $stmt->bind_param("sis", $json_data, $order['version'], $orderId);
                $stmt->execute();

                $conn->commit();
                send_success(null, "فاکتور با موفقیت بروزرسانی شد.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error($e->getMessage());
            }
            break;

        case 'clock_out':
            $userId = $_SESSION['user_id'];

            $conn->begin_transaction();
            try {
                // Find all open sessions for this user with lock to prevent "stuck" state
                $stmt = $conn->prepare("SELECT * FROM secretary_log WHERE user_id = ? AND clock_out = '00:00:00' ORDER BY date ASC, clock_in ASC FOR UPDATE");
                $stmt->bind_param("s", $userId);
                $stmt->execute();
                $open_logs = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

                if (empty($open_logs)) throw new Exception("هیچ نشست فعالی یافت نشد.");

                // Get hourly rate once
                $stmt_user = $conn->prepare("SELECT hourly_rate FROM users WHERE id = ?");
                $stmt_user->bind_param("s", $userId);
                $stmt_user->execute();
                $hourlyRate = $stmt_user->get_result()->fetch_assoc()['hourly_rate'] ?? 0;

                $clockOutTime = TimeService::time();
                $nowDate = TimeService::date();
                $processed = 0;
                $total_duration = 0;
                $total_amount = 0;

                foreach ($open_logs as $log) {
                    $clockIn = $log['clock_in'];
                    $logDate = $log['date'];

                    // Determine if this specific log was an overnight shift
                    $actualClockOutDate = $nowDate;
                    if ($clockOutTime < $clockIn && $logDate === $nowDate) {
                        // This shouldn't happen often with server time, but for safety:
                        // If it's the same day but clock out is before clock in, it's likely a very short session across midnight
                        // or just a small clock drift. We assume it's same day unless logDate is in the past.
                    }

                    // Calculate duration
                    $stmt_dur = $conn->prepare("SELECT TIMESTAMPDIFF(MINUTE, CONCAT(?, ' ', ?), CONCAT(?, ' ', ?)) as duration");
                    $stmt_dur->bind_param("ssss", $logDate, $clockIn, $actualClockOutDate, $clockOutTime);
                    $stmt_dur->execute();
                    $duration = $stmt_dur->get_result()->fetch_assoc()['duration'];

                    // Ensure duration is not negative (sanity check)
                    if ($duration < 0) $duration = 0;

                    $amount = ($duration / 60) * $hourlyRate;
                    // Round to nearest 1000 for consistency with app logic
                    $amount = round($amount / 1000) * 1000;

                    $stmt_upd = $conn->prepare("UPDATE secretary_log SET clock_out = ?, duration_minutes = ?, amount = ?, version = version + 1 WHERE id = ?");
                    $stmt_upd->bind_param("sids", $clockOutTime, $duration, $amount, $log['id']);
                    $stmt_upd->execute();

                    $processed++;
                    $total_duration += $duration;
                    $total_amount += $amount;
                }
                $conn->commit();
                send_success([
                    'clock_out' => $clockOutTime,
                    'sessions_closed' => $processed,
                    'total_duration' => $total_duration,
                    'total_amount' => $total_amount
                ], "خروج با موفقیت ثبت شد. " . ($processed > 1 ? "($processed نشست بسته شد)" : ""));
            } catch (Exception $e) {
                $conn->rollback();
                send_error("خطا در ثبت خروج: " . $e->getMessage());
            }
            break;

        case 'reopen_order':
            $id = $_GET['id'] ?? null;
            if (!$id) send_error("Invalid order ID provided.");

            $conn->begin_transaction();
            try {
                $order = get_order_by_id($conn, $id, true); // Lock the row
                if (!$order || $order['status'] !== Constants::ORDER_STATUS_PAID) {
                    throw new Exception("Order not found or is not in a reopenable state (must be 'paid').");
                }

                // Refund any payments made from customer credit
                if (!empty($order['payments'])) {
                    foreach ($order['payments'] as $payment) {
                        if ($payment['method'] === Constants::PAYMENT_TYPE_CREDIT && isset($payment['customerId'])) {
                            // Lock customer row
                            $stmt_lock = $conn->prepare("SELECT balance FROM customers WHERE id = ? FOR UPDATE");
                            $stmt_lock->bind_param("s", $payment['customerId']);
                            $stmt_lock->execute();
                            $stmt_lock->get_result(); // Consume result

                            $stmt_refund = $conn->prepare("UPDATE customers SET balance = balance + ?, version = version + 1 WHERE id = ?");
                            $stmt_refund->bind_param('ds', $payment['amount'], $payment['customerId']);
                            $stmt_refund->execute();
                        }
                    }
                }

                // Restock buffet items
                if (!empty($order['buffetItems'])) {
                    foreach ($order['buffetItems'] as $item) {
                        // Lock buffet row
                        $stmt_lock = $conn->prepare("SELECT stock FROM buffet WHERE id = ? FOR UPDATE");
                        $stmt_lock->bind_param("s", $item['id']);
                        $stmt_lock->execute();
                        $stmt_lock->get_result(); // Consume result

                        $stmt_buffet = $conn->prepare("UPDATE buffet SET stock = stock + ?, version = version + 1 WHERE id = ?");
                        $stmt_buffet->bind_param('is', $item['quantity'], $item['id']);
                        $stmt_buffet->execute();
                    }
                }

                $current_version = $order['version'];

                // --- Data preservation ---
                // Clone the original order to preserve all fields (consoleId, rateId, history, etc.)
                $reopened_order = $order;

                // Reset settlement-related fields
                $reopened_order['status'] = Constants::ORDER_STATUS_PENDING;
                $reopened_order['settlementTime'] = null;
                $reopened_order['payments'] = [];
                $reopened_order['version'] = $current_version + 1;


                $stmt = $conn->prepare("UPDATE orders SET data = ?, version = ? WHERE id = ? AND version = ?");
                $json_data = json_encode($reopened_order, JSON_UNESCAPED_UNICODE);
                $stmt->bind_param("sisi", $json_data, $reopened_order['version'], $id, $current_version);
                
                if (!$stmt->execute() || $stmt->affected_rows === 0) {
                     throw new Exception("Order update failed, possibly due to a version conflict.");
                }
                
                $conn->commit();
                send_success(['id' => $id, 'version' => $reopened_order['version']], "Order reopened successfully.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error("Failed to reopen order: " . $e->getMessage());
            }
            break;

        case 'add_buffet_to_order':
            $orderId = $input['orderId'] ?? null;
            $buffetItemId = $input['itemId'] ?? null;
            $quantity = (int)($input['quantity'] ?? 1);

            if (!$orderId || !$buffetItemId || $quantity <= 0) send_error("پارامترهای نامعتبر.");

            $conn->begin_transaction();
            try {
                // 1. Lock and get Order
                $order = get_order_by_id($conn, $orderId, true);
                if (!$order) throw new Exception(Constants::MSG_ORDER_NOT_FOUND);
                if ($order['status'] === Constants::ORDER_STATUS_PAID) throw new Exception(Constants::MSG_ORDER_PAID);

                // 2. Lock and get Buffet Item
                $stmt = $conn->prepare("SELECT * FROM buffet WHERE id = ? FOR UPDATE");
                $stmt->bind_param("s", $buffetItemId);
                $stmt->execute();
                $buffetItem = $stmt->get_result()->fetch_assoc();
                if (!$buffetItem) throw new Exception("محصول یافت نشد.");
                if ($buffetItem['stock'] < $quantity) throw new Exception("موجودی کافی نیست.");

                // 3. Update Buffet Stock
                $newStock = $buffetItem['stock'] - $quantity;
                $stmt = $conn->prepare("UPDATE buffet SET stock = ?, version = version + 1 WHERE id = ?");
                $stmt->bind_param("is", $newStock, $buffetItemId);
                $stmt->execute();

                // 4. Update Order JSON
                if (!isset($order['buffetItems'])) $order['buffetItems'] = [];
                $found = false;
                foreach ($order['buffetItems'] as &$item) {
                    if ($item['id'] === $buffetItemId) {
                        $item['quantity'] += $quantity;
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    $order['buffetItems'][] = [
                        'id' => $buffetItem['id'],
                        'name' => $buffetItem['name'],
                        'buyPrice' => (float)$buffetItem['buyPrice'],
                        'sellPrice' => (float)$buffetItem['sellPrice'],
                        'quantity' => $quantity
                    ];
                }

                $order['version'] = $order['version'] + 1;
                $stmt = $conn->prepare("UPDATE orders SET data = ?, version = ? WHERE id = ?");
                $json_data = json_encode($order, JSON_UNESCAPED_UNICODE);
                $stmt->bind_param("sis", $json_data, $order['version'], $orderId);
                $stmt->execute();

                $conn->commit();
                send_success(['order_version' => $order['version']], "محصول به فاکتور اضافه شد.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error($e->getMessage());
            }
            break;

        case 'remove_buffet_from_order':
            $orderId = $input['orderId'] ?? null;
            $buffetItemId = $input['itemId'] ?? null;

            if (!$orderId || !$buffetItemId) send_error("پارامترهای نامعتبر.");

            $conn->begin_transaction();
            try {
                $order = get_order_by_id($conn, $orderId, true);
                if (!$order || $order['status'] === Constants::ORDER_STATUS_PAID) throw new Exception(Constants::MSG_INVALID_ACTION);

                $quantityToRemove = 0;
                $newBuffetItems = [];
                foreach ($order['buffetItems'] as $item) {
                    if ($item['id'] === $buffetItemId) {
                        $quantityToRemove = $item['quantity'];
                    } else {
                        $newBuffetItems[] = $item;
                    }
                }
                if ($quantityToRemove === 0) throw new Exception("محصول در فاکتور یافت نشد.");

                // Update Buffet Stock
                $stmt = $conn->prepare("UPDATE buffet SET stock = stock + ?, version = version + 1 WHERE id = ?");
                $stmt->bind_param("is", $quantityToRemove, $buffetItemId);
                $stmt->execute();

                // Update Order
                $order['buffetItems'] = $newBuffetItems;
                $order['version'] = $order['version'] + 1;
                $stmt = $conn->prepare("UPDATE orders SET data = ?, version = ? WHERE id = ?");
                $json_data = json_encode($order, JSON_UNESCAPED_UNICODE);
                $stmt->bind_param("sis", $json_data, $order['version'], $orderId);
                $stmt->execute();

                $conn->commit();
                send_success(null, "محصول از فاکتور حذف شد.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error($e->getMessage());
            }
            break;

        case 'finalize_settlement':
            $orderId = $input['orderId'] ?? null;
            $settlementData = $input['settlementData'] ?? null;

            if (!$orderId || !$settlementData) send_error("اطلاعات ناقص.");

            $conn->begin_transaction();
            try {
                $order = get_order_by_id($conn, $orderId, true);
                if (!$order) throw new Exception(Constants::MSG_ORDER_NOT_FOUND);

                // Prevent double-finalization if already paid, unless it's a prepayment update
                if ($order['status'] === Constants::ORDER_STATUS_PAID && !($settlementData['isPrepayment'] ?? false)) {
                    throw new Exception("این سفارش قبلاً تسویه شده است.");
                }

                // 1. Revert existing credit payments before applying new ones (to handle updates/prepayments)
                if (!empty($order['payments'])) {
                    foreach ($order['payments'] as $oldPayment) {
                        if ($oldPayment['method'] === Constants::PAYMENT_TYPE_CREDIT && isset($oldPayment['customerId'])) {
                            $revertAmount = (float)$oldPayment['amount'];
                            $revertCid = $oldPayment['customerId'];

                            // Lock customer row
                            $stmt_lock = $conn->prepare("SELECT balance FROM customers WHERE id = ? FOR UPDATE");
                            $stmt_lock->bind_param("s", $revertCid);
                            $stmt_lock->execute();
                            $stmt_lock->get_result(); // Consume result

                            $stmt_revert = $conn->prepare("UPDATE customers SET balance = balance + ?, version = version + 1 WHERE id = ?");
                            $stmt_revert->bind_param("ds", $revertAmount, $revertCid);
                            $stmt_revert->execute();
                        }
                    }
                }

                // 2. Apply new Credit Payments
                if (!empty($settlementData['payments'])) {
                    foreach ($settlementData['payments'] as $payment) {
                        if ($payment['method'] === Constants::PAYMENT_TYPE_CREDIT && isset($payment['customerId'])) {
                            $amount = (float)$payment['amount'];
                            $cid = $payment['customerId'];

                            // Lock customer row
                            $stmt_lock = $conn->prepare("SELECT balance, creditLimit, name FROM customers WHERE id = ? FOR UPDATE");
                            $stmt_lock->bind_param("s", $cid);
                            $stmt_lock->execute();
                            $c_res = $stmt_lock->get_result()->fetch_assoc();

                            if (!$c_res) throw new Exception("مشتری مربوط به پرداخت اعتباری یافت نشد.");

                            $current_bal = (float)$c_res['balance'];
                            $credit_lim = ($c_res['creditLimit'] !== null && $c_res['creditLimit'] !== '') ? (float)$c_res['creditLimit'] : null;
                            $new_bal = $current_bal - $amount;

                            if ($credit_lim !== null && $new_bal < -$credit_lim) {
                                $avail = $credit_lim + $current_bal;
                                if ($avail < 0) $avail = 0;
                                throw new Exception("اعتبار مشتری (" . ($c_res['name'] ?? '') . ") کافی نیست. اعتبار قابل استفاده: " . number_format($avail) . " تومان");
                            }

                            $stmt = $conn->prepare("UPDATE customers SET balance = balance - ?, version = version + 1 WHERE id = ?");
                            $stmt->bind_param("ds", $amount, $cid);
                            $stmt->execute();
                        }
                    }
                }

                // 3. Update Order JSON with final data
                $order['customerId'] = $settlementData['customerId'];
                $order['finalGameCost'] = (float)$settlementData['finalGameCost'];
                $order['totalAmount'] = (float)$settlementData['totalAmount'];
                $order['discountAmount'] = (float)$settlementData['discountAmount'];
                $order['payments'] = $settlementData['payments'];

                $nowTime = TimeService::now();

                // Check if any payment is made by check and has a check date
                $checkSettlementTime = null;
                if (!empty($settlementData['payments'])) {
                    foreach ($settlementData['payments'] as $p) {
                        if (($p['method'] === Constants::PAYMENT_TYPE_CHECK || $p['method'] === 'check') && !empty($p['checkDate'])) {
                            $checkDateStr = $p['checkDate'];
                            // Format checkDate to full datetime YYYY-MM-DD HH:mm:ss if it's only YYYY-MM-DD
                            if (strlen($checkDateStr) === 10) {
                                $checkDateStr .= ' ' . TimeService::time();
                            }
                            $checkSettlementTime = $checkDateStr;
                            break;
                        }
                    }
                }

                $effectiveSettlementTime = $checkSettlementTime ?? $nowTime;

                if (!empty($settlementData['isPrepayment'])) {
                    $order['hasPrepayment'] = true;
                    $order['settlementTime'] = $effectiveSettlementTime;
                } else {
                    $order['status'] = Constants::ORDER_STATUS_PAID;
                    if (!isset($order['endDate'])) {
                        $order['endDate'] = $nowTime;
                    }
                    $order['settlementTime'] = $effectiveSettlementTime;
                }

                $order['version'] = $order['version'] + 1;
                $stmt = $conn->prepare("UPDATE orders SET data = ?, version = ? WHERE id = ?");
                $json_data = json_encode($order, JSON_UNESCAPED_UNICODE);
                $stmt->bind_param("sis", $json_data, $order['version'], $orderId);
                $stmt->execute();

                $conn->commit();
                send_success(null, "تسویه حساب با موفقیت انجام شد.");
            } catch (Exception $e) {
                $conn->rollback();
                send_error($e->getMessage());
            }
            break;
    }

    $conn->close();
}
?>