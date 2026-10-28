<?php
declare(strict_types=1);

/**
 * Confere um usuário público no GitHub e monta o resumo da atividade.
 * A pessoa não escreve o texto: ele sai dos commits e pull requests públicos.
 */

function github_login_valido(string $login): bool
{
    return (bool)preg_match('/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/', $login);
}

/**
 * @return array{status:int,data:mixed,error:?string}
 */
function github_get(string $path): array
{
    global $CONFIG;

    if ($path === '' || $path[0] !== '/' || strpos($path, '..') !== false || strpos($path, '://') !== false || strpos($path, '\\') !== false) {
        return ['status' => 400, 'data' => null, 'error' => 'Consulta inválida'];
    }

    $url = 'https://api.github.com' . $path;
    $headers = [
        'User-Agent: PortalCybhor',
        'Accept: application/vnd.github+json',
        'X-GitHub-Api-Version: 2022-11-28',
    ];
    $token = trim((string)($CONFIG['github_token'] ?? ''));
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $status = 0;
    $body = false;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            return ['status' => 502, 'data' => null, 'error' => 'Não foi possível consultar o GitHub'];
        }
        $curlOpts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => $headers,
        ];
        if (defined('CURLPROTO_HTTPS')) {
            $curlOpts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
        }
        curl_setopt_array($ch, $curlOpts);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $headerLines = implode("\r\n", $headers);
        $ctx = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 12,
                'header' => $headerLines . "\r\n",
                'ignore_errors' => true,
            ],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        $statusLine = $http_response_header[0] ?? '';
        if (preg_match('/\s(\d{3})\s/', (string)$statusLine, $m)) {
            $status = (int)$m[1];
        }
    }

    if (!is_string($body) || $body === '') {
        return ['status' => $status ?: 502, 'data' => null, 'error' => 'GitHub não respondeu'];
    }

    $decoded = json_decode($body, true);
    if ($status === 404) {
        return ['status' => 404, 'data' => null, 'error' => 'Usuário não encontrado no GitHub'];
    }
    if ($status === 403 || $status === 429) {
        return ['status' => 429, 'data' => null, 'error' => 'GitHub limitou as consultas. Tente de novo em alguns minutos.'];
    }
    if ($status < 200 || $status >= 300 || $decoded === null) {
        return ['status' => 502, 'data' => null, 'error' => 'Não foi possível ler o GitHub agora'];
    }

    return ['status' => $status, 'data' => $decoded, 'error' => null];
}

function github_uma_linha(string $message): string
{
    $line = preg_split("/\R/", $message)[0] ?? '';
    $line = trim(preg_replace('/\s+/', ' ', $line) ?? '');
    if (function_exists('mb_substr')) {
        $line = mb_substr($line, 0, 140);
    } else {
        $line = substr($line, 0, 140);
    }
    return $line;
}

function github_tipo_commit(string $message): string
{
    $norm = strtolower($message);
    if (preg_match('/^(feat|feature|fix|docs|doc|refactor|test|chore|perf|style|ci|build)(\(|:)/', $norm, $m)) {
        $tipo = $m[1];
        if ($tipo === 'feature') return 'feat';
        if ($tipo === 'doc') return 'docs';
        return $tipo;
    }
    if (preg_match('/\b(fix|corrige|corrigi|bug)\b/', $norm)) return 'fix';
    if (preg_match('/\b(doc|readme)\b/', $norm)) return 'docs';
    if (preg_match('/\b(test|teste)\b/', $norm)) return 'test';
    if (preg_match('/\b(feat|adiciona|implementa|cria)\b/', $norm)) return 'feat';
    return 'outro';
}

function github_repo_valido(string $full): bool
{
    return (bool)preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $full);
}

/**
 * @param list<string> $repos
 * @return list<array{repo:string,message:string,sha:string,at:string,url:string,comIa:bool}>
 */
