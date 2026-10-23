<?php
declare(strict_types=1);

/**
 * Bootstrap seguro da API Portal Cybhor (Hostinger + MySQL).
 */

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Content-Type: application/json; charset=utf-8');
}

$configFile = __DIR__ . '/config.local.php';
if (!is_file($configFile)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'API não configurada. Execute /api/install.php uma vez.']);
    exit;
}

/** @var array{db_host:string,db_name:string,db_user:string,db_pass:string,db_port?:int,session_days?:int} $CONFIG */
$CONFIG = require $configFile;

function db(): PDO
{
    static $pdo = null;
    global $CONFIG;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $host = $CONFIG['db_host'] ?? 'localhost';
    $port = (int)($CONFIG['db_port'] ?? 3306);
    $name = $CONFIG['db_name'] ?? '';
    $user = $CONFIG['db_user'] ?? '';
    $pass = $CONFIG['db_pass'] ?? '';
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function json_out(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function client_meta(): array
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    return [
        'ip_hash' => $ip !== '' ? hash('sha256', $ip) : null,
        'ua_hash' => $ua !== '' ? hash('sha256', $ua) : null,
    ];
}

function set_session_cookie(string $token, int $days): void
{
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    setcookie('cybhor_sid', $token, [
        'expires' => time() + ($days * 86400),
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function clear_session_cookie(): void
{
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    setcookie('cybhor_sid', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function current_user(): ?array
{
    $token = $_COOKIE['cybhor_sid'] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $stmt = db()->prepare(
        'SELECT u.id, u.email, u.name, u.role, s.expires_at
         FROM auth_sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND u.is_active = 1
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    if (strtotime((string)$row['expires_at']) < time()) {
        db()->prepare('DELETE FROM auth_sessions WHERE id = ?')->execute([$token]);
        clear_session_cookie();
        return null;
    }
    return [
        'id' => (int)$row['id'],
        'email' => (string)$row['email'],
        'name' => (string)$row['name'],
        'role' => (string)$row['role'],
    ];
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        json_out(['ok' => false, 'error' => 'Não autenticado'], 401);
    }
    return $user;
}
