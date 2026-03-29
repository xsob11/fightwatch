(function () {
  "use strict";

  var cfg = window.MM_CONFIG;
  if (!cfg) { console.error("MM_CONFIG missing"); return; }

  /* ─────────────────────────────────────────────
     STAN
  ───────────────────────────────────────────── */
  var params          = new URLSearchParams(window.location.search);
  var evSlug          = cfg.parseEventSlug(params.get("slug") || "");
  var eventNumericId  = evSlug ? evSlug.numericId : null;

  var matNamesById        = Object.create(null);
  var pollTimerId         = null;
  var lastFightsData      = null;
  var startingListEntries = null;
  var startingListPromise = null;
  var filterPanelOpen     = false;
  var clubJumpOutside     = null;
  var clubJumpEscape      = null;

  /* powiadomienia — zbiory już wysłanych alertów żeby nie powtarzać */
  var alertedAt30 = Object.create(null); /* fightId → true */
  var alertedAt5  = Object.create(null);

  var plCol = new Intl.Collator("pl", { sensitivity:"base" });
  var timeFmt = new Intl.DateTimeFormat("pl-PL", {
    timeZone:"Europe/Warsaw", hour:"2-digit", minute:"2-digit"
  });

  /* ─────────────────────────────────────────────
     ELEMENTY DOM
  ───────────────────────────────────────────── */
  var slugLabel        = document.getElementById("fw-slug-label");
  var errEl            = document.getElementById("fw-error");
  var placeholderEl    = document.getElementById("fw-placeholder");
  var toolbarEl        = document.getElementById("fw-toolbar");
  var listEl           = document.getElementById("fw-fights");

  var filterRootEl     = document.getElementById("fw-filter-root");
  var filterMainBtn    = document.getElementById("fw-filter-main-btn");
  var filterBtnLabel   = document.getElementById("fw-filter-btn-label");
  var filterPanelEl    = document.getElementById("fw-filter-panel");
  var filterStatusEl   = document.getElementById("fw-filter-status");
  var filterListEl     = document.getElementById("fw-filter-list");
  var applyDesktopBtn  = document.getElementById("fw-apply-desktop");
  var mobileBarEl      = document.getElementById("fw-mobile-bar");
  var applyMobileBtn   = document.getElementById("fw-apply-mobile");
  var clubJumpWrapEl   = document.getElementById("fw-club-jump-wrap");
  var clubJumpRootEl   = document.getElementById("fw-club-jump-root");
  var clubJumpToggleBtn= document.getElementById("fw-club-jump-toggle");
  var clubJumpListEl   = document.getElementById("fw-club-jump-list");

  var notifyBarEl      = document.getElementById("fw-notify-bar");
  var notifyBtn        = document.getElementById("fw-notify-btn");
  var toastEl          = document.getElementById("fw-toast");

  if (slugLabel) slugLabel.textContent = evSlug ? evSlug.slug : "—";

  /* ─────────────────────────────────────────────
     POWIADOMIENIA — PERMISSION + NOTIFY + TOAST
  ───────────────────────────────────────────── */

  /** Sprawdza czy powiadomienia są wspierane i jaki jest ich status. */
  function notifSupported() {
    return "Notification" in window;
  }

  function notifGranted() {
    return notifSupported() && Notification.permission === "granted";
  }

  function updateNotifyBar() {
    if (!notifyBarEl) return;
    if (!notifSupported()) { notifyBarEl.classList.add("is-hidden"); return; }
    if (notifGranted()) { notifyBarEl.classList.add("is-hidden"); return; }
    if (Notification.permission === "denied") {
      /* pokazujemy skrócony komunikat — nie można już prosić */
      notifyBarEl.classList.remove("is-hidden");
      if (notifyBtn) {
        notifyBtn.textContent = "Zablokowane";
        notifyBtn.disabled = true;
        notifyBtn.style.opacity = "0.5";
      }
      return;
    }
    notifyBarEl.classList.remove("is-hidden");
  }

  function requestNotifPermission() {
    if (!notifSupported()) return;
    Notification.requestPermission().then(function () {
      updateNotifyBar();
    });
  }

  if (notifyBtn) notifyBtn.addEventListener("click", requestNotifPermission);
  updateNotifyBar();

  /* Odtwarzanie krótkiego dźwięku przez Web Audio API */
  function playAlertSound(urgent) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var now = ctx.currentTime;

      function beep(freq, start, duration, vol) {
        var osc  = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "square"; /* ostrzejszy, przebija się przez hałas */
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(vol, start);
        gain.gain.setValueAtTime(vol, start + duration - 0.04);
        gain.gain.linearRampToValueAtTime(0, start + duration);
        osc.start(start);
        osc.stop(start + duration);
      }

      if (urgent) {
        /* 5 minut — 3 krótkie + 1 długi, głośne, wysokie */
        beep(1200, now + 0.0,  0.15, 0.9);
        beep(1200, now + 0.22, 0.15, 0.9);
        beep(1200, now + 0.44, 0.15, 0.9);
        beep(1500, now + 0.7,  0.8,  0.9);
      } else {
        /* 30 minut — 2 tony wzrastające, długie */
        beep(800, now + 0.0,  0.5, 0.8);
        beep(1000, now + 0.65, 0.7, 0.8);
      }
    } catch (e) { /* Web Audio niedostępne */ }
  }

  /* Wibracja */
  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  /* Toast w aplikacji */
  var toastTimer = null;
  function showToast(msg, kind) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = "fw-toast fw-toast--" + kind;
    /* reflow */
    void toastEl.offsetWidth;
    toastEl.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, kind === "5" ? 7000 : 5000);
  }

  /**
   * Wysyła alert (powiadomienie systemowe + wibracja + dźwięk + toast)
   * @param {"30"|"5"} kind
   * @param {string} fightName  np. "Jan Kowalski vs. —"
   * @param {string} timeStr    np. "14:30"
   */
  function sendAlert(kind, fightName, timeStr) {
    var is5 = kind === "5";
    var title = is5 ? "⚔️ Za 5 min: " + fightName : "⏰ Za 30 min: " + fightName;
    var body  = is5
      ? "Walka o " + timeStr + " — wejść na matę!"
      : "Walka zaplanowana na " + timeStr + ". Przygotuj się!";

    /* 1. Powiadomienie systemowe */
    if (notifGranted()) {
      try {
        new Notification(title, {
          body: body,
          icon: "",
          badge: "",
          tag: "fw-" + kind + "-" + fightName,
          renotify: true,
          vibrate: is5 ? [200, 100, 200, 100, 400] : [200, 100, 200],
        });
      } catch(e) {}
    }

    /* 2. Wibracja */
    vibrate(is5 ? [200, 100, 200, 100, 400] : [200, 100, 200]);

    /* 3. Dźwięk */
    playAlertSound(is5);

    /* 4. Toast w UI */
    showToast(title + "\n" + body, kind);
  }

  /* ─────────────────────────────────────────────
     PARSERY / HELPERY
  ───────────────────────────────────────────── */

  function parseStartTimeUtc(isoLike) {
    if (!isoLike || typeof isoLike !== "string") return null;
    var m = isoLike.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]));
  }

  function sortKeyStartTime(s) {
    var d = parseStartTimeUtc(s);
    return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
  }

  function flagEmoji(code) {
    if (!code || typeof code !== "string" || code.length !== 2) return "";
    var c = code.toUpperCase();
    var base = 0x1f1e6 - 0x41;
    return String.fromCodePoint(base + c.charCodeAt(0), base + c.charCodeAt(1));
  }

  function formatCat(cat) {
    if (!cat) return "";
    return String(cat).replace(/;/g," ").replace(/\s+/g," ").trim();
  }

  function rowHeadVariant(fightId, matId, queueStatuses) {
    var q = queueStatuses && queueStatuses[String(matId)];
    if (!q || q.fightId !== fightId) return "scheduled";
    if (q.status === 2) return "active";
    if (q.status === 1) return "called";
    return "scheduled";
  }

  function roundBadges(pf) {
    var rn = (pf.roundName || "").trim();
    var rnl = rn.toLowerCase();
    var list = [];
    if (rnl === "final") list.push({text:"FINAŁ",v:"final"});
    else if (rnl === "semi_final") list.push({text:"PÓŁFINAŁ",v:"round"});
    else if (rnl === "quarter_final") list.push({text:"1/4",v:"round"});
    else if (rnl === "third_place_playoff" || rnl === "repechage_3rd_place") list.push({text:"o 3 miejsce",v:"third"});
    else if (rnl === "repechage") list.push({text:"REP",v:"round"});
    else if (rn === "1/8" || rnl.indexOf("1/8")===0) list.push({text:"1/8",v:"round"});
    else if (rn === "1/4" || rnl.indexOf("1/4")===0) list.push({text:"1/4",v:"round"});
    else if (rnl.indexOf("1/2")===0) list.push({text:"1/2",v:"round"});
    else if (rn) list.push({text:rn.replace(/_/g," "),v:"neutral"});
    return list;
  }

  function competitorName(c) {
    if (!c) return "—";
    return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "—";
  }
  function competitorClub(c) {
    if (!c) return "";
    return [c.academy, c.branch].filter(Boolean).join(" · ");
  }
  function buildMatName(raw, id) {
    var s = String(raw || "").trim() || "Mata " + id;
    s = s.replace(/^mata\s+/i,"mata ");
    if (!/^mata\s/i.test(s)) s = "mata " + s;
    return s.toLowerCase();
  }
  function buildMatMap(payload) {
    var map = Object.create(null);
    if (!payload) return map;
    var activeId = payload.activeScheduleId;
    var scheds = payload.schedules || [];
    var sch = scheds.find(function(s){ return s.id === activeId; }) || scheds[0];
    if (!sch || !sch.mats) return map;
    sch.mats.forEach(function(m) { map[String(m.id)] = m.name || "Mata " + m.id; });
    return map;
  }

  var PIN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';

  /* ─────────────────────────────────────────────
     FILTR
  ───────────────────────────────────────────── */

  function getFilterSet() {
    var raw = new URLSearchParams(window.location.search).get("filter");
    if (!raw || !raw.trim()) return null;
    var map = Object.create(null);
    raw.split(",").forEach(function(id){ if (id.trim()) map[id.trim()] = true; });
    return Object.keys(map).length ? map : null;
  }

  function setFilterInUrl(ids) {
    var p = new URLSearchParams(window.location.search);
    if (!ids.length) p.delete("filter"); else p.set("filter", ids.join(","));
    var qs = p.toString();
    var next = window.location.pathname + (qs ? "?" + qs : "") + (window.location.hash || "");
    window.history.replaceState(null, "", next);
  }

  function fightMatchesFilter(row, idSet) {
    if (!idSet) return true;
    var pf = row.publicFight; if (!pf) return false;
    var a = pf.firstCompetitor  && pf.firstCompetitor.publicId;
    var b = pf.secondCompetitor && pf.secondCompetitor.publicId;
    return Boolean((a && idSet[a]) || (b && idSet[b]));
  }

  /* starting lists */
  function parseStartingListHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var out = [];
    doc.querySelectorAll("table.table tbody tr").forEach(function(tr) {
      var nameA = tr.querySelector("a.competitor-name[data-publicid]");
      if (!nameA) return;
      var publicId = nameA.getAttribute("data-publicid"); if (!publicId) return;
      var name = (nameA.textContent || "").replace(/\s+/g," ").trim();
      var tds = tr.querySelectorAll("td"); if (tds.length < 3) return;
      var clubText = (tds[2].textContent || "").replace(/\s+/g," ").trim();
      var category = "";
      var col = tr.closest(".column");
      if (col && col.previousElementSibling) {
        var h4a = col.previousElementSibling.querySelector("h4.title.is-4 a");
        var h4  = col.previousElementSibling.querySelector("h4.title.is-4");
        category = ((h4a||h4||{textContent:""}).textContent||"").replace(/\s+/g," ").trim();
      }
      out.push({ publicId, name, category, clubText: clubText || "—" });
    });
    return out;
  }

  function groupByClub(entries) {
    var byClub = Object.create(null);
    entries.forEach(function(e) {
      var k = e.clubText || "—";
      if (!byClub[k]) byClub[k] = [];
      byClub[k].push(e);
    });
    var names = Object.keys(byClub).sort(function(a,b){ return plCol.compare(a,b); });
    names.forEach(function(n) {
      byClub[n].sort(function(a,b){
        var pa = a.name.trim().split(/\s+/), pb = b.name.trim().split(/\s+/);
        var c = plCol.compare(pa[0]||"", pb[0]||"");
        return c !== 0 ? c : plCol.compare(pa.slice(1).join(" "), pb.slice(1).join(" "));
      });
    });
    return { names, byClub };
  }

  function ensureStartingList() {
    if (startingListEntries) return Promise.resolve(startingListEntries);
    if (startingListPromise) return startingListPromise;
    if (!evSlug) return Promise.reject(new Error("Brak slug"));
    if (filterStatusEl) filterStatusEl.textContent = "Ładowanie list startowych…";
    startingListPromise = fetch(cfg.url("/pl/events/" + encodeURIComponent(evSlug.slug) + "/starting-lists"), {
      credentials:"omit", headers:{ Accept:"text/html,*/*" }
    }).then(function(r){
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function(html){
      var entries = parseStartingListHtml(html);
      startingListPromise = null;
      if (!entries.length) throw new Error("Brak uczestników (zmienił się HTML?)");
      startingListEntries = entries;
      return entries;
    }).catch(function(err){
      startingListPromise = null;
      throw err;
    });
    return startingListPromise;
  }

  /* club jump dropdown */
  function closeClubJump() {
    if (clubJumpOutside) { document.removeEventListener("click", clubJumpOutside, true); clubJumpOutside = null; }
    if (clubJumpEscape)  { document.removeEventListener("keydown", clubJumpEscape, true); clubJumpEscape = null; }
    if (clubJumpListEl) clubJumpListEl.classList.add("is-hidden");
    if (clubJumpToggleBtn) clubJumpToggleBtn.setAttribute("aria-expanded","false");
    if (clubJumpRootEl) clubJumpRootEl.classList.remove("is-open");
  }
  function openClubJump() {
    if (clubJumpListEl) clubJumpListEl.classList.remove("is-hidden");
    if (clubJumpToggleBtn) clubJumpToggleBtn.setAttribute("aria-expanded","true");
    if (clubJumpRootEl) clubJumpRootEl.classList.add("is-open");
    clubJumpOutside = function(ev){ if (clubJumpRootEl && clubJumpRootEl.contains(ev.target)) return; closeClubJump(); };
    clubJumpEscape  = function(ev){ if (ev.key === "Escape") closeClubJump(); };
    setTimeout(function(){
      document.addEventListener("click",   clubJumpOutside, true);
      document.addEventListener("keydown",  clubJumpEscape,  true);
    }, 0);
  }
  function toggleClubJump() {
    if (clubJumpListEl && !clubJumpListEl.classList.contains("is-hidden")) closeClubJump(); else openClubJump();
  }

  function rebuildClubJump(names) {
    closeClubJump();
    if (!clubJumpListEl) return;
    clubJumpListEl.innerHTML = "";
    if (!names || names.length < 2) { if (clubJumpWrapEl) clubJumpWrapEl.classList.add("is-hidden"); return; }
    if (clubJumpWrapEl) clubJumpWrapEl.classList.remove("is-hidden");
    names.forEach(function(name, i) {
      var li = document.createElement("li");
      li.role = "option"; li.className = "fw-club-jump__option";
      li.textContent = name; li.dataset.idx = i;
      clubJumpListEl.appendChild(li);
    });
  }

  function renderFilterList(entries) {
    if (!filterListEl) return;
    filterListEl.innerHTML = "";
    var g = groupByClub(entries);
    g.names.forEach(function(clubName, ci) {
      var sect = document.createElement("section");
      sect.className = "fw-filter-club";
      sect.id = "fw-filter-club-sect-" + ci;

      var h3 = document.createElement("h3");
      h3.className = "fw-filter-club-name fw-filter-club-name--sel";
      var lab = document.createElement("label");
      lab.className = "fw-filter-club-name__label";
      var cbWrap = document.createElement("span"); cbWrap.className = "fw-filter-club-name__cb";
      var clubCb = document.createElement("input"); clubCb.type = "checkbox";
      clubCb.setAttribute("data-fw-club","1");
      clubCb.setAttribute("aria-label","Zaznacz wszystkich z: " + clubName);
      cbWrap.appendChild(clubCb);
      var titleSpan = document.createElement("span"); titleSpan.className = "fw-filter-club-name__title";
      titleSpan.textContent = clubName;
      lab.appendChild(cbWrap); lab.appendChild(titleSpan);
      h3.appendChild(lab); sect.appendChild(h3);

      g.byClub[clubName].forEach(function(item) {
        var row = document.createElement("div"); row.className = "fw-filter-row";
        var txt = document.createElement("div"); txt.className = "fw-filter-row__text";
        var nm = document.createElement("div"); nm.className = "fw-filter-row__name"; nm.textContent = item.name;
        txt.appendChild(nm);
        if (item.category) {
          var mt = document.createElement("div"); mt.className = "fw-filter-row__meta"; mt.textContent = item.category;
          txt.appendChild(mt);
        }
        var cbD = document.createElement("div"); cbD.className = "fw-filter-row__cb";
        var cb = document.createElement("input"); cb.type = "checkbox";
        cb.value = item.publicId;
        cb.setAttribute("data-fw-member","1");
        cbD.appendChild(cb);
        row.appendChild(txt); row.appendChild(cbD);
        sect.appendChild(row);
      });

      filterListEl.appendChild(sect);
    });
    rebuildClubJump(g.names);
  }

  function syncCheckboxesFromUrl() {
    if (!filterListEl) return;
    var idSet = getFilterSet();
    filterListEl.querySelectorAll('input[data-fw-member]').forEach(function(cb) {
      cb.checked = Boolean(idSet && idSet[cb.value]);
    });
    refreshClubHeaders();
  }

  function membersInSection(sect) { return sect.querySelectorAll('input[data-fw-member]'); }
  function clubCbInSection(sect)  { return sect.querySelector('input[data-fw-club]'); }

  function refreshClubHeader(sect) {
    var hdr = clubCbInSection(sect); if (!hdr) return;
    var kids = membersInSection(sect);
    var total = kids.length, checked = 0;
    kids.forEach(function(k){ if(k.checked) checked++; });
    hdr.indeterminate = checked > 0 && checked < total;
    hdr.checked = total > 0 && checked === total;
  }
  function refreshClubHeaders() {
    if (!filterListEl) return;
    filterListEl.querySelectorAll(".fw-filter-club").forEach(refreshClubHeader);
  }

  function onFilterListChange(ev) {
    var t = ev.target;
    if (!t || t.type !== "checkbox" || !filterListEl || !filterListEl.contains(t)) return;
    var sect = t.closest(".fw-filter-club"); if (!sect) return;
    if (t.hasAttribute("data-fw-club")) {
      t.indeterminate = false;
      membersInSection(sect).forEach(function(k){ k.checked = t.checked; });
    } else {
      refreshClubHeader(sect);
    }
  }

  function collectChecked() {
    if (!filterListEl) return [];
    var seen = Object.create(null), order = [];
    filterListEl.querySelectorAll('input[data-fw-member]:checked').forEach(function(cb) {
      if (cb.value && !seen[cb.value]) { seen[cb.value] = true; order.push(cb.value); }
    });
    return order;
  }

  function applyFilter() {
    var ids = collectChecked();
    setFilterInUrl(ids);
    closeFilterPanel();
    if (lastFightsData) renderFights(lastFightsData);
  }

  function openFilterPanel() {
    filterPanelOpen = true;
    if (filterRootEl) filterRootEl.classList.add("is-open");
    if (filterPanelEl) { filterPanelEl.classList.remove("is-hidden"); filterPanelEl.setAttribute("aria-hidden","false"); }
    if (mobileBarEl) { mobileBarEl.classList.add("is-visible"); mobileBarEl.setAttribute("aria-hidden","false"); }
    if (filterBtnLabel) filterBtnLabel.textContent = "Ukryj filtr";
  }
  function closeFilterPanel() {
    filterPanelOpen = false;
    closeClubJump();
    if (filterRootEl) filterRootEl.classList.remove("is-open");
    if (filterPanelEl) { filterPanelEl.classList.add("is-hidden"); filterPanelEl.setAttribute("aria-hidden","true"); }
    if (mobileBarEl) { mobileBarEl.classList.remove("is-visible"); mobileBarEl.setAttribute("aria-hidden","true"); }
    if (filterStatusEl) filterStatusEl.textContent = "";
    if (filterBtnLabel) filterBtnLabel.textContent = "Filtruj zawodników";
  }
  function toggleFilter() {
    if (!filterPanelOpen) {
      openFilterPanel();
      ensureStartingList().then(function(entries) {
        if (filterStatusEl) filterStatusEl.textContent = "";
        renderFilterList(entries);
        syncCheckboxesFromUrl();
      }).catch(function(err) {
        if (filterStatusEl) filterStatusEl.textContent = "Błąd: " + (err.message || err);
        if (filterListEl) filterListEl.innerHTML = "";
        closeClubJump();
        if (clubJumpWrapEl) clubJumpWrapEl.classList.add("is-hidden");
      });
    } else {
      closeFilterPanel();
    }
  }

  /* ─────────────────────────────────────────────
     SPRAWDZANIE CZASU I WYSYŁANIE ALERTÓW
  ───────────────────────────────────────────── */

  /**
   * Dla każdej obserwowanej walki sprawdza czy należy wysłać alert 30 lub 5 min.
   * Wywołuj po każdym renderFights.
   */
  function checkAlerts(rows, idSet) {
    if (!idSet) return; /* brak filtra = brak alertów */
    var now = Date.now();

    rows.forEach(function(row) {
      if (!fightMatchesFilter(row, idSet)) return;
      var pf = row.publicFight; if (!pf) return;
      var fightId = pf.id;
      var t = parseStartTimeUtc(row.startTime);
      if (!t || isNaN(t.getTime())) return;
      var ms = t.getTime() - now;
      if (ms < 0) return; /* walka już minęła */

      var a = pf.firstCompetitor  && pf.firstCompetitor.publicId;
      var b = pf.secondCompetitor && pf.secondCompetitor.publicId;
      if (!((a && idSet[a]) || (b && idSet[b]))) return;

      var nameA = competitorName(pf.firstCompetitor);
      var nameB = competitorName(pf.secondCompetitor);
      var fightLabel = nameA + " vs. " + nameB;
      var timeStr = timeFmt.format(t);

      /* Alert 30 minut: okno 29–31 min (żeby nie przeoczyć przy odświeżeniu co 30 sek.) */
      var MIN30 = 30 * 60 * 1000;
      var MIN5  =  5 * 60 * 1000;
      var WINDOW = 90 * 1000; /* ±90 sek. tolerancji */

      if (!alertedAt30[fightId] && ms >= MIN30 - WINDOW && ms <= MIN30 + WINDOW) {
        alertedAt30[fightId] = true;
        sendAlert("30", fightLabel, timeStr);
      }
      if (!alertedAt5[fightId] && ms >= MIN5 - WINDOW && ms <= MIN5 + WINDOW) {
        alertedAt5[fightId] = true;
        sendAlert("5", fightLabel, timeStr);
      }
    });
  }

  /* ─────────────────────────────────────────────
     RENDER WALK
  ───────────────────────────────────────────── */

  function buildAthleteEl(c, corner, idSet) {
    var wrap = document.createElement("div");
    wrap.className = "fw-athlete fw-athlete--" + corner;
    var cornerEl = document.createElement("div");
    cornerEl.className = "fw-athlete__corner";
    cornerEl.setAttribute("aria-hidden","true");
    var main = document.createElement("div");
    main.className = "fw-athlete__main";

    var line1 = document.createElement("div");
    line1.className = "fw-athlete__line1";

    var flag = flagEmoji(c && c.nationality);
    if (flag) {
      var fs = document.createElement("span"); fs.className = "fw-athlete__flag"; fs.textContent = flag;
      line1.appendChild(fs);
    }

    var nm = document.createElement("span");
    nm.className = "fw-athlete__name";
    var dn = competitorName(c);
    nm.textContent = dn;
    if (/^--/.test(String(dn).trim())) nm.classList.add("fw-athlete__name--placeholder");
    line1.appendChild(nm);

    /* złota kropka jeśli to obserwowany zawodnik */
    if (idSet && c && c.publicId && idSet[c.publicId]) {
      var dot = document.createElement("span");
      dot.className = "fw-athlete__watch-dot";
      dot.title = "Śledzony zawodnik";
      line1.appendChild(dot);
    }

    main.appendChild(line1);

    var club = competitorClub(c);
    if (club) {
      var cl = document.createElement("div"); cl.className = "fw-athlete__club"; cl.textContent = club;
      main.appendChild(cl);
    }

    wrap.appendChild(cornerEl);
    wrap.appendChild(main);
    return wrap;
  }

  function renderFights(data) {
    if (!listEl) return;
    lastFightsData = data;
    listEl.innerHTML = "";

    var idSet = getFilterSet();
    var queue = data.fightQueueStatuses || {};
    var allRows = (data.result || []).slice().sort(function(a,b) {
      return sortKeyStartTime(a.startTime) - sortKeyStartTime(b.startTime);
    });
    var rows = allRows.filter(function(row){ return fightMatchesFilter(row, idSet); });

    /* sprawdź alerty */
    checkAlerts(allRows, idSet);

    rows.forEach(function(row, idx) {
      var pf = row.publicFight; if (!pf) return;
      var fightId = pf.id;
      var matId   = pf.matId;
      var variant = rowHeadVariant(fightId, matId, queue);
      var matName = buildMatName(matNamesById[String(matId)], matId);

      /* oblicz czy za 30 lub 5 minut (do wyróżnienia karty) */
      var t = parseStartTimeUtc(row.startTime);
      var ms = t ? t.getTime() - Date.now() : Infinity;
      var WINDOW = 90 * 1000;
      var isAlert30 = idSet && ms >= 29.5*60000 && ms <= 30.5*60000 + WINDOW && fightMatchesFilter(row,idSet);
      var isAlert5  = idSet && ms >= 4.5*60000  && ms <= 5.5*60000  + WINDOW && fightMatchesFilter(row,idSet);
      var isWatched = idSet && fightMatchesFilter(row, idSet);

      var article = document.createElement("article");
      article.className = "fw-fight" +
        (isAlert5  ? " fw-fight--alert-5"  :
         isAlert30 ? " fw-fight--alert-30" :
         isWatched ? " fw-fight--watched"  : "");

      /* head */
      var head = document.createElement("div");
      head.className = "fw-fight__head fw-fight__head--" + variant;

      var numCol = document.createElement("div"); numCol.className = "fw-fight__num-col";
      var num = pf.fightNumber != null ? pf.fightNumber : idx + 1;
      var numEl = document.createElement("div"); numEl.className = "fw-fight__num"; numEl.textContent = "#" + num;
      var pip = document.createElement("div"); pip.className = "fw-fight__status-pip";
      numCol.appendChild(numEl); numCol.appendChild(pip);
      head.appendChild(numCol);

      var info = document.createElement("div"); info.className = "fw-fight__info";
      var timeRow = document.createElement("div"); timeRow.className = "fw-fight__time-row";
      var timeEl = document.createElement("span"); timeEl.className = "fw-fight__time";
      timeEl.textContent = t && !isNaN(t.getTime()) ? timeFmt.format(t) : "—";
      timeRow.appendChild(timeEl);
      var cat = formatCat(pf.category);
      if (cat) {
        var catEl = document.createElement("span"); catEl.className = "fw-fight__cat"; catEl.textContent = cat;
        timeRow.appendChild(catEl);
      }
      info.appendChild(timeRow);
      var badgesEl = document.createElement("div"); badgesEl.className = "fw-fight__badges";
      roundBadges(pf).forEach(function(b) {
        var badge = document.createElement("span");
        badge.className = "fw-badge fw-badge--" + b.v; badge.textContent = b.text;
        badgesEl.appendChild(badge);
      });
      if (isAlert5 || isAlert30) {
        var ab = document.createElement("span");
        ab.className = "fw-fight__alert-badge fw-fight__alert-badge--" + (isAlert5 ? "5" : "30");
        ab.textContent = isAlert5 ? "⚔️ 5 MIN!" : "⏰ 30 MIN";
        badgesEl.appendChild(ab);
      }
      if (badgesEl.children.length) info.appendChild(badgesEl);
      head.appendChild(info);

      var matCol = document.createElement("div"); matCol.className = "fw-fight__mat-col";
      var matLab = document.createElement("div"); matLab.className = "fw-fight__mat-label"; matLab.textContent = "mata";
      var matVal = document.createElement("div"); matVal.className = "fw-fight__mat-val";
      matVal.textContent = matName.replace(/^mata\s*/i, "").trim() || matName;
      matCol.appendChild(matLab); matCol.appendChild(matVal);
      head.appendChild(matCol);

      var body = document.createElement("div"); body.className = "fw-fight__body";
      body.appendChild(buildAthleteEl(pf.firstCompetitor,  "blue", idSet));
      body.appendChild(buildAthleteEl(pf.secondCompetitor, "red",  idSet));

      article.appendChild(head); article.appendChild(body);
      listEl.appendChild(article);
    });

    if (toolbarEl) {
      toolbarEl.classList.remove("is-hidden");
      var total = allRows.length, shown = rows.length;
      var parts = [];
      if (idSet) parts.push("Walki: " + shown + " z " + total + " (filtr aktywny)");
      else parts.push("Wszystkie walki: " + total);
      parts.push("Odświeżenie: " + timeFmt.format(new Date()) + " (co " + Math.round(cfg.currentMatchesRefreshMs/1000) + " s)");
      toolbarEl.textContent = parts.join(" · ");
    }
  }

  /* ─────────────────────────────────────────────
     FETCH + POLLING
  ───────────────────────────────────────────── */

  function fetchJson(path) {
    return fetch(cfg.url(path), { credentials:"omit", headers:{ Accept:"application/json" } })
      .then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  function showError(msg) {
    if (placeholderEl) placeholderEl.classList.add("is-hidden");
    if (toolbarEl) toolbarEl.classList.add("is-hidden");
    if (listEl) listEl.innerHTML = "";
    if (errEl) { errEl.textContent = msg; errEl.classList.remove("is-hidden"); }
  }
  function clearError() { if (errEl) { errEl.textContent = ""; errEl.classList.add("is-hidden"); } }

  function loadFights() {
    return fetchJson("/api/public/events/" + encodeURIComponent(eventNumericId) + "/fights")
      .then(function(data){ clearError(); renderFights(data); });
  }

  function startPolling() {
    if (pollTimerId) clearInterval(pollTimerId);
    pollTimerId = setInterval(function(){
      loadFights().catch(function(){});
    }, cfg.currentMatchesRefreshMs || 30000);
  }

  /* ─────────────────────────────────────────────
     INICJALIZACJA
  ───────────────────────────────────────────── */

  if (!evSlug || !eventNumericId) {
    if (placeholderEl) placeholderEl.classList.add("is-hidden");
    showError("Brak parametru slug w URL (np. ?slug=628-…). Wróć do listy zawodów i kliknij event.");
    return;
  }

  if (filterRootEl) filterRootEl.classList.remove("is-hidden");

  /* eventy filtra */
  if (filterMainBtn)  filterMainBtn.addEventListener("click", toggleFilter);
  if (applyDesktopBtn) applyDesktopBtn.addEventListener("click", applyFilter);
  if (applyMobileBtn)  applyMobileBtn.addEventListener("click", applyFilter);
  if (filterListEl)    filterListEl.addEventListener("change", onFilterListChange);
  if (clubJumpToggleBtn) {
    clubJumpToggleBtn.addEventListener("click", function(e){ e.stopPropagation(); toggleClubJump(); });
  }
  if (clubJumpListEl) {
    clubJumpListEl.addEventListener("click", function(e) {
      var li = e.target.closest("li.fw-club-jump__option"); if (!li) return;
      var idx = li.dataset.idx; closeClubJump();
      var sect = document.getElementById("fw-filter-club-sect-" + idx);
      if (sect) sect.scrollIntoView({ behavior:"smooth", block:"start" });
    });
  }

  /* jeśli jest filtr w URL, od razu prefetchuj listę startową */
  if (getFilterSet()) {
    ensureStartingList().catch(function(){});
  }

  clearError();

  /* pobranie harmonogramu mat, potem walk, potem polling */
  fetchJson("/api/events/" + encodeURIComponent(eventNumericId) + "/schedules")
    .then(function(sched){ matNamesById = buildMatMap(sched); })
    .catch(function(){ matNamesById = Object.create(null); })
    .then(function(){
      if (placeholderEl) placeholderEl.classList.add("is-hidden");
      return loadFights();
    })
    .catch(function(err){ showError("Nie udało się pobrać walk: " + (err.message || err)); })
    .then(function(){ startPolling(); });

  window.addEventListener("pagehide", function(){
    if (pollTimerId) clearInterval(pollTimerId);
  });

})();
