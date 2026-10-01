/* Family Budget Mini App */

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const state = {
  init: null,          // /api/init
  family: null,        // /api/family
  tab: "budget",
  chart: null,
  txType: "expense",
  category: "🍔 Еда",
  icon: "🍔",
};

const CATEGORIES = [
  ["🍔 Еда", "🍔"], ["🚗 Транспорт", "🚗"], ["🏠 Дом", "🏠"],
  ["🎉 Досуг", "🎉"], ["💊 Здоровье", "💊"], ["👕 Одежда", "👕"],
  ["📱 Связь", "📱"], ["📚 Образование", "📚"], ["🎁 Подарки", "🎁"],
  ["📦 Разное", "📦"],
];

function $(id) { return document.getElementById(id); }
function show(id) { $(id).style.display = id.endsWith("-inline") ? "inline-flex" : ""; }
function hide(id) { $(id).style.display = "none"; }

function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  setTimeout(() => { t.className = "toast"; }, 2200);
}

async function api(method, path, body) {
  const headers = { "X-Init-Data": tg?.initData || "" };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------- init ----------

async function boot() {
  if (!tg || !tg.initData) {
    hide("app-loading");
    $("app-error-msg").textContent = "Открой приложение через Telegram-бота";
    show("app-error");
    return;
  }
  try {
    state.init = await api("POST", "/api/init");

    const sub = state.init.subscription;
    if (sub.status === "expired") {
      $("paywall-date").textContent = `Истекла ${fmtDate(sub.subEnd)}`;
      hide("app-loading");
      show("app-paywall");
      return;
    }

    if (!state.init.family) {
      hide("app-loading");
      show("app-family-setup");
      return;
    }

    state.family = await api("GET", "/api/family");
    hide("app-loading");
    show("app-main");
    show("navBar");
    renderAll();
  } catch (e) {
    hide("app-loading");
    $("app-error-msg").textContent = "Ошибка: " + e.message;
    show("app-error");
  }
}

// ---------- family ----------

async function createFamily() {
  try {
    const r = await api("POST", "/api/family/create");
    toast("Семья создана · " + r.code);
    await boot();
  } catch (e) { toast(e.message, true); }
}

async function joinFamily() {
  const code = $("joinCodeInput").value.trim();
  if (!code) return toast("Введи код", true);
  try {
    await api("POST", "/api/family/join", { code });
    toast("Подключено!");
    await boot();
  } catch (e) { toast(e.message, true); }
}

// ---------- render ----------

function fmtDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = n => n < 10 ? "0" + n : n;
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}`;
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function txsArray() {
  const t = state.family?.transactions || {};
  return Object.entries(t).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function calcEnvelopeSpent(envId) {
  const ms = monthStart();
  return txsArray()
    .filter(t => t.envelopeId === envId && t.type === "expense" && t.ts >= ms)
    .reduce((s, t) => s + (t.amount || 0), 0);
}

function renderAll() {
  const txs = txsArray();
  const ms = monthStart();

  let balance = 0, income = 0, expense = 0;
  for (const t of txs) {
    const a = t.amount || 0;
    if (t.type === "income") { balance += a; if (t.ts >= ms) income += a; }
    else { balance -= a; if (t.ts >= ms) expense += a; }
  }

  $("totalBalance").textContent = fmtMoney(balance) + " ₴";
  $("monthIncome").textContent = "+" + fmtMoney(income) + " ₴";
  $("monthExpense").textContent = "-" + fmtMoney(expense) + " ₴";

  renderHistory(txs);
  renderEnvelopes();
  renderBanks();
  renderSettings();
  if (state.tab === "analytics") renderChart();
}

function fmtMoney(n) {
  return (Math.round(n * 100) / 100).toLocaleString("ru-RU");
}

function renderHistory(txs) {
  const box = $("historyContainer");
  if (!txs.length) {
    box.innerHTML = '<div class="muted" style="text-align:center;padding:15px">История пуста</div>';
    return;
  }
  box.innerHTML = txs.slice(0, 100).map(t => `
    <div class="history-item">
      <div class="history-left">
        <div class="history-icon">${iconOf(t.category)}</div>
        <div>
          <div class="history-title">${esc(t.note || t.category)}</div>
          <div class="history-sub">${esc(t.category)} · ${fmtDate(t.ts)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="history-amount ${t.type === 'income' ? 'inc' : 'exp'}">
          ${t.type === "income" ? "+" : "-"}${fmtMoney(t.amount || 0)} ₴
        </div>
        <button class="del-btn" onclick="deleteTx('${t.id}')"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
  `).join("");
}

function iconOf(cat) {
  const found = CATEGORIES.find(c => c[0] === cat);
  return found ? found[1] : "📦";
}

function esc(s) {
  return String(s || "").replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"}[c]));
}

function renderEnvelopes() {
  const box = $("envelopesList");
  const envs = Object.entries(state.family?.envelopes || {});
  if (!envs.length) {
    box.innerHTML = '<div class="muted" style="text-align:center;padding:15px">Конвертов нет</div>';
    return;
  }
  box.innerHTML = envs.map(([id, e]) => {
    const spent = calcEnvelopeSpent(id);
    const target = e.target || 0;
    const pct = target > 0 ? Math.min(100, Math.round(spent / target * 100)) : 0;
    const color = pct >= 100 ? "var(--danger)" : pct >= 80 ? "var(--warning)" : "var(--accent)";
    return `<div class="card">
      <div class="row-between" style="margin:0">
        <b>📩 ${esc(e.name)}</b>
        <span>${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="muted">${fmtMoney(spent)} / ${fmtMoney(target)} ₴</div>
    </div>`;
  }).join("");
}

function renderBanks() {
  const box = $("banksList");
  const banks = Object.entries(state.family?.banks || {});
  if (!banks.length) {
    box.innerHTML = '<div class="muted" style="text-align:center;padding:15px">Банок нет</div>';
    return;
  }
  box.innerHTML = banks.map(([id, b]) => {
    const balance = b.balance || 0;
    const target = b.target || 0;
    const pct = target > 0 ? Math.min(100, Math.round(balance / target * 100)) : 0;
    return `<div class="card">
      <div class="row-between" style="margin:0">
        <b>🏦 ${esc(b.name)}</b>
        <span>${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--success)"></div></div>
      <div class="row-between" style="margin:0">
        <span class="muted">${fmtMoney(balance)} / ${fmtMoney(target)} ₴</span>
        <button class="btn btn-success btn-sm" onclick="depositBank('${id}')">+ Пополнить</button>
      </div>
    </div>`;
  }).join("");
}

function renderSettings() {
  $("myFamilyCode").value = state.family?.code || "—";
  $("familyCount").textContent = Object.keys(state.family?.members || {}).length;
  const sub = state.init.subscription;
  $("subTariff").textContent = state.init.tariffs[sub.tariff]?.name || sub.tariff;
  $("subDays").textContent = sub.daysLeft + " дн.";
}

function renderChart() {
  const ctx = $("expensesChart")?.getContext("2d");
  if (!ctx) return;
  if (state.chart) state.chart.destroy();

  const ms = monthStart();
  const byCat = {};
  for (const t of txsArray()) {
    if (t.type !== "expense" || t.ts < ms) continue;
    byCat[t.category] = (byCat[t.category] || 0) + (t.amount || 0);
  }
  const labels = Object.keys(byCat);
  const data = Object.values(byCat);

  state.chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["Нет расходов"],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"],
      }],
    },
    options: { responsive: true, plugins: { legend: { labels: { color: "#fff" } } } },
  });
}

// ---------- tabs ----------

function switchTab(name) {
  state.tab = name;
  document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  $("tab-" + name).style.display = "block";
  document.querySelector(`.nav-item[data-tab="${name}"]`)?.classList.add("active");
  if (name === "analytics") renderChart();
}

// ---------- modals ----------

function openModal(id) { $(id).classList.add("active"); }
function closeModal(id) { $(id).classList.remove("active"); }

function openTxModal(type) {
  state.txType = type;
  $("txModalTitle").textContent = type === "expense" ? "Добавить расход" : "Добавить доход";
  $("txExpenseFields").style.display = type === "expense" ? "block" : "none";

  const grid = $("catGrid");
  if (!grid.children.length) {
    grid.innerHTML = CATEGORIES.map(([cat, ico], i) =>
      `<div class="icon-item ${i===0?'active':''}" data-cat="${cat}" data-ico="${ico}">${ico}</div>`
    ).join("");
    grid.querySelectorAll(".icon-item").forEach(el => {
      el.onclick = () => {
        grid.querySelectorAll(".icon-item").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        state.category = el.dataset.cat;
        state.icon = el.dataset.ico;
      };
    });
    state.category = CATEGORIES[0][0];
    state.icon = CATEGORIES[0][1];
  }

  const sel = $("txEnvelopeSelect");
  const envs = Object.entries(state.family?.envelopes || {});
  sel.innerHTML = '<option value="">Без конверта</option>' +
    envs.map(([id, e]) => `<option value="${id}">${esc(e.name)}</option>`).join("");

  $("txAmountInput").value = "";
  $("txCommentInput").value = "";
  openModal("modalTransaction");
}

async function submitTx() {
  const amount = parseFloat($("txAmountInput").value);
  if (!amount || amount <= 0) return toast("Введи сумму", true);
  const note = $("txCommentInput").value.trim();
  const envelopeId = $("txEnvelopeSelect").value;

  try {
    await api("POST", "/api/tx", {
      type: state.txType,
      amount,
      category: state.category,
      note,
      envelopeId,
    });
    closeModal("modalTransaction");
    await refresh();
    toast("Сохранено");
  } catch (e) { toast(e.message, true); }
}

async function deleteTx(id) {
  if (!confirm("Удалить операцию?")) return;
  try {
    await api("DELETE", `/api/tx/${id}`);
    await refresh();
    toast("Удалено");
  } catch (e) { toast(e.message, true); }
}

async function saveEnvelope() {
  const name = $("envNameInput").value.trim();
  const target = parseFloat($("envTargetInput").value) || 0;
  if (!name) return toast("Введи название", true);
  try {
    await api("POST", "/api/envelope", { name, target });
    closeModal("modalAddEnvelope");
    $("envNameInput").value = "";
    $("envTargetInput").value = "";
    await refresh();
    toast("Конверт создан");
  } catch (e) { toast(e.message, true); }
}

async function saveBank() {
  const name = $("bankNameInput").value.trim();
  const target = parseFloat($("bankTargetInput").value) || 0;
  if (!name) return toast("Введи название", true);
  try {
    await api("POST", "/api/bank", { name, target });
    closeModal("modalAddBank");
    $("bankNameInput").value = "";
    $("bankTargetInput").value = "";
    await refresh();
    toast("Банка создана");
  } catch (e) { toast(e.message, true); }
}

async function depositBank(id) {
  const val = prompt("Сумма пополнения:");
  if (!val) return;
  const amount = parseFloat(val);
  if (!amount || amount <= 0) return toast("Неверная сумма", true);
  try {
    await api("POST", `/api/bank/${id}/deposit`, { amount });
    await refresh();
    toast("Пополнено");
  } catch (e) { toast(e.message, true); }
}

function copyFamilyCode() {
  const el = $("myFamilyCode");
  el.select();
  navigator.clipboard.writeText(el.value);
  toast("Код скопирован");
}

// ---------- payment ----------

function openPayModal() {
  const tariffs = state.init?.tariffs || {};
  const box = $("tariffsList");
  box.innerHTML = Object.entries(tariffs).map(([key, t]) =>
    `<div class="tariff-card" data-plan="${key}">
      <span class="name">${esc(t.name)}</span>
      <span class="price">$${t.price}</span>
    </div>`
  ).join("");
  box.querySelectorAll(".tariff-card").forEach(el => {
    el.onclick = () => startPay(el.dataset.plan);
  });
  renderCouponsBox();
  openModal("modalPay");
}

function renderCouponsBox() {
  const c = state.init?.coupons || {};
  const free10 = Math.max(0, (c.c10 || 0) - (c.used10 || 0));
  const free20 = Math.max(0, (c.c20 || 0) - (c.used20 || 0));
  const box = $("couponsBox");
  if (!free10 && !free20) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <div class="muted" style="margin-top:12px">Купоны:</div>
    <div style="display:flex;gap:8px;margin-top:6px">
      ${free10 ? `<label class="tariff-card" style="flex:1;padding:8px;cursor:pointer">
        <input type="checkbox" id="use10" ${free10 ? '' : 'disabled'}> 10% × ${free10}
      </label>` : ""}
      ${free20 ? `<label class="tariff-card" style="flex:1;padding:8px;cursor:pointer">
        <input type="checkbox" id="use20" ${free20 ? '' : 'disabled'}> 20% × ${free20}
      </label>` : ""}
    </div>
    <div class="muted" style="font-size:11px;margin-top:6px">Макс. скидка за раз — 50%</div>
  `;
}

async function startPay(plan) {
  const use10 = $("use10")?.checked ? 1 : 0;
  const use20 = $("use20")?.checked ? 1 : 0;
  try {
    const r = await api("POST", "/api/pay/create", { plan, use10, use20 });
    if (r.invoiceUrl) {
      tg.openLink(r.invoiceUrl);
      closeModal("modalPay");
    }
  } catch (e) { toast(e.message, true); }
}

// ---------- refresh ----------

async function refresh() {
  try {
    state.init = await api("POST", "/api/init");
    state.family = await api("GET", "/api/family");
    renderAll();
  } catch (e) { toast(e.message, true); }
}

// ---------- go ----------

document.addEventListener("DOMContentLoaded", () => {
  // закрытие модалок по клику на фон
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m) m.classList.remove("active"); });
  });
  boot();
});
