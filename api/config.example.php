<?php
declare(strict_types=1);

return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'u812914256_portal',
    'db_user' => 'u812914256_portal',
    'db_pass' => 'TROQUE_ESTA_SENHA',
    'session_days' => 7,
    // false = exige login. Só use true em emergência.
    'open_access' => false,
    'admin_email' => 'admin@cybhor.com',
    'admin_password' => 'TROQUE_NO_PRIMEIRO_LOGIN',
    'admin_name' => 'Admin',
    // Opcional. Sem token, o GitHub limita a 60 consultas por hora neste servidor.
    'github_token' => '',
];
