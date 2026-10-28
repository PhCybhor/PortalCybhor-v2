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
        global $CONFIG;
        json_out([
            'ok' => true,
            'user' => $user,
            'open_access' => !empty($CONFIG['open_access']),
        ]);
    }

    // Acesso direto ao portal (sem tela de login) quando open_access=true.
    if ($method === 'POST' && $path === '/enter') {
        global $CONFIG;
        if (empty($CONFIG['open_access'])) {
            json_out(['ok' => false, 'error' => 'Acesso aberto desativado'], 403);
        }

        $existing = current_user();
        if ($existing) {
            json_out(['ok' => true, 'user' => $existing, 'open_access' => true]);
        }

        $adminEmail = strtolower(trim((string)($CONFIG['admin_email'] ?? '')));
        $row = null;
        if ($adminEmail !== '') {
            $stmt = db()->prepare(
                'SELECT id, email, name, role, is_active FROM users WHERE email = ? AND is_active = 1 LIMIT 1'
            );
            $stmt->execute([$adminEmail]);
            $row = $stmt->fetch() ?: null;
        }
        if (!$row) {
            $row = db()->query(
                'SELECT id, email, name, role, is_active FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
            )->fetch() ?: null;
        }
        if (!$row) {
            json_out(['ok' => false, 'error' => 'Nenhum usuário ativo no portal'], 500);
        }

        $user = issue_session_for_user($row);
        json_out(['ok' => true, 'user' => $user, 'open_access' => true]);
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

        $user = issue_session_for_user($row);
        json_out(['ok' => true, 'user' => $user]);
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

    if ($method === 'POST' && $path === '/github/summary') {
        require_user();
        require_once __DIR__ . '/github_summary.php';
        $body = read_json_body();
        $login = trim((string)($body['login'] ?? ''));
        $result = github_build_summary($login);
        $status = (int)($result['status'] ?? 200);
        unset($result['status']);
        json_out($result, $result['ok'] ? 200 : $status);
    }

    json_out(['ok' => false, 'error' => 'Rota não encontrada'], 404);
} catch (Throwable $e) {
    error_log('portal-api: ' . $e->getMessage());
    json_out(['ok' => false, 'error' => 'Erro interno'], 500);
}
