// The Storyboard's page: draws the model the extension posts (storyboard.ts) and sends back what the modder
// does. Every change is made by the extension, in the story file; the model comes back redrawn.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  let model;
  // The page's own state, kept while the tab is hidden: the beat shown, the board's pan and zoom, the board
  // pane's height.
  const saved = vscode.getState() || {};
  let selected = saved.selected;
  let view = saved.view; // { x, y, z }; unset: fit the story on first draw
  let paneH = saved.paneH;
  const save = () => vscode.setState({ selected, view, paneH });

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const post = (m) => vscode.postMessage(m);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const StatusWords = { none: "no take", made: "take made", stale: "changed since its take" };
  const ZoomMin = 0.25, ZoomMax = 2.5;

  window.addEventListener("message", (e) => {
    if (e.data.type !== "model") return;
    model = e.data.model;
    if (!model.beats[selected]) selected = model.beatNames[0]?.name;
    render();
  });

  function render() {
    const keepY = app.querySelector(".detail")?.scrollTop ?? 0;
    const focus = document.activeElement?.dataset?.field ? `${document.activeElement.dataset.line}|${document.activeElement.dataset.field}` : "";
    app.innerHTML = header() + boardPane() +
      `<div class="splitter" title="Drag to resize the board. Double-click to fit it to the story."></div>` +
      `<div class="detail">${notices()}${beatPage()}${checklist()}</div>`;
    app.querySelector(".detail").scrollTop = keepY;
    sizePane();
    applyView();
    if (focus) app.querySelector(`[data-line="${CSS.escape(focus.split("|")[0])}"][data-field="${focus.split("|")[1]}"]`)?.focus();
  }

  function header() {
    return `<header>
      <div class="kind">Storyboard</div>
      <h1>${esc(model.title)}</h1>
      <div class="muted">${model.id ? `<code>${esc(model.id)}</code>` : ""}${model.description ? ` · ${esc(model.description)}` : ""}</div>
      <div class="actions"><button class="primary" data-act="addBeat">+ Beat</button><button data-act="make" title="Make the quest's game files from this story (saving makes them too)">Make</button><button data-act="made" title="The game files made from this story, in plain words">Made files</button><button data-act="refresh" title="Lay the board out afresh and fit it in view, reading the story and its voice takes again">Layout</button><button data-yaml="0">Open YAML</button></div>
    </header>`;
  }

  function notices() {
    const problems = model.problems.length
      ? `<div class="problems"><b>${plural(model.problems.length, "problem")} in the story file.</b> The board comes back once they are fixed in the YAML.<ul>${model.problems.map((p) => `<li>${p.line ? `<a data-yaml="${p.line}">line ${p.line}</a>, ` : ""}${esc(p.at)}: ${esc(p.message)}</li>`).join("")}</ul></div>`
      : "";
    const steps = model.usesSteps ? `<div class="banner">This story lists <code>steps:</code> from before beats. It still works; convert it to beats to edit it here. <button data-act="convert" class="small">Convert to beats</button></div>` : "";
    return steps + problems;
  }

  function boardPane() {
    const zoom = `<div class="zoom">
      <button data-zoom="in" title="Zoom in (mouse wheel)">+</button><button data-zoom="out" title="Zoom out (mouse wheel)">−</button>
      <button data-zoom="fit" title="Fit the whole story">Fit</button><button data-zoom="one" title="Actual size">1:1</button></div>`;
    return `<div class="pane"><div class="viewport">${model.board ? board() : '<p class="muted empty">The board comes back once the story file\'s problems are fixed.</p>'}</div>${model.board ? zoom : ""}</div>`;
  }

  // ---- pan, zoom and the board pane's height ---------------------------------------------------------

  const viewport = () => app.querySelector(".viewport");
  const clampH = (h) => clamp(h, 120, Math.max(140, window.innerHeight - 150));

  function sizePane() {
    const pane = app.querySelector(".pane");
    if (!pane) return;
    if (paneH === undefined) paneH = clampH(Math.min(model.board?.height ?? 160, window.innerHeight * 0.5));
    pane.style.height = `${clampH(paneH)}px`;
  }

  function fitView() {
    const vp = viewport(), b = model.board;
    const z = clamp(Math.min(1, vp.clientWidth / b.width, vp.clientHeight / b.height), ZoomMin, ZoomMax);
    return { z, x: Math.max(0, (vp.clientWidth - b.width * z) / 2), y: Math.max(0, (vp.clientHeight - b.height * z) / 2) };
  }

  function applyView() {
    const board = app.querySelector(".board");
    if (!board) return;
    if (!view) view = fitView();
    board.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  }

  /** Zooms by a factor, keeping the board's point under (mx, my) where it is. */
  function zoomAt(factor, mx, my) {
    const z = clamp(view.z * factor, ZoomMin, ZoomMax);
    view = { z, x: mx - ((mx - view.x) * z) / view.z, y: my - ((my - view.y) * z) / view.z };
    applyView();
    save();
  }

  /** Brings a card into view when it is outside it. */
  function showCard(name) {
    const p = model.board?.pos[name], vp = viewport();
    if (!p || !vp || !view) return;
    const { cardW: W, cardH: H } = model.board;
    const left = view.x + p.x * view.z, top = view.y + p.y * view.z;
    if (left >= 0 && top >= 0 && left + W * view.z <= vp.clientWidth && top + H * view.z <= vp.clientHeight) return;
    view = { ...view, x: vp.clientWidth / 2 - (p.x + W / 2) * view.z, y: vp.clientHeight / 2 - (p.y + H / 2) * view.z };
    applyView();
    save();
  }

  app.addEventListener("wheel", (e) => {
    const vp = e.target.closest(".viewport");
    if (!vp || !model.board) return;
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Left-drag pans the board. A press that does not move is still a click, so a card is still chosen by
  // clicking it and renamed by double-clicking it.
  let drag, split, swallowClick = false;
  app.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".splitter")) {
      split = { y: e.clientY, h: clampH(paneH), el: e.target.closest(".splitter") };
      split.el.setPointerCapture(e.pointerId);
      split.el.classList.add("dragging");
      e.preventDefault();
      return;
    }
    const vp = e.target.closest(".viewport");
    if (vp && model.board) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, vp, id: e.pointerId };
  });
  app.addEventListener("pointermove", (e) => {
    if (split) {
      paneH = clampH(split.h + e.clientY - split.y);
      sizePane();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; drag.vp.setPointerCapture(drag.id); drag.vp.classList.add("panning"); }
    view = { ...view, x: drag.vx + dx, y: drag.vy + dy };
    applyView();
  });
  const endDrag = () => {
    if (split) { split.el.classList.remove("dragging"); split = undefined; save(); }
    if (drag?.moved) { drag.vp.classList.remove("panning"); swallowClick = true; save(); }
    drag = undefined;
  };
  app.addEventListener("pointerup", endDrag);
  app.addEventListener("pointercancel", endDrag);
  app.addEventListener("dblclick", (e) => {
    if (!e.target.closest(".splitter") || !model.board) return;
    paneH = clampH(model.board.height * view.z + 12);
    sizePane();
    save();
  });
  window.addEventListener("resize", () => model && sizePane());

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
    return `<div class="board" style="width:${b.width}px;height:${b.height}px">
      <svg width="${b.width}" height="${b.height}"><defs>
        <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow-head" d="M0,0 L10,5 L0,10 z"/></marker>
        <marker id="head-choice" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow-head choice" d="M0,0 L10,5 L0,10 z"/></marker>
      </defs>${paths.join("")}${labels.join("")}${start}</svg>${cards}</div>`;
  }

  function beatPage() {
    const b = model.beats[selected];
    if (!b) return "";
    const card = model.board.cards.find((c) => c.beat === b.name);
    // What follows the beat when no choice says otherwise: the grey arrow on the board.
    const value = card.ending ? (card.ending === "failed" ? "failed" : "done") : !b.next ? "none" : b.next === b.follows ? "follow" : b.next;
    const choices = [
      ...(b.follows ? [["follow", `${model.beats[b.follows]?.objective ?? b.follows} (next in the list)`]] : []),
      ...model.beatNames.filter((n) => n.name !== b.name && n.name !== b.follows).map((n) => [n.name, `${n.objective} (${n.name})`]),
      ["none", "nothing: the quest stays open"], ["done", "the quest succeeds"], ["failed", "the quest fails"],
    ];
    const pick = `<select data-then="${esc(b.name)}" title="What happens after this beat when no choice in it goes elsewhere: the grey arrow on the board">${choices.map(([v, words]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(words)}</option>`).join("")}</select>`;
    const go = b.next && !card.ending ? ` <a data-select="${esc(b.next)}" title="Show that beat">→</a>` : "";
    const then = `<span class="then">Then ${pick}${go}${b.next && !card.ending ? `<span class="muted">, unless a choice goes elsewhere.</span>` : ""}</span>`;
    const steps = b.steps.map((s) => `<li class="step-row${s.never ? " never" : ""}"${s.never ? ' title="Never happens: every way out of the scene before it goes on to another beat."' : ""}>
        <span class="grow">${s.sound ? `${s.sound.kind === "music" ? "♫" : "♪"} ${s.sound.kind} ${soundLink(s.sound.kind, s.sound.event, ["beats", b.name, "steps", s.index])}` : esc(s.words)}</span>${tools({ up: !s.first, down: !s.last, attrs: `data-beat="${esc(b.name)}" data-step="${s.index}"`, act: "step" })}</li>`).join("");
    const scenes = b.scenes.map((s) => {
      const rows = s.rows.map((r) => row(r, s)).join("");
      return `<h3>💬 ${esc(s.name)}${s.call ? ` <span class="muted">phone call with ${esc(s.call)}</span>` : ""}${s.lines ? `<button class="small" data-act="generate" data-scene="${esc(s.name)}">Voice all ${plural(s.lines, "line")}</button>` : ""}</h3>${rows}`;
    }).join("");
    return `<section class="beat">
      <h2>${esc(b.objective)}</h2>
      <div class="actions"><button data-act="rename" data-beat="${esc(b.name)}">Rename</button><button data-act="addBeat" data-after="${esc(b.name)}">+ Beat after</button><button data-act="delete" data-beat="${esc(b.name)}">Delete</button></div>
      <p class="facts">Beat <code>${esc(b.name)}</code>${b.marker ? ` · marker at <code>${esc(b.marker)}</code>` : ""}.</p>
      <p class="facts">${then}</p>
      <ol class="steps">${steps}</ol>
      <div class="add"><button class="small" data-act="addStep" data-beat="${esc(b.name)}">+ Step</button></div>
      ${scenes}
    </section>`;
  }

  /** A music or sound event's name; clicking it picks another. */
  function soundLink(kind, event, at) {
    return `<a data-act="editSound" data-kind="${kind}" data-event="${esc(event)}" data-at="${esc(JSON.stringify(at))}" title="Pick another ${kind === "music" ? "music cue" : "sound"}"><code>${esc(event)}</code></a>`;
  }

  /** ↑ ↓ ✕ for a row; `attrs` say which row, `act` which kind of thing it is. */
  function tools({ up, down, attrs, act }) {
    return `<span class="tools">
      <button class="icon" data-act="${act}-up" ${attrs} title="Move up"${up ? "" : " disabled"}>↑</button>
      <button class="icon" data-act="${act}-down" ${attrs} title="Move down"${down ? "" : " disabled"}>↓</button>
      <button class="icon" data-act="${act}-remove" ${attrs} title="Delete">✕</button></span>`;
  }

  // An option's kinds, as the editor's pickers name them (the story file's lifepath:, check: and pay:).
  const Lifepaths = [["lifepath:corpo", "Corpo only"], ["lifepath:nomad", "Nomad only"], ["lifepath:streetkid", "Street Kid only"]];
  const Checks = [["check:body", "Body check"], ["check:intelligence", "Intelligence check"], ["check:reflexes", "Reflexes check"], ["check:tech", "Technical Ability check"], ["check:cool", "Cool check"]];
  const Difficulties = ["easy", "medium", "hard", "impossible"];

  function row(r, scene) {
    const d = `d${Math.min(r.depth, 6)}`;
    const at = r.list ? `data-list="${esc(JSON.stringify(r.list))}" data-index="${r.index}"` : "";
    if (r.kind === "add") {
      return `<div class="add ${d}"><button class="small" data-act="insert" data-what="line" data-speaker="V" ${at}>+ Line</button>${scene.call ? `<button class="small" data-act="insert" data-what="line" data-speaker="${esc(scene.call)}" ${at}>+ ${esc(scene.call)}'s line</button>` : ""}<button class="small" data-act="insert" data-what="choice" ${at}>+ Choice</button><button class="small" data-act="addSound" ${at} title="A sound played on V at this point">+ Sound</button></div>`;
    }
    if (r.kind === "choice") {
      return `<div class="row choice ${d}"><span class="grow">◆ Choice <button class="small" data-act="addOption" data-choice="${esc(JSON.stringify(r.choice))}">+ Option</button></span>${tools({ up: !r.first, down: !r.last, attrs: `${at} data-what="choice"`, act: "item" })}</div>`;
    }
    if (r.kind === "sound") return `<div class="row set ${d}"><span class="grow">♪ sound ${soundLink("sound", r.event, r.path)}</span>${tools({ up: !r.first, down: !r.last, attrs: `${at} data-what="sound"`, act: "item" })}</div>`;
    if (r.kind === "set") return `<div class="row set ${d}"><span class="grow"># ${esc(r.words)}</span>${tools({ up: !r.first, down: !r.last, attrs: `${at} data-what="set"`, act: "item" })}</div>`;
    if (r.kind === "option") {
      const opts = [`<option value="">the scene goes on</option>`, ...model.beatNames.map((n) => `<option value="${esc(n.name)}"${n.name === r.go ? " selected" : ""}>${esc(n.objective)} (${esc(n.name)})</option>`)].join("");
      const attrs = `data-choice="${esc(JSON.stringify(r.choice))}" data-option-name="${esc(r.text)}"`;
      const key = esc(JSON.stringify(r.path));
      const pick = (attr, title, list, value) => `<select ${attr}="${key}" title="${esc(title)}">${list.map(([v, words]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(words)}</option>`).join("")}</select>`;
      const auto = r.mainSet === undefined;
      const colour = pick("data-main-of", "Yellow options move the story on, as the game marks them. Auto: yellow when the option goes to a beat or sets a fact.",
        [["", `${r.main ? "Yellow" : "White"} (auto)`], ["yes", "Yellow"], ["no", "White"]], auto ? "" : r.mainSet ? "yes" : "no");
      const condition = pick("data-cond-of", "Who can pick it: a lifepath only, an attribute check (locked below it), or a payment (taken on choosing)", [["", "Anyone"], ...Lifepaths, ...Checks, ["pay", "Pay eddies"]], r.condition ?? "");
      const extra = r.condition?.startsWith("check:")
        ? pick("data-diff-of", "How hard: the number grows with V's level", Difficulties.map((x) => [x, x]), r.difficulty)
        : r.condition === "pay" ? `<input type="text" class="pay" data-pay-of="${key}" value="${esc(r.pay)}" placeholder="500 or medium" title="Eddies, or a difficulty: a price that grows with V's level">` : "";
      return `<div class="row option ${d}${r.main ? " main" : ""}">▸ ${r.tag ? `<span class="tag">[${esc(r.tag)}]</span>` : ""}<input type="text" class="option-text" value="${esc(r.text)}" ${attrs} title="The option, as the player sees it">
        <span class="muted">goes on to</span> <select data-option="${key}">${opts}</select>${tools({ up: !r.first, down: !r.last, attrs, act: "option" })}
        <div class="kind">${colour}${condition}${extra}</div></div>`;
    }
    const key = esc(JSON.stringify(r.path));
    const speaker = scene.speakers.length > 1
      ? `<select data-speaker-of="${key}">${scene.speakers.map((s) => `<option${s === r.speaker ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>`
      : `<b>${esc(r.speaker)}</b>`;
    return `<div class="row line ${d}">
      <div class="said">${speaker}<input type="text" class="line-text" data-text-of="${key}" value="${esc(r.text)}" title="What is said">
        <span class="status ${r.status}">${StatusWords[r.status]}</span>
        <button class="small" data-act="generate" data-scene="${esc(scene.name)}" data-line="${key}">${r.status === "none" ? "Generate" : "Regenerate"}</button>
        ${tools({ up: !r.first, down: !r.last, attrs: `${at} data-what="line"`, act: "item" })}</div>
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
    if (swallowClick) { swallowClick = false; return; } // the end of a pan, not a click
    const t = e.target.closest("[data-act],[data-yaml],[data-beat],[data-select],[data-zoom]");
    if (!t) return;
    if (t.dataset.zoom) {
      const vp = viewport();
      if (t.dataset.zoom === "fit") { view = fitView(); applyView(); save(); }
      else zoomAt(t.dataset.zoom === "in" ? 1.25 : t.dataset.zoom === "out" ? 0.8 : 1 / view.z, vp.clientWidth / 2, vp.clientHeight / 2);
      return;
    }
    if (t.dataset.yaml !== undefined) return post({ type: "yaml", line: Number(t.dataset.yaml) || undefined });
    if (t.dataset.select) return select(t.dataset.select, true);
    const act = t.dataset.act;
    if (!act && t.classList.contains("card")) return select(t.dataset.beat);
    if (act === "addBeat") post({ type: "addBeat", after: t.dataset.after });
    else if (act === "rename") post({ type: "rename", beat: t.dataset.beat });
    else if (act === "delete") post({ type: "delete", beat: t.dataset.beat });
    else if (act === "convert") post({ type: "convert" });
    else if (act === "make") post({ type: "make" });
    else if (act === "made") post({ type: "made" });
    else if (act === "refresh") { view = undefined; save(); post({ type: "ready" }); }
    else if (act === "generate") post({ type: "generate", scene: t.dataset.scene, line: t.dataset.line ? JSON.parse(t.dataset.line) : undefined });
    else if (act === "insert") post({ type: "insert", list: JSON.parse(t.dataset.list), index: Number(t.dataset.index), what: t.dataset.what, speaker: t.dataset.speaker });
    else if (act?.startsWith("item-")) {
      const list = JSON.parse(t.dataset.list), index = Number(t.dataset.index);
      if (act === "item-remove") post({ type: "remove", list, index, what: t.dataset.what });
      else post({ type: "move", list, from: index, to: index + (act === "item-up" ? -1 : 1) });
    } else if (act?.startsWith("option-")) {
      const choice = JSON.parse(t.dataset.choice), option = t.dataset.optionName;
      if (act === "option-remove") post({ type: "removeOption", choice, option });
      else post({ type: "moveOption", choice, option, by: act === "option-up" ? -1 : 1 });
    } else if (act === "addOption") post({ type: "addOption", choice: JSON.parse(t.dataset.choice) });
    else if (act === "addStep") post({ type: "addStep", beat: t.dataset.beat });
    else if (act === "addSound") post({ type: "addSound", list: JSON.parse(t.dataset.list), index: Number(t.dataset.index) });
    else if (act === "editSound") post({ type: "editSound", at: JSON.parse(t.dataset.at), kind: t.dataset.kind, event: t.dataset.event });
    else if (act?.startsWith("step-")) {
      const beat = t.dataset.beat, index = Number(t.dataset.step);
      if (act === "step-remove") post({ type: "removeStep", beat, index });
      else post({ type: "moveStep", beat, from: index, to: index + (act === "step-up" ? -1 : 1) });
    }
  });
  app.addEventListener("dblclick", (e) => {
    const card = e.target.closest(".card");
    if (card) post({ type: "rename", beat: card.dataset.beat });
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.option) post({ type: "go", option: JSON.parse(t.dataset.option), beat: t.value });
    else if (t.dataset.mainOf) post({ type: "optionKind", option: JSON.parse(t.dataset.mainOf), change: { main: t.value === "" ? null : t.value === "yes" } });
    else if (t.dataset.condOf) {
      const [kind, which] = t.value.split(":");
      const change = !kind ? { condition: null } : kind === "lifepath" ? { lifepath: which } : kind === "check" ? { check: { attribute: which, difficulty: "medium" } } : { pay: "medium" };
      post({ type: "optionKind", option: JSON.parse(t.dataset.condOf), change });
    } else if (t.dataset.diffOf) {
      const attribute = app.querySelector(`[data-cond-of="${CSS.escape(t.dataset.diffOf)}"]`).value.split(":")[1];
      post({ type: "optionKind", option: JSON.parse(t.dataset.diffOf), change: { check: { attribute, difficulty: t.value } } });
    } else if (t.dataset.payOf) {
      const v = t.value.trim().toLowerCase();
      post({ type: "optionKind", option: JSON.parse(t.dataset.payOf), change: { pay: /^\d+$/.test(v) ? Number(v) : v } });
    }
    else if (t.dataset.then) post({ type: "then", beat: t.dataset.then, then: t.value });
    else if (t.dataset.todo !== undefined) post({ type: "todo", index: Number(t.dataset.todo), done: t.checked });
    else if (t.dataset.optionName !== undefined) { if (t.value.trim() && t.value.trim() !== t.dataset.optionName) post({ type: "renameOption", choice: JSON.parse(t.dataset.choice), option: t.dataset.optionName, to: t.value }); else t.value = t.dataset.optionName; }
    else if (t.dataset.textOf) { if (t.value.trim()) post({ type: "line", line: JSON.parse(t.dataset.textOf), text: t.value }); else render(); }
    else if (t.dataset.speakerOf) post({ type: "line", line: JSON.parse(t.dataset.speakerOf), speaker: t.value });
    else if (t.dataset.field) {
      const line = t.dataset.line;
      const field = (f) => app.querySelector(`[data-line="${CSS.escape(line)}"][data-field="${f}"]`)?.value ?? "";
      post({ type: "voice", line: JSON.parse(line), direction: field("direction"), say: field("say") });
    }
  });
  app.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("input[type=text]")) e.target.blur();
  });

  /** Shows a beat's page below the board; from a link on a page, its card is brought into view too. */
  function select(name, fromLink = false) {
    selected = name;
    save();
    render();
    app.querySelector(".detail").scrollTop = 0;
    if (fromLink) showCard(name);
  }

  post({ type: "ready" });
})();
