# Portal Cybhor v2

Portal de organização da equipe com **MySQL na Hostinger** (API PHP).

## Ao vivo

https://aqua-alligator-304223.hostingersite.com/

## Login

O admin cria as contas em **Usuários**. Em Dev, Programação, DevOps e ETEC o GitHub (@ ou e-mail noreply) é obrigatório.

Sessão com cookie `HttpOnly` · dados no MySQL. Cada usuário só vê a própria área; o admin vê tudo.

## Arquitetura

- Frontend estático (`index.html` + `assets/`)
- API em `api/` (PHP + PDO prepared statements)
- Tabelas: `users`, `auth_sessions`, `app_state`

## Como usar (3 passos)

1. **Pessoas** — times e membros  
2. **Tarefas** — arraste para Concluído  
3. **Hoje** — foco do dia  

**Código** = cole o commit para a % subir. Pontos por **feitos**, não por horas.

## Deploy / instalação

1. Crie o banco MySQL no hPanel  
2. Copie `api/config.example.php` → `api/config.local.php` e preencha  
3. Suba os arquivos para `public_html`  
4. Abra `/api/install.php` **uma vez**  
5. **Apague** `api/install.php` do servidor  

## Local (só frontend)

```bash
python3 -m http.server 8766
```

A API MySQL roda na Hostinger (PHP).
