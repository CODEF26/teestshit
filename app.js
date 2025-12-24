/***************
 * Codef Dashboard Frontend
 * - Bootstrap 5 + FA6 + SweetAlert2 + Chart.js
 * - RTL + Spinner
 * - Supports optional CORS proxy (Cloudflare Worker)
 ***************/

// ✅ رابط Google Apps Script Web App
const GAS_URL = "https://script.google.com/macros/s/AKfycbx3HJJs7J2QiUJJpl40hqHwHhHvSfN_kdA4PI8E4TlDUpv8oyZ0bpS3lPXHg_cbA__F/exec";

// ✅ (مُوصى به على GitHub Pages) ضع رابط Worker هنا، أو اتركه فارغًا
// مثال: "https://my-proxy.my-subdomain.workers.dev"
const WORKER_URL = "";

// سنة الخطة
const YEAR = 2026;

const overlay = (show) => {
  const el = document.getElementById("overlay");
  el.style.display = show ? "flex" : "none";
  el.setAttribute("aria-hidden", show ? "false" : "true");
};

const fmt = (n) => new Intl.NumberFormat("ar-SA").format(Number(n || 0));
const fmtPct = (n) => `${Number(n || 0).toFixed(2)}%`;

let barChart = null;
let lineChart = null;
let yearData = null;

document.getElementById("refreshBtn").addEventListener("click", () => init());

function buildMonthSelect(monthsFromApi) {
  const sel = document.getElementById("monthSelect");
  sel.innerHTML = "";

  // لو عندنا أسماء شهور من الـ API نستخدمها
  const months = (monthsFromApi && monthsFromApi.length === 12)
    ? monthsFromApi
    : Array.from({ length: 12 }, (_, i) => ({ month: i + 1, monthName: `شهر ${i + 1}` }));

  months.forEach(m => {
    const opt = document.createElement("option");
    opt.value = String(m.month || m.monthIndex || 1);
    opt.textContent = m.monthName || `شهر ${opt.value}`;
    sel.appendChild(opt);
  });

  sel.value = String(new Date().getMonth() + 1);
  sel.addEventListener("change", () => loadMonth(Number(sel.value)));
}

function buildProxyUrl(params) {
  // استخدام Worker: worker?url=GAS_URL&action=...&year=...
  if (WORKER_URL && WORKER_URL.trim()) {
    const qs = new URLSearchParams({ url: GAS_URL, ...params }).toString();
    return `${WORKER_URL}?${qs}`;
  }
  // تشغيل مباشر (قد يواجه CORS على GitHub)
  const qs = new URLSearchParams(params).toString();
  return `${GAS_URL}?${qs}`;
}

async function apiGet(params) {
  const url = buildProxyUrl(params);

  let res, text;
  try {
    res = await fetch(url, { method: "GET" });
    text = await res.text();
  } catch (err) {
    // غالبًا CORS: TypeError Failed to fetch
    throw new Error("فشل الاتصال بالـ API. إن كنت على GitHub Pages فعّل WORKER_URL لتجاوز CORS.");
  }

  // محاولة تحويل إلى JSON
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON", raw: text };
  }
}

async function init() {
  try {
    overlay(true);

    const yearRes = await apiGet({ action: "yearSummary", year: YEAR });
    if (!yearRes.ok) throw new Error(yearRes.error || "API error");

    yearData = yearRes.data;

    // تجهيز الشهر Select بأسماء الشهور من الشيت نفسها
    buildMonthSelect(yearData.months);

    renderYearKPIs(yearData.totals);
    renderMonthsTable(yearData.months);
    renderMonthsBar(yearData.months);

    await loadMonth(Number(document.getElementById("monthSelect").value));
  } catch (e) {
    Swal.fire({
      icon: "error",
      title: "تعذر تحميل البيانات",
      html: `
        <div style="text-align:right">
          <div>${escapeHtml(String(e.message || e))}</div>
          <div class="mt-2" style="font-size:.9rem;color:#6c757d">
            ملاحظة: إذا كانت الصفحة على GitHub Pages، ضع رابط WORKER_URL داخل app.js لتجاوز CORS.
          </div>
        </div>
      `
    });
  } finally {
    overlay(false);
  }
}

