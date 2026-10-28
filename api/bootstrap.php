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

/** @var array{db_host:string,db_name:string,db_user:string,db_pass:string,db_port?:int,session_days?:int,open_access?:bool} $CONFIG */
$CONFIG = require $configFile;

/** Papéis do portal. Admin vê tudo; os demais só a própria área. */
const TECH_ROLES = ['Admin', 'Dev', 'Programação', 'DevOps', 'ETEC'];

/** Papéis de tecnologia: GitHub (@ ou e-mail noreply) é obrigatório. */
const TECH_GITHUB_REQUIRED = ['Dev', 'Programação', 'DevOps', 'ETEC'];

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
    ensure_schema($pdo);
    return $pdo;
}

function ensure_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $cols = $pdo->query("SHOW COLUMNS FROM users LIKE 'github_login'")->fetch();
    if (!$cols) {
        $pdo->exec('ALTER TABLE users ADD COLUMN github_login VARCHAR(39) NULL AFTER role');
    }
    $done = true;
}

function user_dto(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'email' => (string)$row['email'],
        'name' => (string)$row['name'],
        'role' => (string)$row['role'],
        'github_login' => isset($row['github_login']) && $row['github_login'] !== null && $row['github_login'] !== ''
            ? (string)$row['github_login']
            : null,
        'is_active' => isset($row['is_active']) ? (int)$row['is_active'] === 1 : true,
        'is_admin' => strcasecmp((string)$row['role'], 'Admin') === 0,
    ];
}

function is_admin(array $user): bool
{
    return !empty($user['is_admin']) || strcasecmp((string)($user['role'] ?? ''), 'Admin') === 0;
}

function require_admin(): array
{
    $user = require_user();
    if (!is_admin($user)) {
        json_out(['ok' => false, 'error' => 'Só o admin pode fazer isso'], 403);
    }
    return $user;
}

function role_valida(string $role): bool
{
    return in_array($role, TECH_ROLES, true);
}

function role_exige_github(string $role): bool
{
    return in_array($role, TECH_GITHUB_REQUIRED, true);
}

/**
 * Aceita @usuario, usuario ou e-mail noreply do GitHub.
 * Não aceita o ID numérico sozinho.
 *
 * @return array{ok:bool,login:?string,error:?string}
 */
function normalize_github_login(string $raw): array
{
    $raw = trim($raw);
    if ($raw === '') {
        return ['ok' => false, 'login' => null, 'error' => 'Informe o @ ou o e-mail do GitHub'];
    }
    if ($raw[0] === '@') {
        $raw = substr($raw, 1);
    }
    if (preg_match('/^\d+$/', $raw)) {
        return ['ok' => false, 'login' => null, 'error' => 'Use o @ do GitHub, não o ID numérico'];
    }
    if (str_contains($raw, '@')) {
        $email = strtolower($raw);
        if (preg_match('/^(?:\d+\+)?([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)@users\.noreply\.github\.com$/', $email, $m)) {
            $raw = $m[1];
        } elseif (preg_match('/^([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)@gmail\.com$/', $email, $m)) {
            // E-mail comum não prova o GitHub — pedimos o @
            return ['ok' => false, 'login' => null, 'error' => 'Para tecnologia use o @ do GitHub ou o e-mail users.noreply.github.com'];
        } else {
            return ['ok' => false, 'login' => null, 'error' => 'Use o @ do GitHub ou o e-mail …@users.noreply.github.com'];
        }
    }
    if (!preg_match('/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/', $raw)) {
        return ['ok' => false, 'login' => null, 'error' => 'Usuário do GitHub inválido'];
    }
    return ['ok' => true, 'login' => $raw, 'error' => null];
}

function fetch_user_row(int $id): ?array
{
    $stmt = db()->prepare(
        'SELECT id, email, name, role, github_login, is_active FROM users WHERE id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Visitante comum só vê o que é dele. Admin recebe o estado inteiro.
 */
function filter_state_for_user(array $payload, array $user): array
{
    if (is_admin($user)) {
        return $payload;
    }
    $uid = (string)$user['id'];
    $keepMine = static function (array $items, string $key) use ($uid): array {
        return array_values(array_filter($items, static function ($item) use ($key, $uid) {
            return is_array($item) && (string)($item[$key] ?? '') === $uid;
        }));
    };
    $payload['tasks'] = $keepMine($payload['tasks'] ?? [], 'assigneeId');
    $payload['commits'] = $keepMine($payload['commits'] ?? [], 'authorId');
    $payload['githubReports'] = $keepMine($payload['githubReports'] ?? [], 'memberId');
    $payload['chatLog'] = $keepMine($payload['chatLog'] ?? [], 'userId');
    $payload['members'] = [[
        'id' => $uid,
        'name' => (string)$user['name'],
        'role' => (string)$user['role'],
        'teamId' => null,
        'githubLogin' => $user['github_login'] ?? null,
    ]];
    $payload['finance'] = [];
    $payload['notices'] = [];
    return $payload;
}

/**
 * Não-admin só grava a própria fatia; o restante do JSON permanece.
 */
function merge_state_from_user(array $current, array $incoming, array $user): array
{
    if (is_admin($user)) {
        return $incoming;
    }
    $uid = (string)$user['id'];

    $replaceMine = static function (array $currentItems, array $incomingItems, string $key) use ($uid): array {
        $others = array_values(array_filter($currentItems, static function ($item) use ($key, $uid) {
            return is_array($item) && (string)($item[$key] ?? '') !== $uid;
        }));
        $mine = [];
        foreach ($incomingItems as $item) {
            if (!is_array($item)) {
                continue;
            }
            $item[$key] = $uid;
            $mine[] = $item;
        }
        return array_merge($others, $mine);
    };

    $current['tasks'] = $replaceMine($current['tasks'] ?? [], $incoming['tasks'] ?? [], 'assigneeId');
    $current['commits'] = $replaceMine($current['commits'] ?? [], $incoming['commits'] ?? [], 'authorId');
    $current['githubReports'] = $replaceMine($current['githubReports'] ?? [], $incoming['githubReports'] ?? [], 'memberId');
    $current['chatLog'] = $replaceMine($current['chatLog'] ?? [], $incoming['chatLog'] ?? [], 'userId');
    return $current;
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
        'SELECT u.id, u.email, u.name, u.role, u.github_login, u.is_active, s.expires_at
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
    return user_dto($row);
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        json_out(['ok' => false, 'error' => 'Não autenticado'], 401);
    }
    return $user;
}

/**
 * Cria cookie de sessão para um usuário já validado.
 *
 * @param array{id:int|string,email:string,name:string,role:string} $row
 * @return array{id:int,email:string,name:string,role:string}
 */
function issue_session_for_user(array $row): array
{
    global $CONFIG;
    $days = max(1, (int)($CONFIG['session_days'] ?? 7));
    $token = bin2hex(random_bytes(32));
    $meta = client_meta();
    $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify("+{$days} days")
        ->format('Y-m-d H:i:s');

    db()->prepare(
        'INSERT INTO auth_sessions (id, user_id, expires_at, ip_hash, user_agent_hash) VALUES (?, ?, ?, ?, ?)'
    )->execute([$token, (int)$row['id'], $expires, $meta['ip_hash'], $meta['ua_hash']]);

    set_session_cookie($token, $days);

    return user_dto($row);
}
