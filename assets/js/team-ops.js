/**
 * Organização de equipes por pontos de entrega (feitos), não por horas.
 */
(function (global) {
  const PRIORITY_SCORE = { Alta: 3, Média: 2, Media: 2, Baixa: 1, Bloqueada: 0 };

  /** Pontos por tarefa concluída, conforme a prioridade */
  const TASK_POINTS = { Alta: 30, Média: 20, Media: 20, Baixa: 10 };
  const ON_TIME_BONUS = 10;
  const COMMIT_BASE_POINTS = 5;
  const WEEK_MS = 7 * 86400000;

  function daysUntil(dueDate, todayStr) {
    if (!dueDate) return null;
    const a = new Date(todayStr + "T12:00:00");
    const b = new Date(dueDate + "T12:00:00");
    return Math.round((b - a) / 86400000);
  }

  function taskScore(task, todayStr) {
    let score = (PRIORITY_SCORE[task.priority] || 1) * 10;
    const d = daysUntil(task.dueDate, todayStr);
    if (d === null) score += 1;
    else if (d < 0) score += 40;
    else if (d === 0) score += 30;
    else if (d <= 2) score += 18;
    else if (d <= 7) score += 8;
    if (task.column === "doing") score += 5;
    if (task.column === "done") score = -100;
    return score;
  }

  function taskPointsValue(task) {
    return TASK_POINTS[task.priority] || TASK_POINTS.Média;
  }

  /**
   * Pontos que uma tarefa concluída rende.
   * Tarefas já criadas como concluídas não pontuam (evita lançar feito falso).
   */
  function pointsForTask(task) {
    if (task.column !== "done" || task.createdDone || !task.assigneeId) return 0;
    let pts = taskPointsValue(task);
    if (task.dueDate && task.completedAt) {
      const doneDay = new Date(task.completedAt).toISOString().slice(0, 10);
      if (doneDay <= task.dueDate) pts += ON_TIME_BONUS;
    }
    return pts;
  }

  function pointsForCommit(commit) {
    if (!commit.authorId) return 0;
    return COMMIT_BASE_POINTS + Math.max(0, Number(commit.delta) || 0);
  }

  function focusQueue(tasks, todayStr, limit) {
    return (tasks || [])
      .filter((t) => t.column !== "done")
      .map((t) => ({ ...t, _score: taskScore(t, todayStr), _days: daysUntil(t.dueDate, todayStr) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit || 12);
  }

  /** Ranking: pontos da semana (principal) e total */
  function scoreboard(tasks, commits, members, nowMs) {
    const now = nowMs || Date.now();
    const rows = (members || []).map((m) => ({
      member: m,
      week: 0,
      total: 0,
      doneCount: 0,
      commitCount: 0,
      openCount: 0,
    }));
    const byId = new Map(rows.map((r) => [r.member.id, r]));

    (tasks || []).forEach((t) => {
      const row = byId.get(t.assigneeId);
      if (!row) return;
      if (t.column !== "done") {
        row.openCount += 1;
        return;
      }
      const pts = pointsForTask(t);
      if (!pts) return;
      row.total += pts;
      row.doneCount += 1;
      if (t.completedAt && now - t.completedAt <= WEEK_MS) row.week += pts;
    });

    (commits || []).forEach((c) => {
      const row = byId.get(c.authorId);
      if (!row) return;
      const pts = pointsForCommit(c);
      row.total += pts;
      row.commitCount += 1;
      if (c.at && now - c.at <= WEEK_MS) row.week += pts;
    });

    return rows.sort((a, b) => b.week - a.week || b.total - a.total);
  }

  function teamStats(team, members, tasks, commits) {
    const people = (members || []).filter((m) => m.teamId === team.id);
    const board = scoreboard(tasks, commits, people);
    return {
      people,
      openCount: board.reduce((s, r) => s + r.openCount, 0),
      doneCount: board.reduce((s, r) => s + r.doneCount, 0),
      weekPoints: board.reduce((s, r) => s + r.week, 0),
      totalPoints: board.reduce((s, r) => s + r.total, 0),
    };
  }

  function suggestNext(tasks, todayStr) {
    const q = focusQueue(tasks, todayStr, 1);
    return q[0] || null;
  }

  function formatDueLabel(days) {
    if (days === null || days === undefined) return "Sem prazo";
    if (days < 0) return `${Math.abs(days)}d atrasada`;
    if (days === 0) return "Hoje";
    if (days === 1) return "Amanhã";
    return `Em ${days}d`;
  }

  global.CybhorTeamOps = {
    TASK_POINTS,
    ON_TIME_BONUS,
    COMMIT_BASE_POINTS,
    focusQueue,
    scoreboard,
    teamStats,
    suggestNext,
    formatDueLabel,
    daysUntil,
    taskScore,
    taskPointsValue,
    pointsForTask,
    pointsForCommit,
  };
})(window);
