(function(){
  "use strict";

  var ORIGINAL = {
    guestCount: 200,
    totalBudget: 280000,
    contingencyPct: 8,
    plannerPct: 15,
    categories: [
      { key:"venue",    name:"Venue", low:97295.02, high:109118.21, status:"Confirmed",
        note:"Low = 180 guests (hotel math, minimum credit applied). High = 200 guests (actual spend, no credit)." },
      { key:"catering", name:"Catering", low:0, high:0, status:"Included",
        note:"Billed through the Venue's hybrid package — kept at $0 to avoid double-counting." },
      { key:"bar",      name:"Bar", low:0, high:0, status:"Included",
        note:"4-hour hosted bar is part of the Venue package." },
      { key:"cake",     name:"Cake & Desserts", low:12000, high:15000, status:"Updated" },
      { key:"rentals",  name:"Rentals", low:10000, high:15000, status:"Updated" },
      { key:"floral",   name:"Floral Design", low:35000, high:55000, status:"Updated" },
      { key:"decor",    name:"Decor & Production", low:8750, high:10500, status:"Draft" },
      { key:"lighting", name:"Lighting", low:6250, high:7500, status:"Draft" },
      { key:"entertainment", name:"Entertainment", low:15000, high:18000, status:"Updated" },
      { key:"photo",    name:"Photography & Videography", low:35000, high:40000, status:"Updated" },
      { key:"stationery", name:"Stationery & Signage", low:3250, high:3900, status:"Draft" },
      { key:"attire",   name:"Attire & Beauty", low:7500, high:9000, status:"Draft" },
      { key:"gifts",    name:"Gifts & Favors", low:4000, high:6000, status:"Updated" },
      { key:"sofreh",   name:"Cultural / Sofreh Aghd Elements", low:7000, high:7000, status:"Confirmed" }
    ]
  };

  var STORAGE_KEY = "mdlf_setareh_adam_budget_v1";

  function cloneOriginal(){
    return JSON.parse(JSON.stringify(ORIGINAL));
  }

  function loadState(){
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return cloneOriginal();

      var parsed = JSON.parse(saved);
      if (!parsed || !Array.isArray(parsed.categories)) return cloneOriginal();

      // Merge saved values into the current structure so future HTML updates stay compatible.
      var fresh = cloneOriginal();
      fresh.guestCount = Number(parsed.guestCount) > 0 ? Number(parsed.guestCount) : fresh.guestCount;
      fresh.totalBudget = Number(parsed.totalBudget) >= 0 ? Number(parsed.totalBudget) : fresh.totalBudget;
      fresh.contingencyPct = Number(parsed.contingencyPct) >= 0 ? Number(parsed.contingencyPct) : fresh.contingencyPct;
      fresh.plannerPct = Number(parsed.plannerPct) >= 0 ? Number(parsed.plannerPct) : fresh.plannerPct;

      var savedByKey = {};
      parsed.categories.forEach(function(c){
        if (c && c.key) savedByKey[c.key] = c;
      });
      fresh.categories.forEach(function(c){
        var savedCat = savedByKey[c.key];
        if (!savedCat) return;
        if (Number(savedCat.low) >= 0) c.low = Number(savedCat.low);
        if (Number(savedCat.high) >= 0) c.high = Number(savedCat.high);
      });
      return fresh;
    } catch (e) {
      return cloneOriginal();
    }
  }

  function saveState(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      announceStatus("Saved");
    } catch (e) {
      // If storage is unavailable, the planner still works normally for this session.
    }
  }

  function clearSavedState(){
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  var state = loadState();

  var fmtUSD0 = new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 });
  var fmtUSD2 = new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:2, maximumFractionDigits:2 });
  var fmtPct1 = function(x){ return (x*100).toFixed(1) + "%"; };

  var body = document.getElementById("categoryBody");
  var chartEl = document.getElementById("chart");

  /* ---------- fix #2: status -> badge color mapping ---------- */
  function statusBadgeClass(status){
    if (status === "Confirmed") return "status-confirmed";
    if (status === "Draft") return "status-draft";
    if (status === "Updated") return "status-updated";
    if (status === "Included") return "included";
    return "status-updated";
  }

  function buildRows(){
    body.innerHTML = "";
    state.categories.forEach(function(cat, i){
      var tr = document.createElement("tr");

      // "Included" just labels how a category is currently billed (bundled into the
      // Venue package) — it's still a real number the couple may want to adjust
      // later, so it stays a normal editable field like every other category.
      var lowCell = '<td class="num" data-label="Low"><div class="cell-currency"><span>$</span><input type="number" step="50" min="0" data-idx="' + i + '" data-field="low" value="' + cat.low + '"></div></td>';
      var highCell = '<td class="num" data-label="High"><div class="cell-currency"><span>$</span><input type="number" step="50" min="0" data-idx="' + i + '" data-field="high" value="' + cat.high + '"></div></td>';

      tr.innerHTML =
        '<td class="cat-name" data-label="Category">' + cat.name + (cat.note ? '<span class="cat-note">' + cat.note + '</span>' : '') + '</td>' +
        lowCell + highCell +
        '<td class="num pct" data-pct="' + i + '" data-label="% of budget">—</td>' +
        '<td data-label="Status"><span class="badge ' + statusBadgeClass(cat.status) + '">' + cat.status + '</span></td>';
      body.appendChild(tr);
    });
    body.querySelectorAll("input").forEach(function(inp){
      inp.addEventListener("input", function(){
        var idx = +inp.getAttribute("data-idx");
        var field = inp.getAttribute("data-field");
        var v = parseFloat(inp.value);
        state.categories[idx][field] = isNaN(v) ? 0 : v;
        recalc();
      });
    });
  }

  /* ---------- fix #3: debounced "value changed" highlight ---------- */
  var flashTargets = null;
  function getFlashTargets(){
    if (!flashTargets) {
      flashTargets = [
        document.querySelector(".readout-value"),
        document.getElementById("variancePill"),
        document.querySelector(".totals-row.emph .value")
      ].filter(Boolean);
    }
    return flashTargets;
  }
  var flashTimer = null;
  function scheduleFlash(){
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function(){
      getFlashTargets().forEach(function(el){
        el.classList.remove("flash");
        void el.offsetWidth; // force reflow so the animation restarts
        el.classList.add("flash");
      });
    }, 350);
  }

  /* ---------- fix #3: autosave status text ---------- */
  var saveStatusEl = document.getElementById("saveStatus");
  var saveStatusTimer = null;
  function announceStatus(text){
    if (!saveStatusEl) return;
    saveStatusEl.textContent = text;
    saveStatusEl.classList.remove("is-dim");
    saveStatusEl.classList.add("is-visible");
    clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(function(){
      saveStatusEl.classList.add("is-dim");
    }, 1800);
  }

  function recalc(shouldSave, shouldFlash){
    if (shouldSave === undefined) shouldSave = true;
    if (shouldFlash === undefined) shouldFlash = shouldSave;

    var totalBudget = state.totalBudget;
    var guestCount = state.guestCount || 1;

    var sumLow = 0, sumHigh = 0;
    state.categories.forEach(function(c){ sumLow += (+c.low || 0); sumHigh += (+c.high || 0); });

    var contingencyLow  = totalBudget * (state.contingencyPct / 100);
    var contingencyHigh = contingencyLow;

    var subtotalLow  = sumLow  + contingencyLow;
    var subtotalHigh = sumHigh + contingencyHigh;

    var plannerLow  = subtotalLow  * (state.plannerPct / 100);
    var plannerHigh = subtotalHigh * (state.plannerPct / 100);

    var totalLow  = subtotalLow  + plannerLow;
    var totalHigh = subtotalHigh + plannerHigh;

    var varianceLow  = totalBudget - totalLow;
    var varianceHigh = totalBudget - totalHigh;

    var costPerGuestLow  = totalLow  / guestCount;
    var costPerGuestHigh = totalHigh / guestCount;

    // per-category % of budget (avg of low/high vs total budget)
    body.querySelectorAll("[data-pct]").forEach(function(cell){
      var idx = +cell.getAttribute("data-pct");
      var c = state.categories[idx];
      var pct = totalBudget > 0 ? ((c.low + c.high) / 2) / totalBudget : 0;
      cell.textContent = fmtPct1(pct);
    });

    document.getElementById("contingencyLowOut").textContent  = fmtUSD0.format(contingencyLow);
    document.getElementById("contingencyHighOut").textContent = fmtUSD0.format(contingencyHigh);
    document.getElementById("subtotalLowOut").textContent  = fmtUSD0.format(subtotalLow);
    document.getElementById("subtotalHighOut").textContent = fmtUSD0.format(subtotalHigh);
    document.getElementById("subtotalPctOut").textContent  = totalBudget > 0 ? fmtPct1(((subtotalLow+subtotalHigh)/2)/totalBudget) : "—";
    document.getElementById("plannerLowOut").textContent  = fmtUSD0.format(plannerLow);
    document.getElementById("plannerHighOut").textContent = fmtUSD0.format(plannerHigh);
    document.getElementById("totalLowOut").textContent  = fmtUSD0.format(totalLow);
    document.getElementById("totalHighOut").textContent = fmtUSD0.format(totalHigh);
    document.getElementById("totalPctOut").textContent  = totalBudget > 0 ? fmtPct1(((totalLow+totalHigh)/2)/totalBudget) : "—";

    document.getElementById("totalRangeOut").textContent = fmtUSD0.format(totalLow) + " – " + fmtUSD0.format(totalHigh);

    document.getElementById("t-subtotal").textContent = fmtUSD0.format(subtotalLow) + " – " + fmtUSD0.format(subtotalHigh);
    document.getElementById("t-planner").textContent  = fmtUSD0.format(plannerLow) + " – " + fmtUSD0.format(plannerHigh);
    document.getElementById("t-total").textContent    = fmtUSD0.format(totalLow) + " – " + fmtUSD0.format(totalHigh);
    document.getElementById("t-budget").textContent   = fmtUSD0.format(totalBudget);
    document.getElementById("t-perguest").textContent = fmtUSD2.format(costPerGuestLow) + " – " + fmtUSD2.format(costPerGuestHigh);

    // Variance pill: use the worst case (High total) to decide status, show both ends
    var pill = document.getElementById("variancePill");
    var varText = document.getElementById("varianceText");
    var tVariance = document.getElementById("t-variance");
    pill.classList.remove("is-good", "is-warning", "is-critical");
    var pctOverHigh = totalBudget > 0 ? (totalHigh - totalBudget) / totalBudget : 0;
    var label, cls;
    if (varianceLow >= 0 && varianceHigh >= 0) {
      cls = "is-good"; label = "Under budget by " + fmtUSD0.format(Math.min(varianceLow, varianceHigh)) + "–" + fmtUSD0.format(Math.max(varianceLow, varianceHigh));
    } else if (pctOverHigh <= 0.05 && varianceLow >= 0) {
      cls = "is-warning"; label = "Within " + fmtUSD0.format(Math.abs(varianceHigh)) + " of budget at the high end";
    } else {
      cls = "is-critical";
      var lo = Math.min(varianceLow, varianceHigh), hi = Math.max(varianceLow, varianceHigh);
      if (hi <= 0) {
        label = "Over budget by " + fmtUSD0.format(Math.abs(hi)) + "–" + fmtUSD0.format(Math.abs(lo));
      } else {
        label = "Over budget by up to " + fmtUSD0.format(Math.abs(lo));
      }
    }
    pill.classList.add(cls);
    varText.textContent = label;
    tVariance.textContent = fmtUSD0.format(varianceLow) + " – " + fmtUSD0.format(varianceHigh);
    tVariance.style.color = cls === "is-good" ? "var(--good)" : (cls === "is-warning" ? "var(--warning)" : "var(--critical)");

    buildChart(contingencyLow, contingencyHigh, plannerLow, plannerHigh);

    if (shouldFlash) scheduleFlash();
    if (shouldSave) saveState();
  }

  function buildChart(contingencyLow, contingencyHigh, plannerLow, plannerHigh){
    var items = state.categories.map(function(c){
      return { name:c.name, avg:(c.low + c.high)/2 };
    });
    items.push({ name:"Contingency", avg:(contingencyLow+contingencyHigh)/2 });
    items.push({ name:"Planner & Coordination Fee", avg:(plannerLow+plannerHigh)/2 });
    items = items.filter(function(i){ return i.avg > 0; });
    items.sort(function(a,b){ return b.avg - a.avg; });
    var max = items.length ? items[0].avg : 1;

    chartEl.innerHTML = "";
    items.forEach(function(item, i){
      var row = document.createElement("div");
      row.className = "bar-item";
      var pct = max > 0 ? (item.avg / max) * 100 : 0;
      row.innerHTML =
        '<div class="bar-row">' +
          '<div class="bar-label"><b>' + item.name + '</b><span class="bar-value">' + fmtUSD0.format(item.avg) + '</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '</div>';
      chartEl.appendChild(row);
    });
  }

  document.getElementById("guestCount").addEventListener("input", function(e){
    var v = parseInt(e.target.value, 10);
    state.guestCount = isNaN(v) || v < 1 ? 1 : v;
    recalc();
  });
  document.getElementById("totalBudget").addEventListener("input", function(e){
    var v = parseFloat(e.target.value);
    state.totalBudget = isNaN(v) ? 0 : v;
    recalc();
  });
  document.getElementById("contingencyPct").addEventListener("input", function(e){
    var v = parseFloat(e.target.value);
    state.contingencyPct = isNaN(v) ? 0 : v;
    recalc();
  });
  document.getElementById("plannerPct").addEventListener("input", function(e){
    var v = parseFloat(e.target.value);
    state.plannerPct = isNaN(v) ? 0 : v;
    recalc();
  });

  /* ---------- fix #3: two-step confirm on Reset, so one accidental click can't wipe edits ---------- */
  var resetBtn = document.getElementById("resetBtn");
  var resetDefaultText = resetBtn.textContent;
  var resetArmed = false;
  var resetArmTimer = null;

  function disarmReset(){
    resetArmed = false;
    clearTimeout(resetArmTimer);
    resetBtn.textContent = resetDefaultText;
    resetBtn.classList.remove("is-armed");
  }

  resetBtn.addEventListener("click", function(){
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = "Click again to confirm reset";
      resetBtn.classList.add("is-armed");
      resetArmTimer = setTimeout(disarmReset, 4000);
      return;
    }

    disarmReset();
    state = cloneOriginal();
    clearSavedState();
    document.getElementById("guestCount").value = state.guestCount;
    document.getElementById("totalBudget").value = state.totalBudget;
    document.getElementById("contingencyPct").value = state.contingencyPct;
    document.getElementById("plannerPct").value = state.plannerPct;
    buildRows();
    recalc(false, true);
    announceStatus("Reset to original estimate");
  });

  // Restore saved values into the visible controls on page load.
  document.getElementById("guestCount").value = state.guestCount;
  document.getElementById("totalBudget").value = state.totalBudget;
  document.getElementById("contingencyPct").value = state.contingencyPct;
  document.getElementById("plannerPct").value = state.plannerPct;

  buildRows();
  recalc(false, false);
})();
