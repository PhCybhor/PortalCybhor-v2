/**
 * Automação de progresso via chat.
 * Analisa mensagens em português e devolve ações sobre tarefas/projetos/OKRs.
 */
(function (global) {
  // Padrões em texto sem acento (ver stripAccents)
  const DONE_RE =
    /(conclui|concluido|concluida|terminei|finalizei|finalizado|finalizada|pronto|pronta|feito|feita|completei|completou|entreguei|entregue|fechei|resolvi|100\s*%|ja\s+esta\s+pronto)/i;
  const DOING_RE =
    /(fazendo|em\s+andamento|trabalhando|comecei|iniciei|iniciando|quase|avancando|estou\s+em|segue|continuando|parcial|metade)/i;
  const WAIT_RE = /(travado|bloqueado|parado|aguardando|pendente|esperando)/i;
  const CREATE_RE = /(nova\s+tarefa|criar\s+tarefa|adicionei|comecei\s+a|vou\s+fazer|preciso\s+fazer)/i;

  function stripAccents(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function tokenize(s) {
    return stripAccents(s)
      .replace(/[^a-z0-9%\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  function scoreMatch(haystack, needle) {
    const h = stripAccents(haystack);
    const n = stripAccents(needle);
    if (!n) return 0;
    if (h.includes(n)) return 1;
    const parts = n.split(/\s+/).filter((p) => p.length > 2);
    if (!parts.length) return 0;
    const hits = parts.filter((p) => h.includes(p)).length;
    return hits / parts.length;
  }

  function bestMatch(list, text, getLabel) {
    let best = null;
    let bestScore = 0.45;
    list.forEach((item) => {
      const score = scoreMatch(text, getLabel(item));
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });
    return best ? { item: best, score: bestScore } : null;
  }

  function extractPercent(text) {
    const abs = text.match(/\b(\d{1,3})\s*%/);
    if (abs) {
      const n = Math.min(100, Math.max(0, parseInt(abs[1], 10)));
      return { mode: "set", value: n };
    }
    const delta = text.match(/\b(?:mais|avanc(?:ou|ar)|subi(?:u)?|aument(?:ou|ei)|ganhei)\s+(\d{1,3})\s*%?/i);
    if (delta) {
      return { mode: "add", value: Math.min(40, Math.max(1, parseInt(delta[1], 10))) };
    }
    return null;
  }

  function detectIntent(text) {
    const norm = stripAccents(text);
    if (DONE_RE.test(norm)) return "done";
    if (WAIT_RE.test(norm)) return "wait";
    if (DOING_RE.test(norm)) return "doing";
    if (extractPercent(text)) return "progress";
    if (CREATE_RE.test(norm)) return "create";
    return "note";
  }

  function guessTitleFromMessage(text) {
    const cleaned = text
      .replace(DONE_RE, " ")
      .replace(DOING_RE, " ")
      .replace(WAIT_RE, " ")
      .replace(CREATE_RE, " ")
      .replace(/\b(o|a|os|as|de|da|do|das|dos|no|na|em|para|com|hoje|agora|já|ja)\b/gi, " ")
      .replace(/\d{1,3}\s*%/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 3) return null;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  /**
   * @param {string} message
   * @param {{ projects: any[], tasks: any[], okrs: any }} ctx
   */
  function analyze(message, ctx) {
    const text = String(message || "").trim();
    const actions = [];
    const notes = [];

    if (!text) {
      return {
        reply: "Me conta o que você concluiu ou está fazendo. Ex.: “Concluí a API de notificações” ou “Estou fazendo o layout mobile”. A % de projeto só sobe por commit.",
        actions: [],
      };
    }

    // Bloqueia % digitada no chat (anti-fraude)
    if (extractPercent(text)) {
      return {
        reply: "Porcentagem não pode ser informada no chat. Use Desenvolvimento e cole o commit para o sistema calcular.",
        actions: [],
      };
    }

    const intent = detectIntent(text);
    const pct = null;
    const projectHit = bestMatch(ctx.projects || [], text, (p) => p.name);
    const taskHit = bestMatch(ctx.tasks || [], text, (t) => t.title);

    let bump = 0;
    if (intent === "done") bump = 8; // avanço leve só por status de tarefa — % forte vem do commit
    else if (intent === "doing") bump = 3;
    else if (intent === "progress") bump = 2;
    else if (intent === "wait") bump = 0;

    // Tarefa existente
    if (taskHit) {
      const task = taskHit.item;
      if (intent === "done" || (pct && pct.mode === "set" && pct.value >= 100)) {
        actions.push({ type: "move_task", taskId: task.id, column: "done" });
        notes.push(`Tarefa “${task.title}” → Concluído`);
        bump = bump == null ? 15 : Math.max(bump, 10);
      } else if (intent === "wait") {
        actions.push({ type: "move_task", taskId: task.id, column: "todo" });
        actions.push({ type: "set_task_priority", taskId: task.id, priority: "Bloqueada" });
        notes.push(`Tarefa “${task.title}” marcada como aguardando`);
      } else if (intent === "doing" || intent === "progress" || intent === "note") {
        actions.push({ type: "move_task", taskId: task.id, column: "doing" });
        notes.push(`Tarefa “${task.title}” → Em andamento`);
        if (!bump) bump = 4;
      }
    } else if (intent === "done" || intent === "doing" || intent === "create") {
      const title = guessTitleFromMessage(text);
      if (title && title.length >= 4) {
        const column = intent === "done" ? "done" : "doing";
        actions.push({
          type: "create_task",
          title,
          column,
          priority: "Média",
        });
        notes.push(`Nova tarefa “${title}” em ${column === "done" ? "Concluído" : "Em andamento"}`);
        if (!bump) bump = intent === "done" ? 10 : 5;
      }
    }

    // Projeto
    let targetProject = projectHit ? projectHit.item : null;
    if (!targetProject && (intent === "done" || intent === "doing" || pct || taskHit)) {
      const open = (ctx.projects || []).filter((p) => p.status !== "done");
      if (open.length === 1) targetProject = open[0];
      else if (open.length > 1 && (intent === "done" || taskHit)) {
        // Sem nome de projeto: empurra o que está em andamento com menor progresso
        targetProject = open
          .filter((p) => p.status === "progress")
          .sort((a, b) => a.progress - b.progress)[0] || open[0];
        notes.push(`Associei o update ao projeto “${targetProject.name}” (cite o nome para escolher outro)`);
      }
    }

    // Chat NÃO define % manual. Só ajusta status do projeto; avanço forte é via commit.
    if (targetProject) {
      let status = targetProject.status;
      let next = targetProject.progress;
      if (intent === "wait") {
        status = "wait";
        notes.push(`Projeto “${targetProject.name}” marcado como aguardando (sem alterar %)`);
      } else if (intent === "done" || intent === "doing" || intent === "progress") {
        status = "progress";
        notes.push(`Projeto “${targetProject.name}” segue em andamento — a % sobe só com commits em Desenvolvimento`);
      }
      actions.push({
        type: "update_project",
        projectId: targetProject.id,
        progress: next,
        status,
      });
    }

    // Sempre recalcula OKRs a partir dos projetos
    actions.push({ type: "recalc_okrs" });

    if (!notes.length && intent === "note") {
      return {
        reply:
          "Entendi a mensagem, mas não achei tarefa/projeto claro. Exemplos:\n• “Concluí Layout mobile do portal”\n• “Estou fazendo a API de notificações”\n\nPara % de projeto: aba Desenvolvimento + diff do commit.",
        actions: [],
      };
    }

    const reply =
      "Analisei seu update:\n• " +
      (notes.length ? notes.join("\n• ") : "Sem mudanças numéricas") +
      "\n\nOs indicadores (KPIs/OKRs) foram atualizados com base nisso.";

    return { reply, actions, intent, notes };
  }

  function applyActions(data, actions) {
    const log = [];
    actions.forEach((a) => {
      if (a.type === "move_task") {
        const t = data.tasks.find((x) => x.id === a.taskId);
        if (t) {
          if (a.column === "done" && t.column !== "done") t.completedAt = Date.now();
          if (a.column !== "done") t.completedAt = null;
          t.column = a.column;
          log.push(a);
        }
      }
      if (a.type === "set_task_priority") {
        const t = data.tasks.find((x) => x.id === a.taskId);
        if (t) t.priority = a.priority;
      }
      if (a.type === "create_task") {
        data.tasks.unshift({
          id: "id_" + Math.random().toString(36).slice(2, 10),
          title: a.title,
          column: a.column,
          priority: a.priority || "Média",
          createdDone: a.column === "done",
        });
        log.push(a);
      }
      if (a.type === "update_project") {
        const p = data.projects.find((x) => x.id === a.projectId);
        if (p) {
          p.progress = a.progress;
          p.status = a.status;
          log.push(a);
        }
      }
      if (a.type === "recalc_okrs") {
        const projects = data.projects || [];
        const avg =
          projects.length === 0
            ? data.okrs.delivery
            : Math.round(projects.reduce((s, p) => s + Number(p.progress || 0), 0) / projects.length);
        const doneTasks = (data.tasks || []).filter((t) => t.column === "done").length;
        const totalTasks = (data.tasks || []).length || 1;
        const taskRate = Math.round((doneTasks / totalTasks) * 100);
        data.okrs.delivery = Math.round(avg * 0.7 + taskRate * 0.3);
        data.okrs.overall = Math.round(
          data.okrs.delivery * 0.45 + data.okrs.client * 0.25 + data.okrs.finance * 0.3
        );
        // leve empurrão em satisfação quando entrega sobe
        if (data.okrs.delivery > 80) {
          data.okrs.client = Math.min(100, Math.max(data.okrs.client, data.okrs.delivery - 2));
        }
        log.push(a);
      }
    });
    return log;
  }

  global.CybhorProgressChat = { analyze, applyActions };
})(window);
