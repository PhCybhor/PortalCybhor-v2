<?php
declare(strict_types=1);

/**
 * Instalação única: cria tabelas, admin e estado inicial.
 * Após sucesso, remova este arquivo do servidor.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$configFile = __DIR__ . '/config.local.php';
$lockFile = __DIR__ . '/.installed';

if (is_file($lockFile)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Já instalado. Remova api/install.php do servidor.']);
    exit;
}

if (!is_file($configFile)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Falta config.local.php']);
    exit;
}

/** @var array $CONFIG */
$CONFIG = require $configFile;

try {
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

    $schema = file_get_contents(__DIR__ . '/schema.sql');
    if ($schema === false) {
        throw new RuntimeException('schema.sql ausente');
    }
    $pdo->exec($schema);

    $adminEmail = strtolower((string)($CONFIG['admin_email'] ?? 'admin@cybhor.com'));
    $adminPass = (string)($CONFIG['admin_password'] ?? 'cybhor123');
    $adminName = (string)($CONFIG['admin_name'] ?? 'Gabriel Silva');
    $hash = password_hash($adminPass, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare(
        'INSERT INTO users (email, password_hash, name, role, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), role = VALUES(role), is_active = 1'
    );
    $stmt->execute([$adminEmail, $hash, $adminName, 'Admin']);

    $seedFile = __DIR__ . '/seed-state.json';
    $seed = is_file($seedFile) ? file_get_contents($seedFile) : '{}';
    if ($seed === false || json_decode($seed, true) === null) {
        throw new RuntimeException('seed-state.json inválido');
    }

    $pdo->prepare(
        'INSERT INTO app_state (id, payload, updated_by) VALUES (1, ?, NULL)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload)'
    )->execute([$seed]);

    file_put_contents($lockFile, date('c') . "\n");

    echo json_encode([
        'ok' => true,
        'message' => 'Instalação concluída. Apague api/install.php agora.',
        'admin' => $adminEmail,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
