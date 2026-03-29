(function () {
  "use strict";
  var cfg = window.MM_CONFIG;
  if (!cfg) { console.error("MM_CONFIG missing"); return; }

  var listEl   = document.getElementById("fw-events-list");
  var statusEl = document.getElementById("fw-status");

  var KNOWN_TAGS = {
    Grappling:1,BjjGi:1,BjjNoGi:1,MMA:1,CombatJuJutsu:1,
    ADCC:1,Sambo:1,Judo:1,SubmissionOnly:1,Kickboxing:1,
    Boxing:1,Wrestling:1,MuayThai:1,Taekwondo:1,
  };

  var MONTHS_NOM = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  var DOW = ["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];
  var MONTHS_IDX = {
    stycznia:0,lutego:1,marca:2,kwietnia:3,maja:4,czerwca:5,
    lipca:6,sierpnia:7,września:8,wrzesnia:8,października:9,
    pazdziernika:9,listopada:10,grudnia:11,
  };

  function setStatus(msg, err) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("fw-status--error", !!err);
  }

  function flagEmoji(code) {
    if (!code || String(code).length !== 2) return "";
    var c = String(code).toUpperCase();
    var base = 0x1f1e6 - 0x41;
    return String.fromCodePoint(base + c.charCodeAt(0), base + c.charCodeAt(1));
  }

  function parseDate(txt) {
    if (!txt) return null;
    var s = txt.replace(/\s+/g," ").replace(/[.,;]+$/,"").trim();
    var m = s.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
    if (!m) return null;
    var mi = MONTHS_IDX[m[2].toLowerCase()];
    if (mi === undefined) return null;
    return new Date(parseInt(m[3],10), mi, parseInt(m[1],10), 12, 0, 0);
  }

  function isToday(d) {
    var n = new Date();
    return d && d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
  }

  function parseReg(row) {
    var pad = row.querySelector(".has-added-padding");
    if (!pad) return null;
    var ed = pad.querySelector(".event-date");
    var rw = ed && ed.nextElementSibling;
    if (!rw) return null;
    var inner = rw.querySelector("span.has-text-success,span.has-text-info,span.has-text-warning");
    if (!inner) return null;
    var txt = inner.textContent.replace(/\s+/g," ").trim();
    var cls = inner.className || "";
    if (cls.indexOf("has-text-warning") !== -1) return {kind:"closed",text:txt};
    if (cls.indexOf("has-text-info") !== -1) return {kind:"start",text:txt};
    if (cls.indexOf("has-text-success") !== -1) return {kind:/Trwające/i.test(txt)?"ongoing":"end",text:txt};
    return null;
  }

  function parsePlaceFlag(row) {
    var marker = row.querySelector(".fa-map-marker-alt");
    var lr = marker && marker.closest(".is-size-6");
    var cc = "", place = "";
    if (!lr) return {countryCode:cc,place};
    var fe = lr.querySelector("i.flag-icon");
    if (fe) fe.classList.forEach(function(c){ var m=/^flag-icon-([a-z]{2})$/i.exec(c); if(m) cc=m[1].toLowerCase(); });
    lr.querySelectorAll("span").forEach(function(sp){
      if (sp.querySelector(".fa-map-marker-alt")||sp.querySelector("i.flag-icon")) return;
      var t=sp.textContent.replace(/\s+/g," ").trim();
      if (t&&t.length<120) place=t;
    });
    return {countryCode:cc,place};
  }

  function parseTags(row) {
    var out=[];
    row.querySelectorAll(".tag.is-event-type").forEach(function(el){
      var key="";
      el.classList.forEach(function(c){ if(c!=="tag"&&c!=="is-event-type") key=c; });
      if (!key) return;
      out.push({key,label:el.textContent.replace(/\s+/g," ").trim()||key});
    });
    return out;
  }

  function parseEventsDoc(doc) {
    var links=doc.querySelectorAll("a.event-image-link[href*='/events/']");
    var out=[],seen=Object.create(null);
    links.forEach(function(a){
      var href=a.getAttribute("href")||"";
      var pm=href.match(/\/events\/([^/?#]+)/);
      if (!pm) return;
      var parsed=cfg.parseEventSlug(pm[1]);
      if (!parsed||seen[parsed.slug]) return;
      seen[parsed.slug]=true;
      var row=a.closest("div.columns.is-centered.is-gapless");
      if (!row) return;
      var titleEl=row.querySelector("a.has-text-white");
      var img=a.querySelector("img.event-thumbnail");
      var dateEl=row.querySelector(".event-date");
      var dateText=dateEl?dateEl.textContent.replace(/\s+/g," ").replace(/Data zawodów:\s*/i,"").trim():"";
      var pf=parsePlaceFlag(row);
      var reg=parseReg(row);
      var parsedDay=parseDate(dateText);
      if (parsedDay&&isToday(parsedDay)) reg={kind:"ongoing",text:"Trwające zawody"};
      out.push({
        slug:parsed.slug,numericId:parsed.numericId,
        title:titleEl?titleEl.textContent.replace(/\s+/g," ").trim():"Zawody "+parsed.numericId,
        thumb:img?(img.getAttribute("src")||"").trim():"",
        dateText,parsedDay,
        place:pf.place,countryCode:pf.countryCode,
        registration:reg,tags:parseTags(row),
      });
    });
    return out;
  }

  function groupByMonth(events) {
    var groups=[],keyMap=Object.create(null);
    events.forEach(function(ev){
      var key,label;
      if (ev.parsedDay) {
        var m=ev.parsedDay.getMonth(),y=ev.parsedDay.getFullYear();
        key=y+"-"+m; label=MONTHS_NOM[m]+" "+y;
      } else { key="?"; label="Brak daty"; }
      if (!keyMap[key]) { keyMap[key]={label,events:[]}; groups.push(keyMap[key]); }
      keyMap[key].events.push(ev);
    });
    return groups;
  }

  function regShort(reg) {
    if (!reg) return null;
    if (reg.kind==="ongoing") return "Trwające";
    if (reg.kind==="closed") return "Rejestracja zamknięta";
    var ms=reg.text.match(/:\s*(.+)$/);
    return ms?reg.text.replace(ms[1],"").trim()+" "+ms[1].trim():reg.text;
  }

  function renderEvents(events) {
    if (!listEl) return;
    listEl.innerHTML="";
    var groups=groupByMonth(events);

    groups.forEach(function(group){
      /* separator */
      var sep=document.createElement("div");
      sep.className="fw-month-sep";
      sep.textContent=group.label;
      listEl.appendChild(sep);

      group.events.forEach(function(ev){
        var href=cfg.withModeQuery("current-matches/?slug="+encodeURIComponent(ev.slug));
        var card=document.createElement("a");
        card.className="fw-event-card";
        card.href=href;

        /* ── miniaturka z nakładką daty ── */
        var thumbWrap=document.createElement("div");
        thumbWrap.className="fw-event-thumb-wrap";

        var img=document.createElement("img");
        img.className="fw-event-thumb";
        img.alt=""; img.loading="lazy";
        img.src=ev.thumb||"";
        img.onerror=function(){ img.style.visibility="hidden"; };
        thumbWrap.appendChild(img);

        /* nakładka daty na miniaturce */
        var dateBadge=document.createElement("div");
        var today=ev.parsedDay&&isToday(ev.parsedDay);
        dateBadge.className="fw-thumb-date"+(today?" fw-thumb-date--today":"");

        var dayEl=document.createElement("span");
        dayEl.className="fw-thumb-date__day";
        dayEl.textContent=ev.parsedDay?ev.parsedDay.getDate():"?";

        var dowEl=document.createElement("span");
        dowEl.className="fw-thumb-date__dow";
        dowEl.textContent=ev.parsedDay?DOW[ev.parsedDay.getDay()]:"—";

        dateBadge.appendChild(dayEl);
        dateBadge.appendChild(dowEl);
        thumbWrap.appendChild(dateBadge);

        /* ── body ── */
        var body=document.createElement("div");
        body.className="fw-event-body";

        var titleEl2=document.createElement("div");
        titleEl2.className="fw-event-title";
        titleEl2.textContent=ev.title;
        body.appendChild(titleEl2);

        /* wiersz 2: miejsce + separator + rejestracja */
        var row2=document.createElement("div");
        row2.className="fw-event-row2";

        if (ev.place||ev.countryCode) {
          var placeEl=document.createElement("span");
          placeEl.className="fw-event-place";
          if (ev.countryCode) {
            var fl=document.createElement("span");
            fl.setAttribute("aria-hidden","true");
            fl.textContent=flagEmoji(ev.countryCode);
            placeEl.appendChild(fl);
          }
          var cityEl=document.createElement("span");
          cityEl.textContent=ev.place||"";
          placeEl.appendChild(cityEl);
          row2.appendChild(placeEl);
        }

        if (ev.registration) {
          if (row2.children.length) {
            var sep2=document.createElement("span");
            sep2.className="fw-dot-sep"; sep2.textContent="·";
            row2.appendChild(sep2);
          }
          var regEl=document.createElement("span");
          regEl.className="fw-ev-reg fw-ev-reg--"+ev.registration.kind;
          var rt=regShort(ev.registration);
          if (rt) regEl.textContent=rt;
          row2.appendChild(regEl);
        }

        if (row2.children.length) body.appendChild(row2);

        /* tagi */
        if (ev.tags&&ev.tags.length) {
          var tagRoot=document.createElement("div");
          tagRoot.className="fw-ev-tags";
          ev.tags.forEach(function(t){
            var sp=document.createElement("span");
            sp.className="fw-tag fw-tag--"+(KNOWN_TAGS[t.key]?t.key:"default");
            sp.textContent=t.label;
            tagRoot.appendChild(sp);
          });
          body.appendChild(tagRoot);
        }

        card.appendChild(thumbWrap);
        card.appendChild(body);
        listEl.appendChild(card);
      });
    });
  }

  function load() {
    setStatus("Ładowanie…");
    fetch(cfg.url("/pl/events"),{credentials:"omit",headers:{Accept:"text/html"}})
      .then(function(r){ if (!r.ok) throw new Error("HTTP "+r.status); return r.text(); })
      .then(function(html){
        var doc=new DOMParser().parseFromString(html,"text/html");
        var events=parseEventsDoc(doc);
        if (!events.length){ setStatus("Brak zawodów lub zmienił się format strony.",true); return; }
        setStatus("Zawody: "+events.length);
        renderEvents(events);
      })
      .catch(function(err){ setStatus("Błąd: "+(err.message||err),true); });
  }

  document.addEventListener("DOMContentLoaded",load);
})();
