<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
// Aceita /api, /api/, /api/index.php/login etc.
$path = preg_replace('#^.*?/api(?:/index\\.php)?#', '', $path) ?: '/';
$path = '/' . trim($path, '/');
if ($path === '/') {
    $path = '/health';
}

try {
    if ($method === 'GET' && $path === '/health') {
        db()->query('SELECT 1');
        json_out(['ok' => true, 'service' => 'portal-cybhor-api', 'db' => true]);
    }

    if ($method === 'GET' && $path === '/me') {
        $user = current_user();
        json_out(['ok' => true, 'user' => $user]);
    }

    if ($method === 'POST' && $path === '/login') {
        $body = read_json_body();
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        if ($email === '' || $password === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_out(['ok' => false, 'error' => 'Credenciais inválidas'], 400);
        }

        $stmt = db()->prepare('SELECT id, email, password_hash, name, role, is_active FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        if (!$row || !(int)$row['is_active'] || !password_verify($password, (string)$row['password_hash'])) {
            usleep(200000);
            json_out(['ok' => false, 'error' => 'E-mail ou senha incorretos'], 401);
        }

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
        json_out([
            'ok' => true,
            'user' => [
                'id' => (int)$row['id'],
                'email' => (string)$row['email'],
                'name' => (string)$row['name'],
                'role' => (string)$row['role'],
            ],
        ]);
    }

    if ($method === 'POST' && $path === '/logout') {
        $token = $_COOKIE['cybhor_sid'] ?? '';
        if (is_string($token) && preg_match('/^[a-f0-9]{64}$/', $token)) {
            db()->prepare('DELETE FROM auth_sessions WHERE id = ?')->execute([$token]);
        }
        clear_session_cookie();
        json_out(['ok' => true]);
    }

    if ($method === 'GET' && $path === '/state') {
        $user = require_user();
        $stmt = db()->query('SELECT payload, updated_at FROM app_state WHERE id = 1 LIMIT 1');
        $row = $stmt->fetch();
        if (!$row) {
            json_out(['ok' => false, 'error' => 'Estado não encontrado'], 404);
        }
        $payload = json_decode((string)$row['payload'], true);
        if (!is_array($payload)) {
            json_out(['ok' => false, 'error' => 'Estado corrompido'], 500);
        }
        json_out([
            'ok' => true,
            'user' => $user,
            'data' => $payload,
            'updated_at' => $row['updated_at'],
        ]);
    }

    if ($method === 'PUT' && $path === '/state') {
        $user = require_user();
        $body = read_json_body();
        $data = $body['data'] ?? null;
        if (!is_array($data)) {
            json_out(['ok' => false, 'error' => 'Payload inválido'], 400);
        }
        // Limite básico anti-abuso (~2MB JSON)
        $encoded = json_encode($data, JSON_UNESCAPED_UNICODE);
        if ($encoded === false || strlen($encoded) > 2_000_000) {
            json_out(['ok' => false, 'error' => 'Dados grandes demais'], 413);
        }
        db()->prepare(
            'INSERT INTO app_state (id, payload, updated_by) VALUES (1, ?, ?)
             ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_by = VALUES(updated_by)'
        )->execute([$encoded, $user['id']]);
        json_out(['ok' => true]);
    }

    json_out(['ok' => false, 'error' => 'Rota não encontrada'], 404);
} catch (Throwable $e) {
    error_log('portal-api: ' . $e->getMessage());
    json_out(['ok' => false, 'error' => 'Erro interno'], 500);
}
