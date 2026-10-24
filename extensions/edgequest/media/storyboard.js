// The Storyboard's page: draws the model the extension posts (storyboard.ts) and sends back what the modder
// does. Every change is made by the extension, in the story file; the model comes back redrawn.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  let model;
  let selected = (vscode.getState() || {}).selected;

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const post = (m) => vscode.postMessage(m);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
  const StatusWords = { none: "no take", made: "take made", stale: "changed since its take" };

  window.addEventListener("message", (e) => {
    if (e.data.type !== "model") return;
    model = e.data.model;
    if (!model.beats[selected]) selected = model.beatNames[0]?.name;
    render();
  });

  function render() {
    const keepY = window.scrollY;
    const focus = document.activeElement?.dataset?.field ? `${document.activeElement.dataset.line}|${document.activeElement.dataset.field}` : "";
    app.innerHTML = header() + board() + beatPage() + checklist();
    window.scrollTo(0, keepY);
    if (focus) app.querySelector(`[data-line="${CSS.escape(focus.split("|")[0])}"][data-field="${focus.split("|")[1]}"]`)?.focus();
  }

  function header() {
    const problems = model.problems.length
      ? `<div class="problems"><b>${plural(model.problems.length, "problem")} in the story file.</b> The board comes back once they are fixed in the YAML.<ul>${model.problems.map((p) => `<li>${p.line ? `<a data-yaml="${p.line}">line ${p.line}</a>, ` : ""}${esc(p.at)}: ${esc(p.message)}</li>`).join("")}</ul></div>`
      : "";
    const steps = model.usesSteps ? `<div class="banner">This story lists <code>steps:</code> from before beats. It still works; convert it to beats to edit it here. <button data-act="convert" class="small">Convert to beats</button></div>` : "";
    return `<header>
      <div class="kind">Storyboard</div>
      <h1>${esc(model.title)}</h1>
      <div class="muted">${model.id ? `<code>${esc(model.id)}</code>` : ""}${model.description ? ` · ${esc(model.description)}` : ""}</div>
      <div class="actions"><button class="primary" data-act="addBeat">+ Beat</button><button data-yaml="0">Open YAML</button></div>
    </header>${steps}${problems}`;
  }

  function board() {
    const b = model.board;
    if (!b) return "";
    const { cardW: W, cardH: H } = b;
    const paths = [], labels = [];
    const pairCount = {};
    for (const a of b.arrows) {
      const s = b.pos[a.from], t = b.pos[a.to];
      if (!s || !t) continue;
      const key = `${a.from}>${a.to}`;
      const k = (pairCount[key] = (pairCount[key] ?? -1) + 1);
      const cls = a.choice ? "arrow choice" : "arrow";
      let d, lx, ly;
      if (t.x > s.x) {
        const x1 = s.x + W, y1 = s.y + H / 2, x2 = t.x - 2, y2 = t.y + H / 2;
        const bend = Math.max(30, (x2 - x1) / 2);
        d = `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
        // The label sits where the arrow comes in, so labels into different cards never meet.
        lx = x2 - 8; ly = y2 - 8 - k * 14;
      } else {
        // Back, or within a column: around underneath.
        const x1 = s.x + W / 2, y1 = s.y + H, x2 = t.x + W / 2 + 12, y2 = t.y + H + 2;
        const drop = 40 + k * 12;
        d = `M${x1},${y1} C${x1},${y1 + drop} ${x2},${y2 + drop} ${x2},${y2}`;
        lx = (x1 + x2) / 2; ly = Math.max(y1, y2) + drop * 0.75;
      }
      paths.push(`<path class="${cls}" d="${d}" marker-end="url(#${a.choice ? "head-choice" : "head"})"/>`);
      if (a.choice) labels.push(`<text class="arrow-label" x="${lx}" y="${ly}" text-anchor="${t.x > s.x ? "end" : "middle"}">${esc(a.choice)}</text>`);
    }
    const first = model.beatNames[0]?.name;
    const start = first && b.pos[first] ? `<text class="start-label" x="${b.pos[first].x}" y="${b.pos[first].y - 8}">Start</text>` : "";
    const cards = b.cards.map((c) => {
      const p = b.pos[c.beat];
      const cls = ["card", c.beat === selected ? "selected" : "", c.ending ? (c.ending === "failed" ? "ending failed" : "ending") : "", c.unreached ? "unreached" : ""].join(" ");
      const meta = [
        c.scenes.length ? `<span>${plural(c.scenes.length, "scene")}</span>` : "",
        c.lines ? `<span>${plural(c.lines, "line")}</span>` : "",
        c.ending ? `<span class="badge ${c.ending === "failed" ? "fail" : "ok"}">${c.ending === "failed" ? "✗ quest fails" : "✓ quest succeeds"}</span>` : "",
        c.open ? `<span class="badge todo">${c.open} to do</span>` : "",
        c.unreached ? `<span class="badge">nothing leads here</span>` : "",
      ].filter(Boolean).join("");
      return `<div class="${cls}" data-beat="${esc(c.beat)}" title="${esc(c.steps.join(", "))}" style="left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px">
        <div class="name">${esc(c.beat)}</div><div class="title">${esc(c.objective)}</div><div class="meta">${meta}</div></div>`;
    }).join("");
    return `<div class="board-wrap"><div class="board" style="width:${b.width}px;height:${b.height}px">
      <svg width="${b.width}" height="${b.height}"><defs>
        <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow-head" d="M0,0 L10,5 L0,10 z"/></marker>
        <marker id="head-choice" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow-head choice" d="M0,0 L10,5 L0,10 z"/></marker>
      </defs>${paths.join("")}${labels.join("")}${start}</svg>${cards}</div></div>`;
  }

  function beatPage() {
    const b = model.beats[selected];
    if (!b) return "";
    const card = model.board.cards.find((c) => c.beat === b.name);
    const then = card.ending ? `The quest ${card.ending === "failed" ? "fails" : "succeeds"} here.` : b.next ? `Then <a data-select="${esc(b.next)}">${esc(model.beats[b.next]?.objective ?? b.next)}</a>, unless a choice goes elsewhere.` : "The quest stays open here: no beat follows and it does not end.";
    const scenes = b.scenes.map((s) => {
      const rows = s.rows.map(row).join("");
      return `<h3>💬 ${esc(s.name)}${s.call ? ` <span class="muted">phone call with ${esc(s.call)}</span>` : ""}${s.lines ? `<button class="small" data-act="generate" data-scene="${esc(s.name)}">Voice all ${plural(s.lines, "line")}</button>` : ""}</h3>${rows || '<p class="muted">No lines.</p>'}`;
    }).join("");
    return `<section class="beat">
      <h2>${esc(b.objective)}</h2>
      <div class="actions"><button data-act="rename" data-beat="${esc(b.name)}">Rename</button><button data-act="addBeat" data-after="${esc(b.name)}">+ Beat after</button><button data-act="delete" data-beat="${esc(b.name)}">Delete</button></div>
      <p class="facts">Beat <code>${esc(b.name)}</code>${b.marker ? ` · marker at <code>${esc(b.marker)}</code>` : ""}. ${then}</p>
      <ol class="steps">${b.steps.map((s) => `<li>${esc(s)}</li>`).join("") || '<li class="muted">No steps yet: write them in the YAML.</li>'}</ol>
      ${scenes}
    </section>`;
  }

  function row(r) {
    const d = `d${Math.min(r.depth, 6)}`;
    if (r.kind === "choice") return `<div class="row choice ${d}">◆ Choice</div>`;
    if (r.kind === "set") return `<div class="row set ${d}"># ${esc(r.words)}</div>`;
    if (r.kind === "option") {
      const opts = [`<option value="">the scene goes on</option>`, ...model.beatNames.map((n) => `<option value="${esc(n.name)}"${n.name === r.go ? " selected" : ""}>${esc(n.objective)} (${esc(n.name)})</option>`)].join("");
      return `<div class="row option ${d}">▸ ${esc(r.text)} <span class="muted">goes on to</span> <select data-option="${esc(JSON.stringify(r.path))}">${opts}</select></div>`;
    }
    const key = esc(JSON.stringify(r.path));
    return `<div class="row line ${d}">
      <div class="said"><span class="text"><b>${esc(r.speaker)}</b>: ${esc(r.text)}</span>
        <span class="status ${r.status}">${StatusWords[r.status]}</span>
        <button class="small" data-act="generate" data-scene="${esc(r.path[1])}" data-line="${key}">${r.status === "none" ? "Generate" : "Regenerate"}</button></div>
      <div class="voice">
        <label>Direction</label><input type="text" data-line="${key}" data-field="direction" value="${esc(r.direction)}" placeholder="How it is spoken, in plain words: tired, half to themself">
        <label>Say</label><input type="text" data-line="${key}" data-field="say" value="${esc(r.say)}" placeholder="As spoken, with tags: [sighs] Long day.">
      </div></div>`;
  }

  function checklist() {
    if (!model.checklist.length) return "";
    const open = model.checklist.filter((i) => !i.done).length;
    return `<section><h2>Checklist</h2><p class="muted">${open} open, ${model.checklist.length - open} done. Open items never stop the quest from playing.</p><ul class="checklist">${model.checklist.map((i, k) =>
      `<li><input type="checkbox" data-todo="${k}"${i.done ? " checked" : ""}><span class="${i.done ? "done" : ""}">${esc(i.do)}</span>${i.tool ? `<span class="tool">${esc(i.tool)}</span>` : ""}</li>`).join("")}</ul></section>`;
  }

  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-yaml],[data-beat],[data-select]");
    if (!t) return;
    if (t.dataset.yaml !== undefined) return post({ type: "yaml", line: Number(t.dataset.yaml) || undefined });
    if (t.dataset.select) return select(t.dataset.select);
    const act = t.dataset.act;
    if (!act && t.classList.contains("card")) return select(t.dataset.beat);
    if (act === "addBeat") post({ type: "addBeat", after: t.dataset.after });
    else if (act === "rename") post({ type: "rename", beat: t.dataset.beat });
    else if (act === "delete") post({ type: "delete", beat: t.dataset.beat });
    else if (act === "convert") post({ type: "convert" });
    else if (act === "generate") post({ type: "generate", scene: t.dataset.scene, line: t.dataset.line ? JSON.parse(t.dataset.line) : undefined });
  });
  app.addEventListener("dblclick", (e) => {
    const card = e.target.closest(".card");
    if (card) post({ type: "rename", beat: card.dataset.beat });
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.option) post({ type: "go", option: JSON.parse(t.dataset.option), beat: t.value });
    else if (t.dataset.todo !== undefined) post({ type: "todo", index: Number(t.dataset.todo), done: t.checked });
    else if (t.dataset.field) {
      const line = t.dataset.line;
      const field = (f) => app.querySelector(`[data-line="${CSS.escape(line)}"][data-field="${f}"]`)?.value ?? "";
      post({ type: "voice", line: JSON.parse(line), direction: field("direction"), say: field("say") });
    }
  });
  app.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset?.field) e.target.blur();
  });

  function select(name) {
    selected = name;
    vscode.setState({ selected });
    render();
    document.querySelector(".beat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  post({ type: "ready" });
})();
