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
            'roles' => TECH_ROLES,
            'github_required_roles' => TECH_GITHUB_REQUIRED,
        ]);
    }

    // Acesso direto (legado). Preferir login com senha.
    if ($method === 'POST' && $path === '/enter') {
        global $CONFIG;
        if (empty($CONFIG['open_access'])) {
            json_out(['ok' => false, 'error' => 'Faça login com e-mail e senha'], 403);
        }

        $existing = current_user();
        if ($existing) {
            json_out(['ok' => true, 'user' => $existing, 'open_access' => true]);
        }

        $adminEmail = strtolower(trim((string)($CONFIG['admin_email'] ?? '')));
        $row = null;
        if ($adminEmail !== '') {
            $stmt = db()->prepare(
                'SELECT id, email, name, role, github_login, is_active FROM users WHERE email = ? AND is_active = 1 LIMIT 1'
            );
            $stmt->execute([$adminEmail]);
            $row = $stmt->fetch() ?: null;
        }
        if (!$row) {
            $row = db()->query(
                'SELECT id, email, name, role, github_login, is_active FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
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

        $stmt = db()->prepare(
            'SELECT id, email, password_hash, name, role, github_login, is_active FROM users WHERE email = ? LIMIT 1'
        );
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

    if ($method === 'GET' && $path === '/users') {
        $viewer = require_user();
        if (is_admin($viewer)) {
            $rows = db()->query(
                'SELECT id, email, name, role, github_login, is_active, created_at
                 FROM users ORDER BY name ASC'
            )->fetchAll();
            $users = array_map('user_dto', $rows ?: []);
        } else {
            $users = [$viewer];
        }
        json_out(['ok' => true, 'users' => $users]);
    }

    if ($method === 'POST' && $path === '/users') {
        require_admin();
        $body = read_json_body();
        $name = trim((string)($body['name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $role = trim((string)($body['role'] ?? 'Dev'));
        $githubRaw = trim((string)($body['github_login'] ?? $body['github'] ?? ''));

        if ($name === '' || mb_strlen($name) > 120) {
            json_out(['ok' => false, 'error' => 'Nome inválido'], 400);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
            json_out(['ok' => false, 'error' => 'E-mail inválido'], 400);
        }
        if (strlen($password) < 8) {
            json_out(['ok' => false, 'error' => 'Senha com no mínimo 8 caracteres'], 400);
        }
        if (!role_valida($role)) {
            json_out(['ok' => false, 'error' => 'Papel inválido. Use: ' . implode(', ', TECH_ROLES)], 400);
        }

        $githubLogin = null;
        if (role_exige_github($role) || $githubRaw !== '') {
            $gh = normalize_github_login($githubRaw);
            if (!$gh['ok']) {
                json_out(['ok' => false, 'error' => $gh['error'] ?? 'GitHub inválido'], 400);
            }
            $githubLogin = $gh['login'];
        }

        $exists = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $exists->execute([$email]);
        if ($exists->fetch()) {
            json_out(['ok' => false, 'error' => 'Já existe usuário com este e-mail'], 409);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        db()->prepare(
            'INSERT INTO users (email, password_hash, name, role, github_login, is_active)
             VALUES (?, ?, ?, ?, ?, 1)'
        )->execute([$email, $hash, $name, $role, $githubLogin]);

        $id = (int)db()->lastInsertId();
        $row = fetch_user_row($id);
        json_out(['ok' => true, 'user' => user_dto($row ?: [
            'id' => $id,
            'email' => $email,
            'name' => $name,
            'role' => $role,
            'github_login' => $githubLogin,
            'is_active' => 1,
        ])], 201);
    }

    if (preg_match('#^/users/(\d+)$#', $path, $m)) {
        $targetId = (int)$m[1];

        if ($method === 'PATCH') {
            require_admin();
            $row = fetch_user_row($targetId);
            if (!$row) {
                json_out(['ok' => false, 'error' => 'Usuário não encontrado'], 404);
            }
            $body = read_json_body();
            $name = array_key_exists('name', $body) ? trim((string)$body['name']) : (string)$row['name'];
            $role = array_key_exists('role', $body) ? trim((string)$body['role']) : (string)$row['role'];
            $active = array_key_exists('is_active', $body) ? (!empty($body['is_active']) ? 1 : 0) : (int)$row['is_active'];
            $githubRaw = array_key_exists('github_login', $body) || array_key_exists('github', $body)
                ? trim((string)($body['github_login'] ?? $body['github'] ?? ''))
                : (string)($row['github_login'] ?? '');

            if ($name === '' || mb_strlen($name) > 120) {
                json_out(['ok' => false, 'error' => 'Nome inválido'], 400);
            }
            if (!role_valida($role)) {
                json_out(['ok' => false, 'error' => 'Papel inválido'], 400);
            }

            $githubLogin = null;
            if (role_exige_github($role) || $githubRaw !== '') {
                $gh = normalize_github_login($githubRaw);
                if (!$gh['ok']) {
                    json_out(['ok' => false, 'error' => $gh['error'] ?? 'GitHub inválido'], 400);
                }
                $githubLogin = $gh['login'];
            }

            if (array_key_exists('password', $body) && (string)$body['password'] !== '') {
                $password = (string)$body['password'];
                if (strlen($password) < 8) {
                    json_out(['ok' => false, 'error' => 'Senha com no mínimo 8 caracteres'], 400);
                }
                db()->prepare(
                    'UPDATE users SET name = ?, role = ?, github_login = ?, is_active = ?, password_hash = ? WHERE id = ?'
                )->execute([$name, $role, $githubLogin, $active, password_hash($password, PASSWORD_DEFAULT), $targetId]);
            } else {
                db()->prepare(
                    'UPDATE users SET name = ?, role = ?, github_login = ?, is_active = ? WHERE id = ?'
                )->execute([$name, $role, $githubLogin, $active, $targetId]);
            }

            $fresh = fetch_user_row($targetId);
            json_out(['ok' => true, 'user' => user_dto($fresh ?: $row)]);
        }

        if ($method === 'DELETE') {
            require_admin();
            $viewer = current_user();
            if ($viewer && (int)$viewer['id'] === $targetId) {
                json_out(['ok' => false, 'error' => 'Você não pode desativar a si mesmo'], 400);
            }
            $row = fetch_user_row($targetId);
            if (!$row) {
                json_out(['ok' => false, 'error' => 'Usuário não encontrado'], 404);
            }
            db()->prepare('UPDATE users SET is_active = 0 WHERE id = ?')->execute([$targetId]);
            db()->prepare('DELETE FROM auth_sessions WHERE user_id = ?')->execute([$targetId]);
            json_out(['ok' => true]);
        }
    }

    if ($method === 'POST' && $path === '/me/github') {
        $user = require_user();
        $body = read_json_body();
        $gh = normalize_github_login((string)($body['login'] ?? $body['github_login'] ?? $body['github'] ?? ''));
        if (!$gh['ok']) {
            json_out(['ok' => false, 'error' => $gh['error'] ?? 'GitHub inválido'], 400);
        }
        require_once __DIR__ . '/github_summary.php';
        $result = github_build_summary((string)$gh['login']);
        if (empty($result['ok'])) {
            $status = (int)($result['status'] ?? 400);
            unset($result['status']);
            json_out($result, $status);
        }
        $login = (string)($result['profile']['login'] ?? $gh['login']);
        db()->prepare('UPDATE users SET github_login = ? WHERE id = ?')->execute([$login, $user['id']]);
        $fresh = fetch_user_row((int)$user['id']);
        unset($result['status']);
        json_out([
            'ok' => true,
            'user' => user_dto($fresh ?: array_merge($user, ['github_login' => $login])),
            'summary' => $result,
        ]);
    }

    if ($method === 'DELETE' && $path === '/me/github') {
        $user = require_user();
        if (role_exige_github((string)$user['role'])) {
            json_out(['ok' => false, 'error' => 'No seu papel o GitHub é obrigatório'], 400);
        }
        db()->prepare('UPDATE users SET github_login = NULL WHERE id = ?')->execute([$user['id']]);
        $fresh = fetch_user_row((int)$user['id']);
        json_out(['ok' => true, 'user' => user_dto($fresh ?: $user)]);
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
            'data' => filter_state_for_user($payload, $user),
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

        $stmt = db()->query('SELECT payload FROM app_state WHERE id = 1 LIMIT 1');
        $row = $stmt->fetch();
        $current = [];
        if ($row) {
            $decoded = json_decode((string)$row['payload'], true);
            if (is_array($decoded)) {
                $current = $decoded;
            }
        }
        $merged = merge_state_from_user($current, $data, $user);

        $encoded = json_encode($merged, JSON_UNESCAPED_UNICODE);
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