function github_commits_dos_repos(string $login, array $repos): array
{
    $commits = [];
    $seen = [];
    $limiteFuturo = time() + 2 * 86400;
    $limiteAntigo = time() - 90 * 86400;

    foreach ($repos as $full) {
        if (!github_repo_valido($full)) continue;
        [$owner, $repo] = explode('/', $full, 2);
        $path = '/repos/' . rawurlencode($owner) . '/' . rawurlencode($repo)
            . '/commits?author=' . rawurlencode($login) . '&per_page=5';
        $res = github_get($path);
        if (!is_array($res['data'])) continue;

        foreach ($res['data'] as $item) {
            if (!is_array($item)) continue;
            $sha = (string)($item['sha'] ?? '');
            if ($sha === '' || isset($seen[$sha])) continue;
            $authorLogin = strtolower((string)($item['author']['login'] ?? ''));
            if ($authorLogin !== '' && $authorLogin !== strtolower($login)) continue;

            $messageRaw = (string)($item['commit']['message'] ?? '');
            $at = (string)($item['commit']['author']['date'] ?? '');
            $ts = strtotime($at);
            if ($ts === false || $ts > $limiteFuturo || $ts < $limiteAntigo) continue;

            $seen[$sha] = true;
            $message = github_uma_linha($messageRaw);
            if ($message === '') $message = 'Commit sem mensagem';
            $url = (string)($item['html_url'] ?? '');
            if (!preg_match('#^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/commit/[0-9a-f]{7,40}$#', $url)) {
                $url = 'https://github.com/' . $full . '/commit/' . $sha;
            }
            $commits[] = [
                'repo' => $full,
                'message' => $message,
                'sha' => $sha,
                'at' => $at,
                'url' => $url,
                'comIa' => github_cita_ia($messageRaw),
            ];
        }
    }

    usort($commits, static function (array $a, array $b): int {
        return strcmp($b['at'], $a['at']);
    });

    return $commits;
}

function github_cita_ia(string $message): bool
{
    return (bool)preg_match(
        '/copilot|cursor|chatgpt|claude|gemini|generated by|co-authored-by:\s*(copilot|cursor)/i',
        $message
    );
}

/**
 * @param list<array{repo:string,message:string,sha:string,at:string,url:string,comIa:bool}> $commits
 * @param list<array{repo:string,title:string,action:string}> $pulls
 * @return array{text:string,bullets:list<string>}
 */
function github_escrever_resumo(string $nome, array $commits, array $pulls): array
{
    $porRepo = [];
    $porTipo = [];
    $comIa = 0;
    foreach ($commits as $commit) {
        $porRepo[$commit['repo']][] = $commit;
        $tipo = github_tipo_commit($commit['message']);
        $porTipo[$tipo] = ($porTipo[$tipo] ?? 0) + 1;
        if (!empty($commit['comIa'])) $comIa++;
    }

    $n = count($commits);
    $repos = count($porRepo);
    $nPulls = count($pulls);

    if ($n === 0 && $nPulls === 0) {
        return [
            'text' => $nome . ' está vinculado no GitHub, mas não há commit nem pull request público recente. Repositório privado não entra neste resumo.',
            'bullets' => [],
        ];
    }

    $rotulos = [
        'feat' => 'funcionalidade nova',
        'fix' => 'correção',
        'docs' => 'documentação',
        'refactor' => 'reorganização de código',
        'test' => 'teste',
        'chore' => 'manutenção',
        'perf' => 'desempenho',
        'style' => 'ajuste de estilo',
        'ci' => 'integração contínua',
        'build' => 'build',
        'outro' => 'entrega geral',
    ];

    arsort($porTipo);
    $tipoTopo = (string)array_key_first($porTipo);
    $rotulo = $rotulos[$tipoTopo] ?? 'entrega';

    $exemplos = [];
    foreach (array_slice($commits, 0, 3) as $commit) {
        $exemplos[] = $commit['repo'] . ' — ' . $commit['message'];
    }

    $partes = [];
    $partes[] = $nome . ' publicou ' . $n . ' commit' . ($n === 1 ? '' : 's') . ' público' . ($n === 1 ? '' : 's') . ' em ' . $repos . ' repositório' . ($repos === 1 ? '' : 's') . '.';
    if ($n > 0) {
        $partes[] = 'O que mais aparece é ' . $rotulo . ': ' . implode('; ', $exemplos) . '.';
    }
    if ($nPulls > 0) {
        $partes[] = 'Também houve ' . $nPulls . ' movimentação' . ($nPulls === 1 ? '' : 'ões') . ' de pull request.';
    }
    if ($comIa > 0) {
        $partes[] = 'Em ' . $comIa . ' commit' . ($comIa === 1 ? '' : 's') . ' a mensagem cita ferramenta de IA (Cursor, Copilot ou similar).';
    }
    $partes[] = 'Este texto foi gerado pelo portal a partir do GitHub. A pessoa não escreveu o relatório.';

    $bullets = [];
    foreach (array_slice($commits, 0, 12) as $commit) {
        $quando = '';
        try {
            $quando = (new DateTimeImmutable($commit['at']))->setTimezone(new DateTimeZone('America/Sao_Paulo'))->format('d/m');
        } catch (Throwable $e) {
            $quando = '';
        }
        $prefixo = $quando !== '' ? $quando . ' · ' : '';
        $marca = !empty($commit['comIa']) ? ' · cita IA' : '';
        $bullets[] = $prefixo . $commit['repo'] . ' — ' . $commit['message'] . $marca;
    }

    return [
        'text' => implode(' ', $partes),
        'bullets' => $bullets,
    ];
}