function renderYearKPIs(t) {
  document.getElementById("kpiTarget").textContent = fmt(t.yearTarget);
  document.getElementById("kpiAchieved").textContent = fmt(t.yearAchieved);
  document.getElementById("kpiRemaining").textContent = fmt(t.yearRemaining);
  document.getElementById("kpiPct").textContent = fmtPct(t.yearAchievementPct);
}

function renderMonthsTable(months) {
  const tb = document.getElementById("monthsTbody");
  tb.innerHTML = "";

  months.forEach(m => {
    if (!m.found) return;

    const pct = Number(m.achievementPct || 0);
    const safePct = Math.max(0, Math.min(100, pct));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="fw-bold">${escapeHtml(m.monthName || ("شهر " + m.month))}</td>
      <td>${fmt(m.totalTarget)}</td>
      <td>${fmt(m.totalAchieved)}</td>
      <td>${fmt(m.remaining)}</td>
      <td>
        <div class="progress" style="height:10px;border-radius:999px;">
          <div class="progress-bar" role="progressbar" style="width:${safePct}%" aria-valuenow="${safePct}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <div class="muted mini mt-1">${fmtPct(pct)}</div>
      </td>
    `;
    tb.appendChild(tr);
  });
}

function renderMonthsBar(months) {
  const filtered = months.filter(x => x.found);

  const labels = filtered.map(x => x.monthName || ("شهر " + x.month));
  const targets = filtered.map(x => x.totalTarget || 0);
  const achieved = filtered.map(x => x.totalAchieved || 0);

  const ctx = document.getElementById("barMonths");
  if (barChart) barChart.destroy();

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "المستهدف", data: targets },
        { label: "المحقق", data: achieved }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { ticks: { callback: (v) => fmt(v) } }
      }
    }
  });
}

async function loadMonth(month) {
  try {
    overlay(true);

    const res = await apiGet({ action: "monthSummary", month, year: YEAR });
    if (!res.ok) throw new Error(res.error || "API error");

    const d = res.data;

    // عنوان الشهر
    document.getElementById("monthTitle").textContent = d.monthName || `شهر ${month}`;

    // KPI للشهر
    document.getElementById("mTarget").textContent = fmt(d.totals.totalTarget);
    document.getElementById("mAchieved").textContent = fmt(d.totals.totalAchieved);
    document.getElementById("mRemaining").textContent = fmt(d.totals.remaining);
    document.getElementById("mPct").textContent = fmtPct(d.totals.achievementPct);

    // وضع اليوم
    renderTodayBox(d.today);

    // رسم يومي
    renderMonthLine(d);
  } catch (e) {
    Swal.fire({ icon: "error", title: "تعذر تحميل الشهر", text: String(e.message || e) });
  } finally {
    overlay(false);
  }
}

function renderTodayBox(today) {
  const box = document.getElementById("todayBox");
  if (!today) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  document.getElementById("todayDate").textContent = `${today.gregorian} — ${today.hijri}`;
  document.getElementById("todayTarget").textContent = fmt(today.target);
  document.getElementById("todayAchieved").textContent = fmt(today.achieved);
  document.getElementById("todayPct").textContent = fmtPct(today.pct);
}

function renderMonthLine(d) {
  // نعرض الأيام حسب التاريخ الميلادي (Row 3) + نحافظ على نفس طول الصفوف
  const labelsFull = (d.headers.gregorian || []).map(x => (x || "").trim());
  const targets = d.rows.targets || [];
  const achieved = d.rows.achieved || [];

  // طول ثابت 31 (لكن نحاول نخلي label فاضي لو اليوم غير مستخدم)
  const len = Math.min(31, labelsFull.length, targets.length, achieved.length);

  const labels = labelsFull.slice(0, len).map((x, i) => x ? x : `يوم ${i+1}`);

  const ctx = document.getElementById("lineDaily");
  if (lineChart) lineChart.destroy();

  lineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "المستهدف اليومي", data: targets.slice(0, len) },
        { label: "المحقق اليومي", data: achieved.slice(0, len) }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { ticks: { callback: (v) => fmt(v) } }
      }
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// تشغيل
init();
