/**
 * Analisa mensagem + diff/código de commit e estima avanço de %.
 * Roda 100% no navegador (Hostinger estático).
 */
(function (global) {
  function stripAccents(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function parseDiff(raw) {
    const text = String(raw || "");
    const lines = text.split(/\r?\n/);
    const files = new Set();
    let added = 0;
    let removed = 0;
    let todoInAdd = 0;
    let wipSignals = 0;
    let testFiles = 0;
    let codeFiles = 0;

    lines.forEach((line) => {
      const diffGit = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (diffGit) {
        files.add(diffGit[2]);
        return;
      }
      const plusFile = line.match(/^\+\+\+ [ab]\/(.+)$/);
      if (plusFile && plusFile[1] !== "/dev/null") {
        files.add(plusFile[1]);
        return;
      }
      const plainFile = line.match(/^(?:Arquivo|File|path):\s*(.+)$/i);
      if (plainFile) {
        files.add(plainFile[1].trim());
        return;
      }

      if (line.startsWith("+") && !line.startsWith("+++")) {
        added += 1;
        if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line)) todoInAdd += 1;
        if (/\b(not implemented|coming soon|WIP|lorem ipsum)\b/i.test(line)) wipSignals += 1;
        if (/throw new Error\(\s*['"]not implemented/i.test(line)) wipSignals += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removed += 1;
      }
    });

    // Se não parece diff, trata o bloco como código novo
    if (files.size === 0 && text.trim()) {
      const codeLines = lines.filter((l) => l.trim()).length;
      added = Math.max(added, codeLines);
      files.add("(código colado)");
    }

    files.forEach((f) => {
      const low = f.toLowerCase();
      if (/\.(test|spec)\.|\/__tests__\/|\/tests?\//.test(low)) testFiles += 1;
      if (/\.(js|ts|tsx|jsx|py|go|java|php|rb|css|html|vue|svelte)$/.test(low)) codeFiles += 1;
    });

    return {
      files: [...files],
      fileCount: files.size,
      added,
      removed,
      todoInAdd,
      wipSignals,
      testFiles,
      codeFiles,
    };
  }

  function detectCommitType(message) {
    const m = stripAccents(message).trim();
    if (/^wip\b/.test(m) || /\bwip\b/.test(m)) return "wip";
    if (/^(feat|feature)(\(|:|\s)/.test(m) || /\b(nova feature|implementei|adicionei)\b/.test(m)) return "feat";
    if (/^(fix|bugfix)(\(|:|\s)/.test(m) || /\b(corrigi|bug|hotfix)\b/.test(m)) return "fix";
    if (/^(test|tests)(\(|:|\s)/.test(m) || /\b(teste|cobertura)\b/.test(m)) return "test";
    if (/^(refactor|refator)/.test(m)) return "refactor";
    if (/^(docs?|chore|style|ci|build)(\(|:|\s)/.test(m)) return "chore";
    return "other";
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * @returns {{
   *   delta: number,
   *   confidence: number,
   *   type: string,
   *   summary: string[],
   *   stats: object,
   *   incomplete: boolean
   * }}
   */
  function analyzeCommit({ message, diff, hash }) {
    const msg = String(message || "").trim();
    const stats = parseDiff(diff);
    const type = detectCommitType(msg || diff || "");
    const summary = [];

    let delta = 0;
    // Volume do diff
    delta += Math.min(10, stats.fileCount * 2);
    delta += Math.min(12, Math.floor(stats.added / 25));
    delta += Math.min(4, Math.floor(stats.removed / 40));

    const typeBonus = { feat: 8, fix: 5, test: 6, refactor: 4, chore: 2, other: 3, wip: 1 };
    delta += typeBonus[type] || 3;

    if (stats.testFiles > 0) {
      delta += 5;
      summary.push(`Inclui ${stats.testFiles} arquivo(s) de teste (+5%)`);
    }
    if (stats.codeFiles > 0) {
      summary.push(`${stats.codeFiles} arquivo(s) de código tocados`);
    }

    summary.push(`${stats.fileCount} arquivo(s) · +${stats.added}/−${stats.removed} linhas`);
    summary.push(`Tipo detectado: ${type.toUpperCase()}`);

    let incomplete = type === "wip" || stats.wipSignals > 0;
    if (stats.todoInAdd > 0) {
      delta -= Math.min(6, stats.todoInAdd * 2);
      summary.push(`${stats.todoInAdd} TODO/FIXME no código novo (−)`);
    }
    if (stats.wipSignals > 0) {
      delta -= 5;
      summary.push("Sinais de WIP / não implementado (−)");
    }
    if (type === "wip") {
      delta = Math.min(delta, 3);
      summary.push("Commit marcado como WIP — avanço limitado");
    }

    // Diff muito pequeno
    if (stats.added + stats.removed < 8 && stats.fileCount <= 1) {
      delta = Math.min(delta, 4);
      summary.push("Alteração pequena — impacto limitado");
    }

    // Diff robusto com testes
    if (stats.added > 80 && stats.testFiles > 0 && type === "feat") {
      delta += 3;
      summary.push("Feature substancial com testes (+)");
    }

    delta = clamp(Math.round(delta), 1, 22);

    let confidence = 55;
    if (msg) confidence += 15;
    if (stats.fileCount > 0 && (diff || "").includes("diff --git")) confidence += 20;
    else if (stats.added > 10) confidence += 10;
    if (incomplete) confidence -= 15;
    confidence = clamp(confidence, 25, 95);

    if (hash) summary.push(`Hash: ${String(hash).slice(0, 12)}`);

    return {
      delta,
      confidence,
      type,
      summary,
      stats,
      incomplete,
    };
  }

  function applyCommitToProject(project, analysis) {
    if (!project) return null;
    const before = Number(project.progress) || 0;
    let after = clamp(before + analysis.delta, 0, 100);
    let status = project.status;

    if (analysis.incomplete) {
      status = status === "done" ? "progress" : status === "wait" ? "progress" : "progress";
    } else if (after >= 100) {
      after = 100;
      status = "done";
    } else if (after > before) {
      status = "progress";
    }

    return { before, after, status, delta: after - before };
  }

  global.CybhorCommitAnalyzer = { analyzeCommit, applyCommitToProject, parseDiff, detectCommitType };
})(window);
