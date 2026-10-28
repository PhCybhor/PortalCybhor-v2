/**
 * Portal Cybhor v2 — shell com sidebar, atividade e backup.
 * Dados e autenticação via API PHP + MySQL (Hostinger).
 */
(function () {
  const API_BASE = "/api";
  const STORAGE_KEY = "cybhor_site_v2_2"; // cache local opcional (offline curto)
  const SESSION_KEY = "cybhor_session_v1";

  const AREAS = [
    { id: "desenvolvimento", label: "Desenvolvimento" },
    { id: "marketing", label: "Marketing" },
    { id: "financeiro", label: "Financeiro" },
    { id: "comercial", label: "Comercial" },
    { id: "produto", label: "Produto" },
    { id: "rh", label: "RH" },
    { id: "operacoes", label: "Operações" },
  ];

  const defaultData = () => ({
    projects: [
      { id: "proj_alfa", name: "Projeto Alfa", progress: 72, owner: "Ana Costa", status: "progress", initiativeId: "init_lancamento" },
      { id: "proj_beta", name: "Projeto Beta", progress: 45, owner: "Lucas Mendes", status: "wait", initiativeId: "init_lancamento" },
      { id: "proj_gama", name: "Projeto Gama", progress: 100, owner: "Marina Reis", status: "done", initiativeId: null },
    ],
    /** Iniciativa = guarda-chuva (ex.: grande campanha) que liga várias áreas e projetos */
    initiatives: [
      {
        id: "init_lancamento",
        name: "Lançamento Portal Cybhor",
        description: "Campanha integrada: produto, marketing e engajamento da equipe.",
        areas: ["desenvolvimento", "marketing", "produto", "comercial"],
        projectIds: ["proj_alfa", "proj_beta"],
        owner: "Gabriel Silva",
        status: "progress",
      },
    ],
    teams: [
      { id: "team_prod", name: "Squad Produto", area: "produto", leadId: "mem_ana" },
      { id: "team_eng", name: "Engenharia", area: "desenvolvimento", leadId: "mem_lucas" },
      { id: "team_mkt", name: "Marketing", area: "marketing", leadId: "mem_pedro" },
    ],
    members: [
      { id: "mem_ana", name: "Ana Costa", role: "Product Lead", teamId: "team_prod" },
      { id: "mem_lucas", name: "Lucas Mendes", role: "Engenheiro", teamId: "team_eng" },
      { id: "mem_marina", name: "Marina Reis", role: "Design", teamId: "team_prod" },
      { id: "mem_pedro", name: "Pedro Lima", role: "Marketing", teamId: "team_mkt" },
      { id: "mem_gabriel", name: "Gabriel Silva", role: "Admin", teamId: "team_eng" },
    ],
    tasks: [
      { id: "task_contrato", title: "Revisar contrato Hostinger", column: "todo", priority: "Alta", assigneeId: "mem_gabriel", teamId: "team_eng", dueDate: today() },
      { id: "task_briefing", title: "Briefing campanha Q4", column: "todo", priority: "Média", assigneeId: "mem_pedro", teamId: "team_mkt", dueDate: "" },
      { id: "task_api", title: "API de notificações", column: "doing", priority: "Alta", assigneeId: "mem_lucas", teamId: "team_eng", dueDate: today() },
      { id: "task_layout", title: "Layout mobile do portal", column: "doing", priority: "Média", assigneeId: "mem_marina", teamId: "team_prod", dueDate: "" },
      { id: "task_onb", title: "Onboarding novos usuários", column: "done", priority: "Média", assigneeId: "mem_ana", teamId: "team_prod", dueDate: today(), completedAt: Date.now() - 3600000 },
      { id: "task_logo", title: "Revisar logo da campanha", column: "done", priority: "Baixa", assigneeId: "mem_pedro", teamId: "team_mkt", dueDate: "", completedAt: Date.now() - 2 * 86400000 },
    ],
    events: [
      { id: uid(), time: "09:00", title: "Reunião Geral", detail: "Sala 2 · Equipe completa" },
      { id: uid(), time: "11:30", title: "Feedback 1:1", detail: "Com Ana Costa" },
      { id: uid(), time: "14:00", title: "Planejamento Semanal", detail: "Squad Produto" },
    ],
    notices: [
      { id: uid(), tone: "blue", title: "Treinamento de Segurança", body: "Sexta, 10h · obrigatório para toda a equipe." },
      { id: uid(), tone: "orange", title: "Feliz aniversário, Mariana!", body: "Bolo na cozinha às 16h." },
    ],
    finance: [
      { id: uid(), type: "in", desc: "Cliente Alfa — mensalidade", amount: 8500, date: today() },
      { id: uid(), type: "out", desc: "Hostinger — hospedagem", amount: 89.9, date: today() },
      { id: uid(), type: "out", desc: "Ferramentas SaaS", amount: 420, date: today() },
    ],
    ideas: [
      { id: uid(), title: "App mobile do portal", votes: 5 },
      { id: uid(), title: "Integração WhatsApp", votes: 3 },
    ],
    okrs: { overall: 88, client: 88, delivery: 75, finance: 92 },
    chatLog: [
      {
        id: uid(),
        role: "bot",
        text: "Cybhor v2 — manda updates de tarefas aqui.\n\nResumo de código: menu GitHub, só vinculando a conta. A pessoa não escreve o relatório.\n\nEx.: Concluí a API de notificações",
        at: Date.now(),
      },
    ],
    commits: [],
    githubReports: [],
  });

  let data = defaultData();
  let charts = { performance: null, finance: null };
  let dragTaskId = null;
  let saveTimer = null;
  let apiReady = false;
  let currentUser = null;
  let portalUsers = [];

  const PORTAL_ROLES = [
    "Dev",
    "Programação",
    "DevOps",
    "ETEC",
    "Produto",
    "Design",
    "Marketing",
    "Comercial",
    "Financeiro",
    "RH",
    "Operações",
    "Suporte",
    "Admin",
  ];
  let TECH_GITHUB_REQUIRED = ["Dev", "Programação", "DevOps", "ETEC"];

  function isAdmin() {
    return Boolean(currentUser && (currentUser.is_admin || String(currentUser.role || "").toLowerCase() === "admin"));
  }

  function myId() {
    return currentUser ? String(currentUser.id) : "";
  }

  function roleNeedsGithub(role) {
    return TECH_GITHUB_REQUIRED.includes(String(role || ""));
  }

  function applyRolesMeta(meta) {
    if (meta && Array.isArray(meta.github_required_roles) && meta.github_required_roles.length) {
      TECH_GITHUB_REQUIRED = meta.github_required_roles.map(String);
    }
    fillUserRoleSelect(meta && meta.roles);
  }

  function fillUserRoleSelect(roles) {
    const sel = document.getElementById("new-user-role");
    if (!sel) return;
    const list = Array.isArray(roles) && roles.length ? roles : PORTAL_ROLES;
    const current = sel.value;
    sel.innerHTML = list
      .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
      .join("");
    if (current && list.includes(current)) sel.value = current;
    else if (list.includes("Dev")) sel.value = "Dev";
    syncUserGithubRequirement();
  }

  function usersAsMembers(list) {
    return (list || []).map((u) => ({
      id: String(u.id),
      name: u.name,
      role: u.role,
      teamId: null,
      githubLogin: u.github_login || null,
    }));
  }

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    if (!res.ok) {
      const err = new Error((payload && payload.error) || "Falha na API");
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  function uid() {
    return "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function mergeState(parsed) {
    const base = defaultData();
    if (!parsed || typeof parsed !== "object") return base;
    return {
      ...base,
      ...parsed,
      chatLog: Array.isArray(parsed.chatLog) && parsed.chatLog.length ? parsed.chatLog : base.chatLog,
      commits: Array.isArray(parsed.commits) ? parsed.commits : [],
      githubReports: Array.isArray(parsed.githubReports) ? parsed.githubReports : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams : base.teams,
      members: Array.isArray(parsed.members) ? parsed.members : base.members,
      initiatives: Array.isArray(parsed.initiatives) ? parsed.initiatives : base.initiatives,
      okrs: { ...base.okrs, ...(parsed.okrs || {}) },
    };
  }

  async function loadDataFromApi() {
    const res = await api("/state");
    data = mergeState(res.data);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore quota */
    }
    apiReady = true;
    return data;
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
    if (!apiReady) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await api("/state", { method: "PUT", body: JSON.stringify({ data }) });
      } catch (err) {
        console.error(err);
        toast("Não foi possível salvar no MySQL");
      }
    }, 400);
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setSession(user) {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_KEY);
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function money(n) {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function statusLabel(s) {
    return { progress: "Em andamento", wait: "Aguardando", done: "Concluído" }[s] || s;
  }

  function statusBadge(s) {
    return { progress: "badge-progress", wait: "badge-wait", done: "badge-done" }[s] || "badge-progress";
  }

  /* ——— Auth / entrada direta ——— */
  function initialsFromName(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "CY";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function showBoot(msg) {
    const boot = document.getElementById("boot-screen");
    const auth = document.getElementById("auth-screen");
    if (auth) {
      auth.classList.add("hidden");
      auth.setAttribute("aria-hidden", "true");
    }
    if (boot) {
      boot.classList.remove("hidden");
      const label = boot.querySelector("[data-boot-msg]");
      if (label && msg) label.textContent = msg;
    }
  }

  function hideBoot() {
    const boot = document.getElementById("boot-screen");
    if (boot) boot.classList.add("hidden");
  }

  function showLogin(msg) {
    hideBoot();
    const shell = document.getElementById("app-shell");
    if (shell) shell.classList.add("hidden");
    const auth = document.getElementById("auth-screen");
    if (auth) {
      auth.classList.remove("hidden");
      auth.setAttribute("aria-hidden", "false");
    }
    const err = document.getElementById("login-error");
    if (err) err.textContent = msg || "";
  }

  function applyAdminNav() {
    document.querySelectorAll("[data-admin-only]").forEach((el) => {
      el.hidden = !isAdmin();
    });
  }

  function showApp(user) {
    currentUser = user || null;
    hideBoot();
    const auth = document.getElementById("auth-screen");
    if (auth) {
      auth.classList.add("hidden");
      auth.setAttribute("aria-hidden", "true");
    }
    const shell = document.getElementById("app-shell");
    if (shell) shell.classList.remove("hidden");
    const nameEl = document.getElementById("user-name");
    const roleEl = document.getElementById("user-role");
    if (nameEl) nameEl.textContent = (user && user.name) || "Equipe Cybhor";
    if (roleEl) roleEl.textContent = (user && user.role) || "Portal";
    const avatar = document.getElementById("user-avatar");
    if (avatar) {
      avatar.textContent = initialsFromName(user && user.name);
      avatar.removeAttribute("src");
    }
    applyAdminNav();
    try {
      renderAll();
    } catch (err) {
      console.error("renderAll", err);
    }
  }

  async function loadUsers() {
    try {
      const res = await api("/users");
      portalUsers = Array.isArray(res.users) ? res.users.filter((u) => u.is_active !== false) : [];
      data.members = usersAsMembers(portalUsers);
    } catch (err) {
      console.warn("users", err);
      if (currentUser) {
        portalUsers = [currentUser];
        data.members = usersAsMembers(portalUsers);
      }
    }
  }

  async function handleLogin(e) {
    if (e) e.preventDefault();
    const email = (document.getElementById("login-email")?.value || "").trim();
    const password = document.getElementById("login-password")?.value || "";
    const err = document.getElementById("login-error");
    if (err) err.textContent = "";
    showBoot("Entrando…");
    try {
      const res = await api("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      currentUser = res.user;
      setSession(currentUser);
      try {
        const me = await api("/me");
        applyRolesMeta(me);
      } catch {
        fillUserRoleSelect();
      }
      await loadDataFromApi();
      await loadUsers();
      showApp(currentUser);
    } catch (ex) {
      showLogin((ex && ex.message) || "Não foi possível entrar");
    }
  }

  async function handleLogout() {
    try {
      await api("/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    apiReady = false;
    currentUser = null;
    setSession(null);
    showLogin("");
  }

  async function enterPortal() {
    showBoot("Abrindo o portal…");
    try {
      const me = await api("/me");
      applyRolesMeta(me);
      if (me && me.user) {
        currentUser = me.user;
        setSession(currentUser);
        await loadDataFromApi();
        await loadUsers();
        showApp(currentUser);
        return;
      }
    } catch (err) {
      fillUserRoleSelect();
      if (err && err.status && err.status !== 401) {
        console.warn("API /me", err);
      }
    }
    setSession(null);
    showLogin("");
  }

  /* ——— Views ——— */
  const VIEW_TITLES = {
    dashboard: "Início",
    foco: "Hoje",
    equipes: "Equipes",
    admin: "Usuários",
    iniciativas: "Campanhas",
    projetos: "Projetos",
    tarefas: "Tarefas",
    desenvolvimento: "GitHub",
    assistente: "Chat",
    financeiro: "Dinheiro",
    ideias: "Ideias",
    atividade: "Histórico",
  };

  function switchView(name) {
    const adminViews = new Set(["admin", "equipes", "iniciativas", "financeiro"]);
    if (adminViews.has(name) && !isAdmin()) {
      toast("Só o admin acessa esta área");
      name = "dashboard";
    }
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
    document.querySelectorAll(".side-nav button").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.view === name);
    });
    const title = document.getElementById("page-title");
    if (title) title.textContent = VIEW_TITLES[name] || name;
    closeMobileNav();
    if (name === "dashboard" || name === "financeiro") {
      requestAnimationFrame(() => buildCharts());
    }
  }

  function closeMobileNav() {
    document.getElementById("sidebar")?.classList.remove("is-open");
    const bd = document.getElementById("sidebar-backdrop");
    if (bd) {
      bd.classList.remove("is-open");
      bd.hidden = true;
    }
  }

  function openMobileNav() {
    document.getElementById("sidebar")?.classList.add("is-open");
    const bd = document.getElementById("sidebar-backdrop");
    if (bd) {
      bd.hidden = false;
      bd.classList.add("is-open");
    }
  }

  /* ——— Render ——— */
  function renderAll() {
    const steps = [
      renderKpis,
      renderOkrs,
      renderEvents,
      renderProjects,
      renderKanban,
      renderNotices,
      renderFinance,
      renderIdeas,
      renderChat,
      renderGithub,
      renderUsers,
      renderInitiatives,
      renderActivity,
      renderFocus,
      renderTeams,
      renderWorkload,
      fillInitiativeSelects,
      fillTaskSelects,
      buildCharts,
    ];
    steps.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn(fn.name || "render", err);
      }
    });
  }

  function memberName(id) {
    const m = (data.members || []).find((x) => x.id === id);
    return m ? m.name : "—";
  }

  function teamName(id) {
    const tm = (data.teams || []).find((x) => x.id === id);
    return tm ? tm.name : "—";
  }

  function fillTaskSelects() {
    const assignee = document.getElementById("task-assignee");
    const team = document.getElementById("task-team");
    if (assignee) {
      const cur = assignee.value;
      assignee.innerHTML =
        '<option value="">Sem responsável</option>' +
        (data.members || []).map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
      if (cur) assignee.value = cur;
    }
    if (team) {
      const cur = team.value;
      team.innerHTML =
        '<option value="">Sem equipe</option>' +
        (data.teams || []).map((tm) => `<option value="${tm.id}">${escapeHtml(tm.name)}</option>`).join("");
      if (cur) team.value = cur;
    }
    const teamLead = document.getElementById("team-lead");
    if (teamLead) {
      teamLead.innerHTML =
        '<option value="">Sem líder</option>' +
        (data.members || []).map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
    }
    if (!isAdmin()) {
      const assignee = document.getElementById("task-assignee");
      if (assignee && currentUser) {
        assignee.innerHTML = `<option value="${escapeHtml(myId())}">${escapeHtml(currentUser.name)}</option>`;
        assignee.value = myId();
      }
    }
    const teamArea = document.getElementById("team-area");
    if (teamArea) {
      const cur = teamArea.value;
      teamArea.innerHTML = AREAS.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join("");
      if (cur) teamArea.value = cur;
    }
  }

  function renderFocus() {
    const box = document.getElementById("focus-list");
    const summary = document.getElementById("focus-summary");
    const nextBox = document.getElementById("focus-next");
    if (!box || !window.CybhorTeamOps) return;
    const ops = window.CybhorTeamOps;
    const queue = ops.focusQueue(data.tasks, today(), 10);
    const pointsAtStake = queue.reduce((s, t) => s + ops.taskPointsValue(t), 0);
    const overdue = queue.filter((t) => t._days !== null && t._days < 0).length;
    if (summary) {
      summary.innerHTML = `
        <span><strong>${queue.length}</strong> para fazer</span>
        <span><strong>${pointsAtStake} pts</strong> em jogo</span>
        <span class="${overdue ? "delta down" : ""}"><strong>${overdue}</strong> atrasada(s)</span>`;
    }
    const next = ops.suggestNext(data.tasks, today());
    if (nextBox) {
      nextBox.innerHTML = next
        ? `<div class="focus-next-card">
            <div class="meta">Comece por esta</div>
            <strong>${escapeHtml(next.title)}</strong>
            <div class="meta">${escapeHtml(memberName(next.assigneeId))} · ${ops.formatDueLabel(next._days)} · vale ${ops.taskPointsValue(next)} pts</div>
            <button class="btn btn-sm btn-accent" type="button" data-complete-task="${next.id}" style="margin-top:8px">Concluir</button>
          </div>`
        : '<div class="list-empty">Nenhuma tarefa aberta.</div>';
    }
    if (!queue.length) {
      box.innerHTML = '<div class="list-empty">Sem tarefas abertas.</div>';
      return;
    }
    box.innerHTML = queue
      .map((t) => {
        const dueClass = t._days !== null && t._days < 0 ? "due-late" : t._days === 0 ? "due-today" : "";
        return `<div class="focus-row ${dueClass}">
          <div>
            <strong>${escapeHtml(t.title)}</strong>
            <div class="meta">${escapeHtml(memberName(t.assigneeId))} · ${escapeHtml(teamName(t.teamId))} · ${escapeHtml(t.priority)}</div>
          </div>
          <div class="focus-meta">
            <span class="badge ${t._days !== null && t._days < 0 ? "badge-wait" : "badge-progress"}">${ops.formatDueLabel(t._days)}</span>
            <span class="meta">${ops.taskPointsValue(t)} pts</span>
            <button class="btn btn-sm" type="button" data-complete-task="${t.id}">Concluir</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function renderWorkload() {
    if (!window.CybhorTeamOps) return;
    const rows = window.CybhorTeamOps.scoreboard(data.tasks, data.commits, data.members);
    const top = Math.max(1, ...rows.map((r) => r.week));
    const html = !rows.length
      ? '<div class="list-empty">Cadastre pessoas para ver o ranking.</div>'
      : rows
          .map((r, i) => `<div class="workload-row">
          <div class="workload-head">
            <span class="rank-pos">${i + 1}º</span>
            <strong>${escapeHtml(r.member.name)}</strong>
            <span class="meta">${r.doneCount} feita(s) · ${r.commitCount} commit(s) · total ${r.total} pts</span>
            <span class="badge badge-done">${r.week} pts</span>
          </div>
          <div class="bar-track"><div class="bar-fill green" style="width:${Math.round((r.week / top) * 100)}%"></div></div>
        </div>`)
          .join("");
    const box = document.getElementById("workload-list");
    const dup = document.getElementById("workload-list-dup");
    if (box) box.innerHTML = html;
    if (dup) dup.innerHTML = html;
  }

  function renderTeams() {
    const box = document.getElementById("teams-list");
    const people = document.getElementById("members-list");
    if (!box) return;
    if (!window.CybhorTeamOps) return;
    if (!(data.teams || []).length) {
      box.innerHTML = '<div class="list-empty">Nenhuma equipe ainda.</div>';
    } else {
      box.innerHTML = data.teams
        .map((team) => {
          const st = window.CybhorTeamOps.teamStats(team, data.members, data.tasks, data.commits);
          const lead = memberName(team.leadId);
          const area = AREAS.find((a) => a.id === team.area);
          return `<article class="panel team-card">
            <div class="panel-head">
              <div>
                <h2>${escapeHtml(team.name)}</h2>
                <p class="meta" style="margin:4px 0 0">${escapeHtml(area ? area.label : team.area)} · Líder: ${escapeHtml(lead)}</p>
              </div>
              <button class="btn btn-sm btn-danger" type="button" data-del-team="${team.id}">Excluir</button>
            </div>
            <div class="kpi-row" style="grid-template-columns:repeat(3,1fr);margin:0">
              <div><div class="meta">Pessoas</div><strong>${st.people.length}</strong></div>
              <div><div class="meta">Feitas</div><strong>${st.doneCount}</strong></div>
              <div><div class="meta">Pontos (7 dias)</div><strong>${st.weekPoints}</strong></div>
            </div>
            <div class="meta" style="margin-top:10px">${st.people.map((m) => escapeHtml(m.name)).join(" · ") || "Sem membros"}</div>
          </article>`;
        })
        .join("");
    }
    if (people) {
      if (!(data.members || []).length) {
        people.innerHTML = '<div class="list-empty">Nenhum membro.</div>';
      } else {
        people.innerHTML = data.members
          .map(
            (m) => `<div class="row-item">
              <div>
                <strong>${escapeHtml(m.name)}</strong>
                <div class="meta">${escapeHtml(m.role)} · ${escapeHtml(teamName(m.teamId))}${m.githubLogin ? ` · GitHub @${escapeHtml(m.githubLogin)}` : ""}</div>
              </div>
              <button class="btn btn-sm btn-danger" type="button" data-del-member="${m.id}">Excluir</button>
            </div>`
          )
          .join("");
      }
    }
  }

  function buildActivityFeed() {
    const items = [];
    (data.commits || []).forEach((c) => {
      if (c.source === "github") return;
      items.push({
        at: c.at,
        text: `Commit em ${c.projectName}: ${c.message} (+${c.delta}%)`,
      });
    });
    (data.githubReports || []).forEach((r) => {
      const commits = r.stats && r.stats.commits ? r.stats.commits : 0;
      items.push({
        at: r.at,
        text: `Resumo GitHub de ${memberName(r.memberId)} (@${r.login}): ${commits} commit(s) público(s)`,
      });
    });
    (data.chatLog || [])
      .filter((m) => m.role === "user")
      .slice(-30)
      .forEach((m) => {
        items.push({ at: m.at, text: `Update: ${m.text}` });
      });
    (data.initiatives || []).forEach((i) => {
      items.push({ at: Date.now() - 86400000, text: `Iniciativa ativa: ${i.name}` });
    });
    return items.sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  function renderActivity() {
    const feed = buildActivityFeed();
    const html = feed.length
      ? feed
          .map((a) => {
            const time = new Date(a.at || Date.now()).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            return `<div class="activity-item"><time>${time}</time><div>${escapeHtml(a.text)}</div></div>`;
          })
          .join("")
      : '<div class="list-empty">Sem atividade ainda.</div>';
    const preview = document.getElementById("activity-preview");
    const full = document.getElementById("activity-full");
    if (preview) {
      preview.innerHTML = feed.length
        ? feed
            .slice(0, 5)
            .map((a) => {
              const time = new Date(a.at || Date.now()).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return `<div class="activity-item"><time>${time}</time><div>${escapeHtml(a.text)}</div></div>`;
            })
            .join("")
        : '<div class="list-empty">Sem atividade.</div>';
    }
    if (full) full.innerHTML = html;
  }

  function areaLabel(id) {
    const found = AREAS.find((a) => a.id === id);
    return found ? found.label : id;
  }

  function initiativeProgress(initiative) {
    const linked = (initiative.projectIds || [])
      .map((id) => data.projects.find((p) => p.id === id))
      .filter(Boolean);
    if (!linked.length) return 0;
    return Math.round(linked.reduce((s, p) => s + Number(p.progress || 0), 0) / linked.length);
  }

  function fillInitiativeSelects() {
    const projectInit = document.getElementById("project-initiative");
    if (projectInit) {
      const cur = projectInit.value;
      projectInit.innerHTML =
        '<option value="">Nenhuma</option>' +
        (data.initiatives || [])
          .map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`)
          .join("");
      if (cur) projectInit.value = cur;
    }

    const linkBox = document.getElementById("initiative-projects");
    if (linkBox) {
      linkBox.innerHTML = data.projects
        .map(
          (p) => `
        <label class="check-row">
          <input type="checkbox" name="init-project" value="${p.id}">
          <span>${escapeHtml(p.name)} <em class="meta">(${p.progress}%)</em></span>
        </label>`
        )
        .join("") || '<p class="meta">Crie projetos antes para vinculá-los.</p>';
    }

    const areasBox = document.getElementById("initiative-areas");
    if (areasBox) {
      areasBox.innerHTML = AREAS.map(
        (a) => `
        <label class="check-row">
          <input type="checkbox" name="init-area" value="${a.id}">
          <span>${escapeHtml(a.label)}</span>
        </label>`
      ).join("");
    }
  }

  function renderInitiatives() {
    const box = document.getElementById("initiatives-list");
    if (!box) return;
    if (!Array.isArray(data.initiatives)) data.initiatives = [];
    if (!data.initiatives.length) {
      box.innerHTML = '<div class="list-empty">Nenhuma iniciativa ainda. Crie uma campanha/programa que una várias áreas.</div>';
      return;
    }

    box.innerHTML = data.initiatives
      .map((init) => {
        const pct = initiativeProgress(init);
        const projects = (init.projectIds || [])
          .map((id) => data.projects.find((p) => p.id === id))
          .filter(Boolean);
        const areas = (init.areas || []).map(areaLabel);
        return `
        <article class="initiative-card panel">
          <div class="panel-head">
            <div>
              <h2>${escapeHtml(init.name)}</h2>
              <p class="meta" style="margin:4px 0 0">${escapeHtml(init.description || "")}</p>
            </div>
            <div style="text-align:right">
              <div class="value" style="font-size:1.35rem;font-weight:650">${pct}%</div>
              <span class="badge ${statusBadge(init.status)}">${statusLabel(init.status)}</span>
            </div>
          </div>
          <div class="area-chips">
            ${areas.map((a) => `<span class="area-chip">${escapeHtml(a)}</span>`).join("") || '<span class="meta">Sem áreas</span>'}
          </div>
          <div class="initiative-projects">
            <div class="meta" style="margin-bottom:6px">Projetos vinculados · responsável ${escapeHtml(init.owner || "—")}</div>
            ${
              projects.length
                ? `<ul class="init-project-list">${projects
                    .map(
                      (p) =>
                        `<li><strong>${escapeHtml(p.name)}</strong> <span class="meta">${p.progress}%</span> <span class="badge ${statusBadge(p.status)}">${statusLabel(p.status)}</span></li>`
                    )
                    .join("")}</ul>`
                : '<p class="meta">Nenhum projeto vinculado.</p>'
            }
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-danger" type="button" data-del-initiative="${init.id}">Excluir iniciativa</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function safeGithubUrl(url) {
    try {
      const parsed = new URL(String(url || ""));
      if (parsed.protocol === "https:" && parsed.hostname === "github.com") return parsed.href;
    } catch {
      /* URL inválida */
    }
    return "";
  }

  function myGithubLogin() {
    return (currentUser && currentUser.github_login) || null;
  }

  function syncGithubForm() {
    const loginField = document.getElementById("github-login-field");
    const loginInput = document.getElementById("github-login");
    const note = document.getElementById("github-linked-note");
    const submit = document.getElementById("github-submit");
    const unlink = document.getElementById("github-unlink");
    const linked = Boolean(myGithubLogin());
    if (loginField) loginField.hidden = linked;
    if (loginInput) {
      loginInput.required = !linked;
      if (!linked && roleNeedsGithub(currentUser && currentUser.role)) {
        loginInput.placeholder = "@obrigatório para o seu papel";
      }
    }
    if (note) {
      note.hidden = !linked;
      note.textContent = linked
        ? `Sua conta: @${myGithubLogin()}. Atualizar só relê o GitHub.`
        : roleNeedsGithub(currentUser && currentUser.role)
          ? "No seu papel o GitHub é obrigatório."
          : "";
    }
    if (submit) submit.textContent = linked ? "Atualizar resumo" : "Vincular GitHub";
    if (unlink) {
      unlink.hidden = !linked || roleNeedsGithub(currentUser && currentUser.role);
    }
    renderGithubSummary();
  }

  function renderGithubSummary() {
    const box = document.getElementById("github-summary");
    if (!box) return;
    const report = (data.githubReports || []).find((r) => r.memberId === myId());
    if (!report) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    const when = new Date(report.at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const url = safeGithubUrl(report.url);
    box.classList.remove("hidden");
    box.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:1rem">Resumo de @${escapeHtml(report.login)}</h3>
      <p style="margin:0 0 10px">${escapeHtml(report.text)}</p>
      ${
        report.bullets && report.bullets.length
          ? `<ul class="chat-help-list">${report.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
          : ""
      }
      <p class="meta" style="margin:10px 0 0">${when}${url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">abrir no GitHub</a>` : ""}</p>
    `;
  }

  function visibleGithubReports() {
    const reports = Array.isArray(data.githubReports) ? data.githubReports : [];
    if (isAdmin()) return reports;
    return reports.filter((r) => r.memberId === myId());
  }

  function renderGithub() {
    syncGithubForm();
    const box = document.getElementById("github-reports");
    const count = document.getElementById("github-report-count");
    const reports = visibleGithubReports();
    if (count) count.textContent = String(reports.length);
    if (!box) return;
    if (!reports.length) {
      box.innerHTML = '<div class="list-empty">Nenhum resumo ainda. Vincule o GitHub ao lado.</div>';
      return;
    }
    box.innerHTML = reports
      .slice()
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .map((r) => {
        const when = new Date(r.at).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        const commits = r.stats && r.stats.commits ? r.stats.commits : 0;
        return `<div class="row-item">
          <div>
            <strong>${escapeHtml(memberName(r.memberId) || "Você")}</strong>
            <div class="meta">@${escapeHtml(r.login)} · ${commits} commit(s) · ${when}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  function absorbGithubCommits(memberId, commits) {
    if (!Array.isArray(data.commits)) data.commits = [];
    const known = new Set(data.commits.map((c) => c.hash).filter(Boolean));
    const weekAgo = Date.now() - 7 * 86400000;
    let added = 0;
    (commits || []).forEach((c) => {
      if (added >= 8) return;
      if (!c || !c.sha || known.has(c.sha)) return;
      const at = Date.parse(c.at);
      if (!Number.isFinite(at) || at < weekAgo) return;
      known.add(c.sha);
      data.commits.unshift({
        id: uid(),
        projectId: null,
        projectName: c.repo || "GitHub",
        message: c.message || "Commit",
        hash: c.sha,
        authorId: memberId,
        delta: 0,
        source: "github",
        at,
      });
      added += 1;
    });
    return added;
  }

  async function handleGithubLink(e) {
    e.preventDefault();
    if (!currentUser) {
      toast("Faça login");
      return;
    }
    const linked = Boolean(myGithubLogin());
    const login = linked ? myGithubLogin() : (document.getElementById("github-login")?.value || "").trim();
    const status = document.getElementById("github-status");
    const submit = document.getElementById("github-submit");
    if (status) status.textContent = "Conferindo no GitHub…";
    if (submit) submit.disabled = true;
    try {
      const res = await api("/me/github", {
        method: "POST",
        body: JSON.stringify({ login }),
      });
      currentUser = res.user || currentUser;
      setSession(currentUser);
      await loadUsers();
      const summaryWrap = res.summary || {};
      const summary = summaryWrap.summary || {};
      const profile = summaryWrap.profile || {};
      const report = {
        memberId: myId(),
        login: currentUser.github_login || profile.login || login,
        text: summary.text || "",
        bullets: Array.isArray(summary.bullets) ? summary.bullets : [],
        stats: summaryWrap.stats || { commits: 0, repos: 0, pulls: 0 },
        url: safeGithubUrl(profile.html_url) || `https://github.com/${currentUser.github_login}`,
        at: Date.now(),
      };
      if (!Array.isArray(data.githubReports)) data.githubReports = [];
      data.githubReports = data.githubReports.filter((r) => r.memberId !== myId());
      data.githubReports.unshift(report);
      const novos = absorbGithubCommits(myId(), summaryWrap.commits || []);
      const input = document.getElementById("github-login");
      if (input) input.value = "";
      saveData();
      renderAll();
      if (status) status.textContent = "";
      const pts = novos * (window.CybhorTeamOps ? window.CybhorTeamOps.COMMIT_BASE_POINTS : 5);
      toast(linked ? "Resumo atualizado" : `GitHub vinculado${pts ? " · +" + pts + " pts" : ""}`);
    } catch (err) {
      const msg = (err && err.message) || "Não foi possível consultar o GitHub";
      if (status) status.textContent = msg;
      toast(msg);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function unlinkGithub() {
    if (!myGithubLogin()) return;
    if (roleNeedsGithub(currentUser && currentUser.role)) {
      toast("No seu papel o GitHub é obrigatório");
      return;
    }
    const login = myGithubLogin();
    if (!confirm(`Desvincular @${login}?`)) return;
    try {
      const res = await api("/me/github", { method: "DELETE" });
      currentUser = res.user || currentUser;
      setSession(currentUser);
      await loadUsers();
      data.githubReports = (data.githubReports || []).filter((r) => r.memberId !== myId());
      data.commits = (data.commits || []).filter((c) => !(c.source === "github" && c.authorId === myId()));
      saveData();
      renderAll();
      toast(`GitHub @${login} desvinculado`);
    } catch (err) {
      toast((err && err.message) || "Não foi possível desvincular");
    }
  }

  function syncUserGithubRequirement() {
    const role = document.getElementById("new-user-role")?.value;
    const field = document.getElementById("user-github-field");
    const input = document.getElementById("user-github");
    const hint = document.getElementById("user-github-hint");
    const need = roleNeedsGithub(role);
    if (field) field.hidden = false;
    if (input) input.required = need;
    if (hint) {
      hint.textContent = need
        ? "Obrigatório para este papel (Dev / Programação / DevOps / ETEC)."
        : "Opcional neste papel — pode deixar em branco.";
    }
  }

  function renderUsers() {
    const box = document.getElementById("users-list");
    const count = document.getElementById("users-count");
    if (!box) return;
    if (!isAdmin()) {
      box.innerHTML = '<div class="list-empty">Só o admin gerencia contas.</div>';
      if (count) count.textContent = "0";
      return;
    }
    if (count) count.textContent = String(portalUsers.length);
    if (!portalUsers.length) {
      box.innerHTML = '<div class="list-empty">Nenhuma conta ainda.</div>';
      return;
    }
    box.innerHTML = portalUsers
      .map((u) => {
        const gh = u.github_login ? `@${u.github_login}` : "sem GitHub";
        const active = u.is_active === false ? "inativo" : "ativo";
        return `<div class="row-item">
          <div>
            <strong>${escapeHtml(u.name)}</strong>
            <div class="meta">${escapeHtml(u.email)} · ${escapeHtml(u.role)} · ${escapeHtml(gh)} · ${active}</div>
          </div>
          ${
            String(u.id) === myId()
              ? '<span class="meta">você</span>'
              : `<button class="btn btn-sm btn-danger" type="button" data-del-user="${u.id}">Desativar</button>`
          }
        </div>`;
      })
      .join("");
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    if (!isAdmin()) return;
    const name = document.getElementById("user-name")?.value.trim();
    const email = document.getElementById("user-email")?.value.trim();
    const password = document.getElementById("user-password")?.value || "";
    const role = document.getElementById("new-user-role")?.value;
    const github = document.getElementById("user-github")?.value.trim() || "";
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role, github_login: github }),
      });
      await loadUsers();
      closeModals();
      e.target.reset();
      renderAll();
      toast("Usuário criado");
    } catch (err) {
      toast((err && err.message) || "Não foi possível criar");
    }
  }

  function renderChat() {
    const box = document.getElementById("chat-messages");
    if (!box) return;
    if (!Array.isArray(data.chatLog)) data.chatLog = [];
    box.innerHTML = data.chatLog
      .map((m) => {
        const cls = m.role === "user" ? "chat-bubble user" : "chat-bubble bot";
        const time = new Date(m.at || Date.now()).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<div class="${cls}"><div class="chat-text">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div><div class="chat-time">${time}</div></div>`;
      })
      .join("");
    box.scrollTop = box.scrollHeight;

    const live = document.getElementById("chat-live-okrs");
    if (live) {
      live.innerHTML = `
        <span>OKR geral <strong>${data.okrs.overall}%</strong></span>
        <span>Entrega <strong>${data.okrs.delivery}%</strong></span>
        <span>Projetos abertos <strong>${data.projects.filter((p) => p.status !== "done").length}</strong></span>
        <span>Tarefas feitas <strong>${data.tasks.filter((t) => t.column === "done").length}/${data.tasks.length}</strong></span>`;
    }
  }

  function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = (input.value || "").trim();
    if (!text) return;

    data.chatLog.push({ id: uid(), role: "user", text, at: Date.now(), userId: myId() });
    input.value = "";
    renderChat();

    // % manual ou diff → bloqueia mentira; só commit analisa %
    const looksLikeDiff = /diff --git|^\+\+\+\s/m.test(text) || (text.match(/^\+/gm) || []).length > 5;
    const asksPercent = /\d{1,3}\s*%/.test(text);
    if (looksLikeDiff || asksPercent) {
      data.chatLog.push({
        id: uid(),
        role: "bot",
        text: "Não dá para informar % manualmente. O resumo de código sai do GitHub vinculado, no menu GitHub.",
        at: Date.now(),
      });
      saveData();
      renderChat();
      switchView("desenvolvimento");
      toast("Resumo só via GitHub");
      return;
    }

    const analyzer = window.CybhorProgressChat;
    if (!analyzer) {
      data.chatLog.push({
        id: uid(),
        role: "bot",
        text: "Motor de análise não carregou. Recarregue a página.",
        at: Date.now(),
      });
      saveData();
      renderChat();
      return;
    }

    // Pequeno delay para parecer análise
    const typing = document.getElementById("chat-typing");
    if (typing) typing.classList.remove("hidden");

    setTimeout(() => {
      const result = analyzer.analyze(text, {
        projects: data.projects,
        tasks: data.tasks,
        okrs: data.okrs,
      });
      analyzer.applyActions(data, result.actions || []);
      data.chatLog.push({ id: uid(), role: "bot", text: result.reply, at: Date.now() });
      saveData();
      renderAll();
      if (typing) typing.classList.add("hidden");
      toast("Progresso atualizado pelo chat");
    }, 450);
  }

  function renderKpis() {
    const activeTasks = data.tasks.filter((t) => t.column !== "done").length;
    const done = data.tasks.filter((t) => t.column === "done").length;
    const total = data.tasks.length || 1;
    const rate = Math.round((done / total) * 100);
    const openProjects = data.projects.filter((p) => p.status !== "done").length;
    const balance = data.finance.reduce((acc, f) => acc + (f.type === "in" ? f.amount : -f.amount), 0);

    document.getElementById("kpi-tasks").textContent = String(activeTasks);
    document.getElementById("kpi-rate").textContent = rate + "%";
    document.getElementById("kpi-projects").textContent = String(openProjects);
    document.getElementById("kpi-balance").textContent = money(balance);
  }

  function renderOkrs() {
    const o = data.okrs;
    const ring = document.getElementById("okr-ring");
    ring.style.setProperty("--pct", o.overall);
    document.getElementById("okr-overall").textContent = o.overall + "%";
    document.getElementById("okr-client-val").textContent = o.client + "%";
    document.getElementById("okr-client-bar").style.width = o.client + "%";
    document.getElementById("okr-delivery-val").textContent = o.delivery + "%";
    document.getElementById("okr-delivery-bar").style.width = o.delivery + "%";
    document.getElementById("okr-finance-val").textContent = o.finance + "%";
    document.getElementById("okr-finance-bar").style.width = o.finance + "%";
  }

  function renderEvents() {
    const box = document.getElementById("events-list");
    if (!data.events.length) {
      box.innerHTML = '<div class="list-empty">Nenhum compromisso. Adicione na agenda.</div>';
      return;
    }
    box.innerHTML = data.events
      .map(
        (ev) => `
      <article class="event">
        <time>${escapeHtml(ev.time)}</time>
        <div><strong>${escapeHtml(ev.title)}</strong><span>${escapeHtml(ev.detail || "")}</span></div>
        <button class="btn btn-sm btn-danger" type="button" data-del-event="${ev.id}">Excluir</button>
      </article>`
      )
      .join("");
  }

  function projectRowsHtml() {
    if (!data.projects.length) {
      return '<tr><td colspan="6"><div class="list-empty">Nenhum projeto ainda.</div></td></tr>';
    }
    return data.projects
      .map((p) => {
        const init = (data.initiatives || []).find((i) => i.id === p.initiativeId);
        return `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${init ? escapeHtml(init.name) : '<span class="meta">—</span>'}</td>
        <td><span class="mini-progress"><i style="width:${clamp(p.progress, 0, 100)}%;${p.status === "done" ? "background:var(--ok)" : ""}"></i></span>${p.progress}%</td>
        <td>${escapeHtml(p.owner)}</td>
        <td><span class="badge ${statusBadge(p.status)}">${statusLabel(p.status)}</span></td>
        <td><button class="btn btn-sm btn-danger" type="button" data-del-project="${p.id}">Excluir</button></td>
      </tr>`;
      })
      .join("");
  }

  function renderProjects() {
    const html = projectRowsHtml();
    const body = document.getElementById("projects-body");
    if (body) body.innerHTML = html;
    const dup = document.getElementById("projects-body-dup");
    if (dup) dup.innerHTML = html;
  }

  function taskCardHtml(t) {
    const due = t.dueDate ? ` · ${t.dueDate}` : "";
    return `
      <div class="task" draggable="true" data-task-id="${t.id}">
        <strong>${escapeHtml(t.title)}</strong>
        <div class="meta" style="margin-bottom:6px">${escapeHtml(memberName(t.assigneeId))} · ${taskPointsLabel(t)}${due}</div>
        <div class="task-foot">
          <span class="prio">${escapeHtml(t.priority || "Normal")}</span>
          <div style="display:flex;gap:4px">
            ${t.column !== "done" ? `<button class="btn btn-sm" type="button" data-complete-task="${t.id}">OK</button>` : ""}
            <button class="btn btn-sm btn-danger" type="button" data-del-task="${t.id}">Excluir</button>
          </div>
        </div>
      </div>`;
  }

  function renderKanban() {
    ["todo", "doing", "done"].forEach((col) => {
      const items = data.tasks.filter((t) => t.column === col);
      const html = items.map(taskCardHtml).join("");
      const count = document.getElementById("count-" + col);
      if (count) count.textContent = String(items.length);
      const list = document.getElementById("kanban-" + col);
      if (list) list.innerHTML = html;
      const dup = document.getElementById("kanban-" + col + "-dup");
      if (dup) dup.innerHTML = html;
    });
  }

  function renderNotices() {
    const box = document.getElementById("notices-list");
    if (!box) return;
    if (!data.notices.length) {
      box.innerHTML = '<div class="list-empty">Nenhum aviso no mural.</div>';
      return;
    }
    box.innerHTML = data.notices
      .map(
        (n) => `
      <article class="note ${n.tone === "orange" ? "orange" : "blue"}">
        <h4>${escapeHtml(n.title)}</h4>
        <p>${escapeHtml(n.body)}</p>
        <div style="margin-top:8px">
          <button class="btn btn-sm btn-danger" type="button" data-del-notice="${n.id}">Excluir</button>
        </div>
      </article>`
      )
      .join("");
  }

  function renderFinance() {
    const box = document.getElementById("finance-list");
    const balance = data.finance.reduce((acc, f) => acc + (f.type === "in" ? f.amount : -f.amount), 0);
    const balEl = document.getElementById("finance-balance");
    if (balEl) balEl.textContent = money(balance);
    if (!box) return;
    if (!data.finance.length) {
      box.innerHTML = '<div class="list-empty">Sem lançamentos.</div>';
      return;
    }
    box.innerHTML = data.finance
      .map(
        (f) => `
      <div class="row-item">
        <div>
          <strong>${escapeHtml(f.desc)}</strong>
          <div class="meta">${escapeHtml(f.date)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="${f.type === "in" ? "amount-in" : "amount-out"}">${f.type === "in" ? "+" : "-"}${money(f.amount)}</span>
          <button class="btn btn-sm btn-danger" type="button" data-del-finance="${f.id}">Excluir</button>
        </div>
      </div>`
      )
      .join("");
  }

  function renderIdeas() {
    const box = document.getElementById("ideas-list");
    if (!box) return;
    if (!data.ideas.length) {
      box.innerHTML = '<div class="list-empty">Nenhuma ideia ainda.</div>';
      return;
    }
    box.innerHTML = data.ideas
      .map(
        (idea) => `
      <div class="row-item">
        <strong>${escapeHtml(idea.title)}</strong>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" type="button" data-vote-idea="${idea.id}">▲ ${idea.votes}</button>
          <button class="btn btn-sm btn-danger" type="button" data-del-idea="${idea.id}">Excluir</button>
        </div>
      </div>`
      )
      .join("");
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, Number(n) || 0));
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ——— Charts ——— */
  function themeColors() {
    const s = getComputedStyle(document.documentElement);
    const bg = s.getPropertyValue("--bg").trim();
    const dark = isDarkHex(bg);
    return {
      accent: s.getPropertyValue("--accent").trim() || "#2f6fed",
      ok: s.getPropertyValue("--ok").trim() || "#1f9d6a",
      warn: s.getPropertyValue("--warn").trim() || "#e07a2f",
      muted: s.getPropertyValue("--muted").trim() || "#6b7585",
      grid: dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)",
    };
  }

  function isDarkHex(bg) {
    if (!bg.startsWith("#") || bg.length < 7) return false;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }

  function rgba(hex, a) {
    const h = hex.replace("#", "");
    if (h.length !== 6) return `rgba(47,111,237,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function buildCharts() {
    if (typeof Chart === "undefined") return;
    const { accent, ok, warn, muted, grid } = themeColors();
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out"];

    const perf = document.getElementById("chart-performance");
    if (perf) {
      if (charts.performance) charts.performance.destroy();
      charts.performance = new Chart(perf, {
        type: "line",
        data: {
          labels: months,
          datasets: [
            {
              label: "Produtividade",
              data: [62, 68, 65, 72, 70, 78, 81, 84, 86, 88],
              borderColor: accent,
              backgroundColor: rgba(accent, 0.12),
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              borderWidth: 2,
            },
            {
              label: "Metas",
              data: [55, 58, 60, 63, 67, 70, 72, 75, 78, 80],
              borderColor: ok,
              backgroundColor: rgba(ok, 0.1),
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: muted, font: { size: 11 } } },
            y: { min: 0, max: 100, grid: { color: grid }, ticks: { color: muted, font: { size: 11 } } },
          },
        },
      });
    }

    const fin = document.getElementById("chart-finance");
    if (fin) {
      if (charts.finance) charts.finance.destroy();
      const ins = data.finance.filter((f) => f.type === "in").reduce((a, f) => a + f.amount, 0);
      const outs = data.finance.filter((f) => f.type === "out").reduce((a, f) => a + f.amount, 0);
      charts.finance = new Chart(fin, {
        type: "bar",
        data: {
          labels: ["Receitas", "Despesas"],
          datasets: [
            {
              data: [ins, outs],
              backgroundColor: [accent, warn],
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: muted } },
            y: {
              grid: { color: grid },
              ticks: {
                color: muted,
                callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR"),
              },
            },
          },
        },
      });
    }
  }

  /* ——— Modals ——— */
  function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  }

  function closeModals() {
    document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.add("hidden"));
  }

  /* ——— Mutations ——— */
  function addTask(title, column, priority, assigneeId, teamId, dueDate) {
    const owner = isAdmin() ? assigneeId || myId() : myId();
    data.tasks.unshift({
      id: uid(),
      title,
      column,
      priority,
      assigneeId: owner || null,
      teamId: teamId || null,
      dueDate: dueDate || "",
      createdDone: column === "done",
      completedAt: column === "done" ? Date.now() : null,
    });
    saveData();
    renderAll();
    toast("Tarefa criada");
  }

  function taskPointsLabel(task) {
    const ops = window.CybhorTeamOps;
    if (!ops) return "";
    if (task.column === "done") {
      const pts = ops.pointsForTask(task);
      return pts ? `+${pts} pts` : "sem pontos";
    }
    return `vale ${ops.taskPointsValue(task)} pts`;
  }

  function markTaskDone(task) {
    if (task.column !== "done") task.completedAt = Date.now();
    task.column = "done";
  }

  function completeTask(id) {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return;
    markTaskDone(task);
    saveData();
    renderAll();
    const pts = window.CybhorTeamOps ? window.CybhorTeamOps.pointsForTask(task) : 0;
    toast(pts ? `${memberName(task.assigneeId)} ganhou +${pts} pts` : "Tarefa concluída (sem responsável, sem pontos)");
  }

  function addTeam(name, area, leadId) {
    data.teams.unshift({ id: uid(), name, area, leadId: leadId || null });
    saveData();
    renderAll();
    toast("Equipe criada");
  }

  function addMember(name, role, teamId) {
    data.members.unshift({
      id: uid(),
      name,
      role,
      teamId: teamId || null,
    });
    saveData();
    renderAll();
    toast("Membro adicionado");
  }

  function addProject(name, owner, status, initiativeId) {
    const id = uid();
    data.projects.unshift({
      id,
      name,
      owner,
      progress: 0, // % só sobe via commits — evita mentira manual
      status: status === "done" ? "progress" : status || "progress",
      initiativeId: initiativeId || null,
    });
    if (initiativeId) {
      const init = data.initiatives.find((i) => i.id === initiativeId);
      if (init) {
        init.projectIds = Array.from(new Set([...(init.projectIds || []), id]));
      }
    }
    saveData();
    renderAll();
    toast("Projeto criado em 0%");
  }

  function addInitiative(name, description, owner, areas, projectIds) {
    const id = uid();
    data.initiatives.unshift({
      id,
      name,
      description,
      owner,
      areas,
      projectIds,
      status: "progress",
    });
    projectIds.forEach((pid) => {
      const p = data.projects.find((x) => x.id === pid);
      if (p) p.initiativeId = id;
    });
    saveData();
    renderAll();
    toast("Iniciativa criada");
  }

  function addEvent(time, title, detail) {
    data.events.push({ id: uid(), time, title, detail });
    saveData();
    renderAll();
    toast("Compromisso adicionado");
  }

  function addNotice(title, body, tone) {
    data.notices.unshift({ id: uid(), title, body, tone });
    saveData();
    renderAll();
    toast("Aviso publicado");
  }

  function addFinance(type, desc, amount) {
    data.finance.unshift({ id: uid(), type, desc, amount: Number(amount), date: today() });
    saveData();
    renderAll();
    toast("Lançamento salvo");
  }

  function addIdea(title) {
    data.ideas.unshift({ id: uid(), title, votes: 0 });
    saveData();
    renderAll();
    toast("Ideia registrada");
  }

  function removeById(listKey, id, msg) {
    if (listKey === "initiatives") {
      data.projects.forEach((p) => {
        if (p.initiativeId === id) p.initiativeId = null;
      });
    }
    if (listKey === "projects") {
      data.initiatives.forEach((init) => {
        init.projectIds = (init.projectIds || []).filter((pid) => pid !== id);
      });
    }
    if (listKey === "teams") {
      data.members.forEach((m) => {
        if (m.teamId === id) m.teamId = null;
      });
      data.tasks.forEach((task) => {
        if (task.teamId === id) task.teamId = null;
      });
    }
    if (listKey === "members") {
      data.tasks.forEach((task) => {
        if (task.assigneeId === id) task.assigneeId = null;
      });
      data.teams.forEach((team) => {
        if (team.leadId === id) team.leadId = null;
      });
    }
    data[listKey] = data[listKey].filter((x) => x.id !== id);
    saveData();
    renderAll();
    toast(msg);
  }

  /* ——— Theme ——— */
  function applyTheme(theme, { charts = true } = {}) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cybhor_theme", theme);
    if (charts) {
      try {
        buildCharts();
      } catch (err) {
        console.warn("charts", err);
      }
    }
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "light" ? "dark" : "light");
  }

  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }

  /* ——— Events ——— */
  function wire() {
    on("login-form", "submit", handleLogin);
    on("btn-logout", "click", handleLogout);
    on("btn-theme", "click", toggleTheme);
    on("btn-reset", "click", () => {
      if (confirm("Zerar dados e restaurar o exemplo inicial?")) {
        data = defaultData();
        saveData();
        renderAll();
        toast("Dados restaurados");
      }
    });

    document.querySelectorAll(".side-nav button").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    document.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.getAttribute("data-go")));
    });

    document.getElementById("btn-menu")?.addEventListener("click", openMobileNav);
    document.getElementById("sidebar-backdrop")?.addEventListener("click", closeMobileNav);

    document.getElementById("btn-export")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cybhor-backup-v2.json";
      a.click();
      URL.revokeObjectURL(url);
      toast("Backup exportado");
    });

    const chatForm = document.getElementById("chat-form");
    if (chatForm) chatForm.addEventListener("submit", handleChatSubmit);

    const githubForm = document.getElementById("github-link-form");
    if (githubForm) githubForm.addEventListener("submit", handleGithubLink);
    document.getElementById("github-unlink")?.addEventListener("click", unlinkGithub);
    document.getElementById("new-user-role")?.addEventListener("change", syncUserGithubRequirement);
    on("btn-add-user", "click", () => {
      if (!isAdmin()) return;
      fillUserRoleSelect();
      syncUserGithubRequirement();
      openModal("modal-user");
    });
    on("form-user", "submit", handleCreateUser);

    document.querySelectorAll("[data-chat-example]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = document.getElementById("chat-input");
        input.value = btn.getAttribute("data-chat-example");
        input.focus();
      });
    });

    on("btn-add-task", "click", () => {
      fillTaskSelects();
      openModal("modal-task");
    });
    on("btn-add-project", "click", () => {
      fillInitiativeSelects();
      openModal("modal-project");
    });
    on("btn-add-initiative", "click", () => {
      fillInitiativeSelects();
      openModal("modal-initiative");
    });
    on("btn-add-event", "click", () => openModal("modal-event"));
    on("btn-add-notice", "click", () => openModal("modal-notice"));
    on("btn-add-finance", "click", () => openModal("modal-finance"));
    on("btn-add-idea", "click", () => openModal("modal-idea"));
    on("btn-add-team", "click", () => {
      fillTaskSelects();
      openModal("modal-team");
    });
    document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModals));
    document.querySelectorAll(".modal-backdrop").forEach((b) => {
      b.addEventListener("click", (e) => {
        if (e.target === b) closeModals();
      });
    });

    on("form-task", "submit", (e) => {
      e.preventDefault();
      addTask(
        document.getElementById("task-title").value.trim(),
        document.getElementById("task-column").value,
        document.getElementById("task-priority").value,
        document.getElementById("task-assignee").value,
        document.getElementById("task-team").value,
        document.getElementById("task-due").value
      );
      e.target.reset();
      closeModals();
    });

    on("form-team", "submit", (e) => {
      e.preventDefault();
      addTeam(
        document.getElementById("team-name").value.trim(),
        document.getElementById("team-area").value,
        document.getElementById("team-lead").value
      );
      e.target.reset();
      closeModals();
    });

    on("form-project", "submit", (e) => {
      e.preventDefault();
      addProject(
        document.getElementById("project-name").value.trim(),
        document.getElementById("project-owner").value.trim(),
        document.getElementById("project-status").value,
        document.getElementById("project-initiative").value
      );
      e.target.reset();
      const owner = document.getElementById("project-owner");
      if (owner) owner.value = "Gabriel Silva";
      closeModals();
    });

    on("form-initiative", "submit", (e) => {
      e.preventDefault();
      const areas = [...document.querySelectorAll('input[name="init-area"]:checked')].map((i) => i.value);
      const projectIds = [...document.querySelectorAll('input[name="init-project"]:checked')].map((i) => i.value);
      if (!areas.length) {
        toast("Selecione ao menos uma área");
        return;
      }
      addInitiative(
        document.getElementById("initiative-name").value.trim(),
        document.getElementById("initiative-desc").value.trim(),
        document.getElementById("initiative-owner").value.trim(),
        areas,
        projectIds
      );
      e.target.reset();
      const owner = document.getElementById("initiative-owner");
      if (owner) owner.value = "Gabriel Silva";
      closeModals();
    });

    on("form-event", "submit", (e) => {
      e.preventDefault();
      addEvent(
        document.getElementById("event-time").value,
        document.getElementById("event-title").value.trim(),
        document.getElementById("event-detail").value.trim()
      );
      e.target.reset();
      closeModals();
    });

    on("form-notice", "submit", (e) => {
      e.preventDefault();
      addNotice(
        document.getElementById("notice-title").value.trim(),
        document.getElementById("notice-body").value.trim(),
        document.getElementById("notice-tone").value
      );
      e.target.reset();
      closeModals();
    });

    on("form-finance", "submit", (e) => {
      e.preventDefault();
      addFinance(
        document.getElementById("finance-type").value,
        document.getElementById("finance-desc").value.trim(),
        document.getElementById("finance-amount").value
      );
      e.target.reset();
      closeModals();
    });

    on("form-idea", "submit", (e) => {
      e.preventDefault();
      addIdea(document.getElementById("idea-title").value.trim());
      e.target.reset();
      closeModals();
    });

    document.body.addEventListener("click", (e) => {
      const t = e.target.closest("[data-del-task],[data-del-project],[data-del-event],[data-del-notice],[data-del-finance],[data-del-idea],[data-del-initiative],[data-del-team],[data-del-user],[data-complete-task],[data-vote-idea]");
      if (!t) return;
      if (t.dataset.completeTask) {
        completeTask(t.dataset.completeTask);
        return;
      }
      if (t.dataset.delUser) {
        if (!isAdmin()) return;
        if (!confirm("Desativar esta conta?")) return;
        api("/users/" + t.dataset.delUser, { method: "DELETE" })
          .then(() => loadUsers())
          .then(() => {
            renderAll();
            toast("Conta desativada");
          })
          .catch((err) => toast((err && err.message) || "Falha ao desativar"));
        return;
      }
      if (t.dataset.delTask) removeById("tasks", t.dataset.delTask, "Tarefa removida");
      if (t.dataset.delProject) removeById("projects", t.dataset.delProject, "Projeto removido");
      if (t.dataset.delEvent) removeById("events", t.dataset.delEvent, "Compromisso removido");
      if (t.dataset.delNotice) removeById("notices", t.dataset.delNotice, "Aviso removido");
      if (t.dataset.delFinance) removeById("finance", t.dataset.delFinance, "Lançamento removido");
      if (t.dataset.delIdea) removeById("ideas", t.dataset.delIdea, "Ideia removida");
      if (t.dataset.delInitiative) removeById("initiatives", t.dataset.delInitiative, "Iniciativa removida");
      if (t.dataset.delTeam) removeById("teams", t.dataset.delTeam, "Equipe removida");
      if (t.dataset.voteIdea) {
        const idea = data.ideas.find((i) => i.id === t.dataset.voteIdea);
        if (idea) {
          idea.votes += 1;
          saveData();
          renderIdeas();
          toast("Voto registrado");
        }
      }
    });

    document.body.addEventListener("dragstart", (e) => {
      const task = e.target.closest(".task");
      if (!task) return;
      dragTaskId = task.dataset.taskId;
      e.dataTransfer.effectAllowed = "move";
    });

    document.querySelectorAll(".kanban-col").forEach((col) => {
      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        const column = col.dataset.column;
        const task = data.tasks.find((t) => t.id === dragTaskId);
        if (task && column) {
          if (column === "done") markTaskDone(task);
          else {
            task.column = column;
            task.completedAt = null;
          }
          saveData();
          renderAll();
          toast("Tarefa movida");
        }
        dragTaskId = null;
      });
    });

    on("global-search", "input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll("#projects-body tr").forEach((tr) => {
        tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
      });
      document.querySelectorAll(".task").forEach((task) => {
        task.style.display = !q || task.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const savedTheme = localStorage.getItem("cybhor_theme") || "light";
    applyTheme(savedTheme, { charts: false });

    try {
      wire();
    } catch (err) {
      console.error("wire", err);
    }

    try {
      await enterPortal();
    } catch (err) {
      console.error(err);
      showLogin("Não foi possível abrir o portal. Tente entrar de novo.");
    }

    try {
      if (currentUser) buildCharts();
    } catch (err) {
      console.warn("charts", err);
    }
  });
})();
