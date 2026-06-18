(function () {
  "use strict";

  const DATA = window.GAME_DATA;
  const TYPES_BY_ID = {};
  DATA.types.forEach((t) => (TYPES_BY_ID[t.id] = t));

  const POKEMON_BY_ID = {};
  DATA.pokemon.forEach((p) => (POKEMON_BY_ID[p.id] = p));

  const MOVES_BY_ID = {};
  DATA.moves.forEach((m) => (MOVES_BY_ID[m.id] = m));

  const TYPE_COLORS = {
    normal: "#A8A878", fighting: "#C03028", flying: "#A890F0", poison: "#A040A0",
    ground: "#E0C068", rock: "#B8A038", bug: "#A8B820", ghost: "#705898",
    steel: "#B8B8D0", fire: "#F08030", water: "#6890F0", grass: "#78C850",
    electric: "#F8D030", psychic: "#F85888", ice: "#98D8D8", dragon: "#7038F8",
    dark: "#705848", fairy: "#EE99AC",
  };

  const MAX_MOVES = 4;

  function normalize(s) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // Pre-normalized search haystacks
  const POKEMON_SEARCH = DATA.pokemon.map((p) => ({
    p,
    key: normalize(p.name + " " + p.slug),
  }));
  const MOVE_SEARCH = DATA.moves.map((m) => ({
    m,
    key: normalize(m.name + " " + m.slug),
  }));

  function searchPokemon(query, limit) {
    const q = normalize(query.trim());
    if (!q) return [];
    const out = [];
    for (const entry of POKEMON_SEARCH) {
      if (entry.key.includes(q)) {
        out.push(entry.p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // All moves in the game are searchable — a Pokémon caught in a randomizer
  // / randomlocke run can carry attacks outside its normal movepool.
  function searchMoves(query, excludeIds, limit) {
    const q = normalize(query.trim());
    const out = [];
    for (const entry of MOVE_SEARCH) {
      if (excludeIds.includes(entry.m.id)) continue;
      if (q && !entry.key.includes(q)) continue;
      out.push(entry.m);
      if (out.length >= limit) break;
    }
    return out;
  }

  function typeBadge(typeId) {
    const t = TYPES_BY_ID[typeId];
    const color = TYPE_COLORS[t.slug] || "#888";
    return `<span class="type-badge" style="background:${color}">${t.name}</span>`;
  }

  function multClass(mult) {
    if (mult === 0) return "mult-0";
    if (mult === 4) return "mult-4";
    if (mult === 2) return "mult-2";
    if (mult === 1) return "mult-1";
    if (mult === 0.5) return "mult-05";
    if (mult === 0.25) return "mult-025";
    return "";
  }

  function fmtMult(mult) {
    if (mult === 0) return "×0";
    if (mult === 0.25) return "×0.25";
    if (mult === 0.5) return "×0.5";
    return "×" + mult;
  }

  function typeMultiplier(attackTypeId, defenderTypes) {
    let mult = 1;
    for (const dt of defenderTypes) {
      mult *= DATA.typeChart[String(attackTypeId)][String(dt)];
    }
    return mult;
  }

  // ---------------------------------------------------------------------
  // Generic "moves chosen + move search" widget, shared by team slots and
  // enemy rows. `getSlot` returns the current {pokemon, moveIds} object (or
  // null), so the widget always reflects live state.
  // ---------------------------------------------------------------------
  function wireMovePicker(root, getSlot, onChange) {
    const chosenEl = root.querySelector(".moves-chosen");
    const input = root.querySelector(".move-input");
    const results = root.querySelector(".move-search .search-results");

    function renderChosen() {
      const slot = getSlot();
      if (!slot) return;
      chosenEl.innerHTML = slot.moveIds
        .map((mid) => {
          const m = MOVES_BY_ID[mid];
          const color = TYPE_COLORS[TYPES_BY_ID[m.type].slug] || "#888";
          return `<span class="move-chip" data-mid="${mid}"><span class="mc-dot" style="background:${color}"></span>${m.name}<button data-mid="${mid}">×</button></span>`;
        })
        .join("");
      chosenEl.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const s = getSlot();
          if (!s) return;
          const mid = Number(btn.dataset.mid);
          s.moveIds = s.moveIds.filter((id) => id !== mid);
          renderChosen();
          updatePlaceholder();
          onChange();
        });
      });
    }

    function updatePlaceholder() {
      const slot = getSlot();
      const full = slot && slot.moveIds.length >= MAX_MOVES;
      input.placeholder = full ? `Máximo ${MAX_MOVES} ataques` : input.dataset.basePlaceholder;
      input.disabled = !!full;
    }

    input.dataset.basePlaceholder = input.placeholder;

    input.addEventListener("input", () => {
      const slot = getSlot();
      if (!slot) return;
      const matches = searchMoves(input.value, slot.moveIds, 30);
      renderMoveResults(results, matches, (move) => {
        if (slot.moveIds.length >= MAX_MOVES) return;
        slot.moveIds.push(move.id);
        input.value = "";
        results.classList.remove("open");
        renderChosen();
        updatePlaceholder();
        onChange();
      });
    });
    input.addEventListener("blur", () => setTimeout(() => results.classList.remove("open"), 150));

    return { renderChosen, updatePlaceholder };
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const team = new Array(6).fill(null); // each: {pokemon, moveIds:[]}
  const enemyTeam = []; // each: {pokemon, moveIds:[]}

  // ---------------------------------------------------------------------
  // Team slots
  // ---------------------------------------------------------------------
  const teamGrid = document.getElementById("team-grid");
  const teamCountEl = document.getElementById("team-count");
  const slotTpl = document.getElementById("tpl-team-slot");
  const slotEls = [];

  for (let i = 0; i < 6; i++) {
    const node = slotTpl.content.firstElementChild.cloneNode(true);
    teamGrid.appendChild(node);
    slotEls.push(node);
    setupSlot(i, node);
  }

  function setupSlot(index, node) {
    const input = node.querySelector(".slot-input");
    const results = node.querySelector(".slot-search .search-results");
    const removeBtn = node.querySelector(".slot-remove");

    const movePicker = wireMovePicker(
      node.querySelector(".slot-moves"),
      () => team[index],
      () => renderReport()
    );

    input.addEventListener("input", () => {
      const matches = searchPokemon(input.value, 30);
      renderSearchResults(results, matches, (poke) => {
        team[index] = { pokemon: poke, moveIds: [] };
        input.value = "";
        results.classList.remove("open");
        renderSlot(index, node, movePicker);
        updateCounts();
        renderReport();
      });
    });
    input.addEventListener("blur", () => setTimeout(() => results.classList.remove("open"), 150));

    removeBtn.addEventListener("click", () => {
      team[index] = null;
      renderSlot(index, node, movePicker);
      updateCounts();
      renderReport();
    });
  }

  function renderSlot(index, node, movePicker) {
    const slot = team[index];
    if (!slot) {
      node.classList.remove("filled");
      node.classList.add("empty");
      return;
    }
    node.classList.add("filled");
    node.classList.remove("empty");

    node.querySelector(".slot-sprite").src = slot.pokemon.sprite;
    node.querySelector(".slot-name").textContent = slot.pokemon.name;
    node.querySelector(".slot-types").innerHTML = slot.pokemon.types
      .map((t) => typeBadge(t))
      .join("");

    movePicker.renderChosen();
    movePicker.updatePlaceholder();
  }

  function updateCounts() {
    const filled = team.filter(Boolean).length;
    teamCountEl.textContent = `${filled}/6`;
  }

  // ---------------------------------------------------------------------
  // Search result rendering helpers
  // ---------------------------------------------------------------------
  function renderSearchResults(container, pokemonList, onPick) {
    if (!pokemonList.length) {
      container.classList.remove("open");
      container.innerHTML = "";
      return;
    }
    container.innerHTML = pokemonList
      .map(
        (p) =>
          `<div class="search-item" data-id="${p.id}">
            <img src="${p.sprite}" loading="lazy" alt="">
            <span class="sit-name">${p.name}</span>
            ${p.types.map((t) => typeBadge(t)).join("")}
          </div>`
      )
      .join("");
    container.classList.add("open");
    container.querySelectorAll(".search-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const poke = POKEMON_BY_ID[Number(el.dataset.id)];
        onPick(poke);
      });
    });
  }

  function renderMoveResults(container, moveList, onPick) {
    if (!moveList.length) {
      container.classList.remove("open");
      container.innerHTML = "";
      return;
    }
    container.innerHTML = moveList
      .map((m) => {
        const color = TYPE_COLORS[TYPES_BY_ID[m.type].slug] || "#888";
        return `<div class="search-item" data-id="${m.id}">
          <span class="mc-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
          <span class="sit-name">${m.name}</span>
          <span class="type-badge" style="background:${color}">${TYPES_BY_ID[m.type].name}</span>
        </div>`;
      })
      .join("");
    container.classList.add("open");
    container.querySelectorAll(".search-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const move = MOVES_BY_ID[Number(el.dataset.id)];
        onPick(move);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Enemy team — search to add (max 6), each with its own known moves.
  // ---------------------------------------------------------------------
  const enemyInput = document.getElementById("enemy-search-input");
  const enemyResults = document.getElementById("enemy-search-results");
  const enemyList = document.getElementById("enemy-list");
  const enemyCountEl = document.getElementById("enemy-count");
  const enemyRowTpl = document.getElementById("tpl-enemy-row");

  enemyInput.addEventListener("input", () => {
    if (enemyTeam.length >= 6) {
      renderSearchResults(enemyResults, [], () => {});
      return;
    }
    const matches = searchPokemon(enemyInput.value, 30).filter(
      (p) => !enemyTeam.some((e) => e.pokemon.id === p.id)
    );
    renderSearchResults(enemyResults, matches, (poke) => {
      if (enemyTeam.length >= 6) return;
      enemyTeam.push({ pokemon: poke, moveIds: [] });
      enemyInput.value = "";
      enemyResults.classList.remove("open");
      renderEnemyList();
      renderReport();
    });
  });
  enemyInput.addEventListener("blur", () => setTimeout(() => enemyResults.classList.remove("open"), 150));

  function renderEnemyList() {
    enemyCountEl.textContent = `${enemyTeam.length}/6`;
    enemyList.innerHTML = "";
    enemyTeam.forEach((slot) => {
      const node = enemyRowTpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = slot.pokemon.id;
      node.querySelector(".er-sprite").src = slot.pokemon.sprite;
      node.querySelector(".er-name").textContent = slot.pokemon.name;
      node.querySelector(".er-types").innerHTML = slot.pokemon.types.map((t) => typeBadge(t)).join("");
      node.querySelector(".er-remove").addEventListener("click", () => {
        const idx = enemyTeam.indexOf(slot);
        if (idx >= 0) enemyTeam.splice(idx, 1);
        renderEnemyList();
        renderReport();
      });

      const movePicker = wireMovePicker(
        node.querySelector(".er-moves"),
        () => slot,
        () => renderReport()
      );
      movePicker.renderChosen();
      movePicker.updatePlaceholder();

      enemyList.appendChild(node);
    });
  }

  // ---------------------------------------------------------------------
  // Report (defensive + offensive matchups)
  // ---------------------------------------------------------------------
  const reportEmpty = document.getElementById("report-empty");
  const reportContent = document.getElementById("report-content");

  function renderReport() {
    const yourMons = team.filter(Boolean);
    if (!yourMons.length || !enemyTeam.length) {
      reportEmpty.style.display = "block";
      reportContent.innerHTML = "";
      return;
    }
    reportEmpty.style.display = "none";

    reportContent.innerHTML = yourMons
      .map((slot) => renderMonReport(slot))
      .join("");
  }

  function renderMonReport(slot) {
    const mon = slot.pokemon;

    // Defensive: what enemy types hit this mon for != x1 (general chart)
    const defHits = [];
    for (const enemySlot of enemyTeam) {
      for (const enemyType of enemySlot.pokemon.types) {
        const mult = typeMultiplier(enemyType, mon.types);
        if (mult !== 1) {
          defHits.push({ enemy: enemySlot.pokemon, enemyType, mult });
        }
      }
    }
    defHits.sort((a, b) => b.mult - a.mult);

    // Known rival attacks: exact effectiveness for every move the rival is
    // known to carry, including neutral (x1) — answers "is this dangerous?"
    const knownHits = [];
    for (const enemySlot of enemyTeam) {
      for (const mid of enemySlot.moveIds) {
        const move = MOVES_BY_ID[mid];
        if (move.class === "status") continue;
        const mult = typeMultiplier(move.type, mon.types);
        knownHits.push({ enemy: enemySlot.pokemon, move, mult });
      }
    }
    knownHits.sort((a, b) => b.mult - a.mult);

    // Offensive: which of your moves hit which enemies for != x1
    const offHits = [];
    for (const mid of slot.moveIds) {
      const move = MOVES_BY_ID[mid];
      if (move.class === "status") continue;
      for (const enemySlot of enemyTeam) {
        const mult = typeMultiplier(move.type, enemySlot.pokemon.types);
        if (mult !== 1) {
          offHits.push({ move, enemy: enemySlot.pokemon, mult });
        }
      }
    }
    offHits.sort((a, b) => b.mult - a.mult);

    const defList = defHits.length
      ? `<ul class="matchup-list">${defHits
          .map(
            (h) => `<li class="matchup-row">
              <img src="${h.enemy.sprite}" alt="">
              <span class="mr-name">${h.enemy.name}</span>
              <span class="mr-via">vía ${TYPES_BY_ID[h.enemyType].name}</span>
              <span class="mult ${multClass(h.mult)}">${fmtMult(h.mult)}</span>
            </li>`
          )
          .join("")}</ul>`
      : `<div class="no-hits">Sin matchups defensivos fuera de ×1.</div>`;

    const knownList = knownHits.length
      ? `<ul class="matchup-list">${knownHits
          .map(
            (h) => `<li class="matchup-row">
              <img src="${h.enemy.sprite}" alt="">
              <span class="mr-name">${h.enemy.name}</span>
              <span class="mr-via">con ${h.move.name}</span>
              <span class="mult ${multClass(h.mult)}">${fmtMult(h.mult)}</span>
            </li>`
          )
          .join("")}</ul>`
      : `<div class="no-hits">Apunta ataques concretos del rival (ej. "Rayo Hielo") para verlos aquí, incluso si son ×1.</div>`;

    const offList = offHits.length
      ? `<ul class="matchup-list">${offHits
          .map(
            (h) => `<li class="matchup-row">
              <img src="${h.enemy.sprite}" alt="">
              <span class="mr-name">${h.enemy.name}</span>
              <span class="mr-via">con ${h.move.name}</span>
              <span class="mult ${multClass(h.mult)}">${fmtMult(h.mult)}</span>
            </li>`
          )
          .join("")}</ul>`
      : slot.moveIds.length
      ? `<div class="no-hits">Sin matchups ofensivos fuera de ×1.</div>`
      : `<div class="no-hits">Añade ataques a este Pokémon para ver su rendimiento ofensivo.</div>`;

    return `<div class="report-mon">
      <h3><img src="${mon.sprite}" alt="">${mon.name} ${mon.types.map((t) => typeBadge(t)).join("")}</h3>
      <div class="report-section-title">Recibe del equipo rival (por tipo)</div>
      ${defList}
      <div class="report-section-title">Ataques concretos conocidos del rival</div>
      ${knownList}
      <div class="report-section-title">Tus ataques contra el equipo rival</div>
      ${offList}
    </div>`;
  }

  // Initial render
  updateCounts();
  renderEnemyList();
  renderReport();
})();