/**
 * @return array<string,mixed>
 */
function github_build_summary(string $login): array
{
    $login = trim($login);
    if (!github_login_valido($login) || preg_match('/^\d+$/', $login)) {
        return ['ok' => false, 'status' => 400, 'error' => 'Informe o usuário do GitHub (letras, números e hífen). Não use o ID numérico.'];
    }

    $userRes = github_get('/users/' . rawurlencode($login));
    if (!$userRes['data'] || !is_array($userRes['data'])) {
        return ['ok' => false, 'status' => $userRes['status'] ?: 502, 'error' => $userRes['error'] ?? 'Falha ao consultar o GitHub'];
    }

    $profile = $userRes['data'];
    $canonical = (string)($profile['login'] ?? $login);
    $nome = trim((string)($profile['name'] ?? ''));
    if ($nome === '') $nome = $canonical;

    $eventsRes = github_get('/users/' . rawurlencode($canonical) . '/events/public?per_page=30');
    $events = is_array($eventsRes['data']) ? $eventsRes['data'] : [];

    $repos = [];
    $pulls = [];
    foreach ($events as $event) {
        if (!is_array($event)) continue;
        $type = (string)($event['type'] ?? '');
        $repo = (string)($event['repo']['name'] ?? '');
        if ($type === 'PushEvent' && github_repo_valido($repo) && !in_array($repo, $repos, true)) {
            $repos[] = $repo;
        } elseif ($type === 'PullRequestEvent') {
            $pr = $event['payload']['pull_request'] ?? null;
            if (is_array($pr)) {
                $pulls[] = [
                    'repo' => $repo,
                    'title' => github_uma_linha((string)($pr['title'] ?? 'Pull request')),
                    'action' => (string)($event['payload']['action'] ?? ''),
                ];
            }
        }
    }

    if (!$repos) {
        $reposRes = github_get('/users/' . rawurlencode($canonical) . '/repos?sort=pushed&per_page=4');
        $listaRepos = is_array($reposRes['data']) ? $reposRes['data'] : [];
        foreach ($listaRepos as $repoRow) {
            if (!is_array($repoRow)) continue;
            $full = (string)($repoRow['full_name'] ?? '');
            if (github_repo_valido($full)) $repos[] = $full;
        }
    }

    $repos = array_slice($repos, 0, 4);
    $commits = github_commits_dos_repos($canonical, $repos);
    $privados = count($repos) > 0 && count($commits) === 0;

    $commits = array_slice($commits, 0, 20);
    $pulls = array_slice($pulls, 0, 10);
    $resumo = github_escrever_resumo($nome, $commits, $pulls);
    if ($privados && $commits === []) {
        $resumo['text'] = $nome . ' tem atividade no GitHub, mas os commits recentes não puderam ser lidos (repositório privado ou sem mensagem pública). A pessoa não precisa escrever o relatório.';
    }

    $reposTocados = [];
    foreach ($commits as $commit) {
        $reposTocados[$commit['repo']] = true;
    }

    return [
        'ok' => true,
        'status' => 200,
        'profile' => [
            'login' => $canonical,
            'name' => $nome,
            'html_url' => preg_match('#^https://github\\.com/[A-Za-z0-9-]+$#', (string)($profile['html_url'] ?? ''))
                ? (string)$profile['html_url']
                : ('https://github.com/' . $canonical),
            'public_repos' => (int)($profile['public_repos'] ?? 0),
        ],
        'summary' => $resumo,
        'commits' => $commits,
        'stats' => [
            'commits' => count($commits),
            'repos' => count($reposTocados),
            'pulls' => count($pulls),
        ],
    ];
}
