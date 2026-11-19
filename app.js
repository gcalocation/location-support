/* 로케이션 지원 관리 시스템 - 검수용 시제품 (데이터는 이 브라우저에만 저장됩니다) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fdate = (iso) => (iso ? iso.replaceAll("-", ".") : "-");

let S = null;

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400);
}

/* ---------- 도메인 로직 ---------- */
function appStatus(a) {
  const st = a.supports.map((s) => s.status);
  if (!st.length) return "접수완료";
  const all = (set) => st.every((x) => set.includes(x));
  const any = (x) => st.includes(x);
  if (all(["반려"])) return "반려";
  if (all(["촬영완료", "반려"])) return "촬영완료";
  if (all(["보류"])) return "보류";
  if (any("촬영승인")) return "촬영승인";
  if (any("협의 중")) return "협의 중";
  if (any("촬영완료")) return "촬영승인";
  return "접수완료";
}
const memosOf = (id) => S.memos.filter((m) => m.appNo === id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
const years = () => [...new Set(S.apps.map((a) => a.receivedAt.slice(0, 4)))].sort().reverse();
function nextId(year) {
  const nums = S.apps.filter((a) => a.id.startsWith(year + "-")).map((a) => parseInt(a.id.split("-")[1], 10));
  return `${year}-${pad(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const badge = (s) => `<span class="badge" data-s="${esc(s)}">${esc(s)}</span>`;
const opts = (list, sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : "") + list.map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");

/* ---------- 라우터 ---------- */
const view = { filters: { q: "", year: "", region: "", type: "", category: "", status: "전체", sort: "latest", limit: 60 }, dashYear: String(new Date().getFullYear()), draft: null, step: 0, imp: null, exp: { from: `${new Date().getFullYear()}-01-01`, to: todayIso() } };
function route(keepScroll) {
  if (!S) return;
  const h = location.hash.replace(/^#/, "") || "/";
  const [, seg, arg] = h.split("/");
  const key = !seg ? "dashboard" : seg === "apps" && arg ? "apps" : seg;
  $$("#nav a").forEach((a) => (a.dataset.r === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  const main = $("#main");
  if (!seg) main.innerHTML = vDashboard();
  else if (seg === "apps" && arg) main.innerHTML = vDetail(decodeURIComponent(arg));
  else if (seg === "apps") main.innerHTML = vList();
  else if (seg === "new") main.innerHTML = vWizard();
  else if (seg === "import") main.innerHTML = vImport();
  else if (seg === "settings") main.innerHTML = vSettings();
  else main.innerHTML = `<div class="panel empty"><b>없는 화면입니다</b>왼쪽 메뉴에서 이동해 주세요.</div>`;
  if (!keepScroll) window.scrollTo(0, 0);
}

/* 신청 등록 때 입력하는 모든 항목 (목록 CSV·대시보드 엑셀 공통) */
const APP_HEAD = ["접수번호", "접수일", "접수 경로", "작품명", "감독", "주연배우", "작품 구분", "작품 종류", "작품 내용", "크랭크인", "크랭크업", "스탭 인원 수", "예산 규모", "1차 배급 매체", "제작사명", "신청자 이름", "직책 또는 소속", "신청자 연락처", "신청자 이메일", "신청 지역", "지역별 상태", "지원 요청사항", "첨부파일", "진행 상태", "담당자"];
const appRow = (a) => [a.id, a.receivedAt, a.source, a.title, a.director, a.cast, a.kind, a.type, a.synopsis, a.crankIn, a.crankUp, a.staff, a.budget, a.media, a.company, a.applicant.name, a.applicant.role, a.applicant.phone, a.applicant.email, a.supports.map((s) => s.region).join(", "), a.supports.map((s) => `${s.region}(${s.status})`).join(", "), a.request, a.files.map((f) => f.name).join(", "), appStatus(a), a.assignee];
const APP_WIDTHS = [12, 12, 12, 28, 12, 20, 10, 16, 50, 12, 12, 10, 14, 12, 18, 10, 14, 14, 24, 24, 36, 40, 40, 10, 10];

/* ---------- 대시보드 ---------- */
const inRange = (iso, from, to) => !!iso && (!from || iso >= from) && (!to || iso <= to);
function completions(a) { /* 지역별 촬영완료 처리일 (메모의 상태 변경 기준) */
  const m = {};
  S.memos.forEach((x) => { if (x.appNo === a.id && x.statusChange && x.statusChange.to === "촬영완료" && x.region && (!m[x.region] || x.date > m[x.region])) m[x.region] = x.date; });
  return m;
}
function dashData(from, to) {
  const apps = S.apps.filter((a) => inRange(a.receivedAt, from, to));
  const sup = apps.flatMap((a) => a.supports);
  const ok = sup.filter((s) => s.status === "촬영승인" || s.status === "촬영완료").length;
  const regionCount = Object.fromEntries(REGIONS.map((r) => [r, 0]));
  sup.forEach((s) => { if (regionCount[s.region] !== undefined) regionCount[s.region]++; });
  const supDone = [], worksDone = []; let noDateSup = 0, noDateWork = 0;
  S.apps.forEach((a) => {
    const c = completions(a);
    a.supports.forEach((s) => { if (s.status !== "촬영완료") return; if (!c[s.region]) noDateSup++; else if (inRange(c[s.region], from, to)) supDone.push({ app: a, region: s.region, date: c[s.region] }); });
    const closed = a.supports.length && a.supports.every((s) => s.status === "촬영완료" || s.status === "반려") && a.supports.some((s) => s.status === "촬영완료");
    if (!closed) return;
    const ds = a.supports.filter((s) => s.status === "촬영완료").map((s) => c[s.region]).filter(Boolean).sort();
    if (!ds.length) noDateWork++; else if (inRange(ds[ds.length - 1], from, to)) worksDone.push({ app: a, date: ds[ds.length - 1] });
  });
  const doneApps = apps.filter((a) => appStatus(a) === "촬영완료");
  const durations = doneApps.map((a) => { const m = memosOf(a.id); return m.length ? days(a.receivedAt, m[0].date) : null; }).filter((x) => x !== null && x >= 0);
  const count = (field, order) => { const extra = [...new Set(apps.map((a) => a[field]))].filter((v) => v && v !== "-" && !order.includes(v)); return [...order, ...extra].map((k) => [k, apps.filter((a) => a[field] === k).length]); };
  return {
    apps, sup, ok, rate: sup.length ? Math.round((ok / sup.length) * 100) : 0, regionCount, supDone, worksDone, noDateSup, noDateWork,
    doneApps, avgDays: durations.length ? (durations.reduce((p, c) => p + c, 0) / durations.length).toFixed(1) : null,
    status: STATUSES.map((s) => [s, apps.filter((a) => appStatus(a) === s).length]),
    kinds: count("kind", KINDS), types: count("type", TYPES), budgets: count("budget", BUDGETS), medias: count("media", MEDIA),
  };
}
function monthKeys(from, to) {
  const all = S.apps.map((a) => a.receivedAt).sort();
  const f = (from || all[0] || todayIso()).slice(0, 7), t = (to || todayIso()).slice(0, 7);
  const out = []; let [y, m] = f.split("-").map(Number); const [ty, tm] = t.split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 240) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
function bars(labels, counts, hot) {
  const max = Math.max(1, ...counts);
  return `<div class="bars">${labels.map((l, i) => `<div class="bar ${i === hot ? "on" : ""}"><span class="n">${counts[i]}</span><div class="col" style="height:${Math.max(3, (counts[i] / max) * 130)}px"></div><span class="m">${l}</span></div>`).join("")}</div>`;
}
function vDashboard() {
  const y = view.dashYear, from = y ? `${y}-01-01` : null, to = y ? `${y}-12-31` : null;
  const d = dashData(from, to), now = new Date();
  const thisMonth = S.apps.filter((a) => a.receivedAt.startsWith(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)).length;
  /* 막대 그래프의 가로축: 연도를 고르면 1~12월, 전체 누적이면 연도별 */
  const ys = years().slice().reverse();
  const labels = y ? Array.from({ length: 12 }, (_, i) => `${i + 1}월`) : ys;
  const idx = (iso) => (y ? parseInt(iso.slice(5, 7), 10) - 1 : ys.indexOf(iso.slice(0, 4)));
  const bucket = (items, dateOf) => { const c = Array(labels.length).fill(0); items.forEach((it) => { const i = idx(dateOf(it)); if (i >= 0) c[i]++; }); return c; };
  const hot = y ? (y === String(now.getFullYear()) ? now.getMonth() : -1) : ys.length - 1;
  const cApps = bucket(d.apps, (a) => a.receivedAt), cSup = bucket(d.supDone, (x) => x.date), cWork = bucket(d.worksDone, (x) => x.date);
  const unit = y ? "월별" : "연도별";

  const counter = d.status.map(([s, n]) => { const f = d.apps.length ? Math.round((n / d.apps.length) * 10) : 0; return `<div class="step"><div class="n">${n}</div><div class="t">${s}</div><div class="meter ${s === "촬영승인" ? "hot" : ""}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < f ? "f" : ""}"></i>`).join("")}</div></div>`; }).join("");
  const rmax = Math.max(1, ...Object.values(d.regionCount));
  const tiles = REGIONS.map((r) => { const n = d.regionCount[r]; const l = n === 0 ? 0 : n <= rmax * 0.33 ? 1 : n <= rmax * 0.66 ? 2 : 3; return `<div class="reg l${l}" title="${r} ${n}건">${r.replace(/시$|군$/, "")}<b>${n}</b></div>`; }).join("");
  const dist = (rows) => { const total = rows.reduce((p, r) => p + r[1], 0), max = Math.max(1, ...rows.map((r) => r[1])); return rows.filter((r) => r[1]).map(([k, n]) => `<li><span>${esc(k)}</span><b>${n}편 <small style="font-weight:600;color:var(--ink-2)">${Math.round((n / total) * 100)}%</small></b><div class="tr"><i style="width:${(n / max) * 100}%"></i></div></li>`).join("") || `<li><span>자료가 없습니다</span></li>`; };
  const scope = y ? `${y}년 1월~12월` : "전체 기간";
  const nd = (n, w) => (n ? ` 처리일이 기록되지 않은 ${w} ${n}건은 제외했어요.` : "");

  return `
  <header class="top">
    <div><h1>대시보드</h1><p>${y ? y + "년" : "전체 누적"} 기준 현황입니다.</p></div>
    <div class="top-tools">
      <label class="sr" for="dyear">연도</label>
      <select id="dyear" data-act="dyear" style="width:150px">${`<option value="">전체 누적</option>` + years().map((yy) => `<option value="${yy}" ${yy === y ? "selected" : ""}>${yy}년</option>`).join("")}</select>
      <a class="btn rec" href="#/new"><span class="rec-dot"></span>신청 등록</a>
    </div>
  </header>
  <section class="panel xport" aria-label="엑셀 내려받기">
    <div><h2 class="panel-title">엑셀로 내려받기</h2><p class="panel-note" style="margin:0">기준일 범위를 정하면 아래 지표와 신청 목록이 엑셀 한 파일로 만들어집니다.</p></div>
    <label class="field"><span>시작일</span><input type="date" id="expfrom" value="${esc(view.exp.from)}"></label>
    <label class="field"><span>종료일</span><input type="date" id="expto" value="${esc(view.exp.to)}"></label>
    <div class="quick"><button class="btn sm" data-act="exprange" data-v="year">올해</button><button class="btn sm" data-act="exprange" data-v="month">이번 달</button><button class="btn sm" data-act="exprange" data-v="all">전체</button></div>
    <button class="btn rec" data-act="export">엑셀 다운로드</button>
  </section>
  <section class="kpis" aria-label="핵심 지표">
    <div class="kpi live"><span class="l">신청 접수</span><span class="v">${d.apps.length}<small>건</small></span><span class="h">${y ? y + "년 전체" : "전체 누적"}</span></div>
    <div class="kpi"><span class="l">이번 달 신청</span><span class="v">${thisMonth}<small>건</small></span><span class="h">${now.getMonth() + 1}월 접수</span></div>
    <div class="kpi"><span class="l">성사율</span><span class="v">${d.rate}<small>%</small></span><span class="h">지원 건 ${d.sup.length}건 중 ${d.ok}건 승인·완료</span></div>
    <div class="kpi"><span class="l">평균 처리일수</span><span class="v">${d.avgDays ?? "-"}<small>${d.avgDays ? "일" : ""}</small></span><span class="h">촬영완료 ${d.doneApps.length}편, 접수~마지막 메모</span></div>
  </section>
  <section class="grid-2">
    <div class="panel"><h2 class="panel-title">${unit} 신청 편수</h2><p class="panel-note">접수일 기준입니다. 붉은 막대는 지금 진행 중인 ${y ? "달" : "해"}입니다.</p>${bars(labels, cApps, hot)}</div>
    <div class="panel"><h2 class="panel-title">진행 상태</h2><p class="panel-note">작품 기준입니다. 지역별 지원 건이 모두 끝나야 촬영완료가 됩니다.</p><div class="counter">${counter}</div></div>
  </section>
  <section class="grid-eq" style="margin-bottom:24px">
    <div class="panel"><h2 class="panel-title">${unit} 지원 건수 (촬영완료)</h2><p class="panel-note">지역별로 촬영완료 처리한 메모의 날짜 기준이에요. 합계 ${d.supDone.length}건.${nd(d.noDateSup, "지원")}</p>${bars(labels, cSup, hot)}</div>
    <div class="panel"><h2 class="panel-title">${unit} 지원 완료 편수</h2><p class="panel-note">작품의 모든 촬영 건이 촬영완료(반려 제외)된 달 기준이에요. 합계 ${d.worksDone.length}편.${nd(d.noDateWork, "작품")}</p>${bars(labels, cWork, hot)}</div>
  </section>
  <section class="panel" style="margin-bottom:24px"><h2 class="panel-title">시군별 신청 건수</h2><p class="panel-note">${scope} 접수 기준입니다. 깊이 파인 칸일수록 신청이 많은 지역입니다.</p><div class="regions">${tiles}</div></section>
  <section class="grid-eq" style="margin-bottom:24px">
    <div class="panel"><h2 class="panel-title">작품 구분별 현황</h2><p class="panel-note">국내, 해외, 공동제작 편수입니다.</p><ul class="list-plain">${dist(d.kinds)}</ul></div>
    <div class="panel"><h2 class="panel-title">작품 종류</h2><p class="panel-note">&nbsp;</p><ul class="list-plain">${dist(d.types)}</ul></div>
  </section>
  <section class="grid-eq">
    <div class="panel"><h2 class="panel-title">예산 규모</h2><p class="panel-note">&nbsp;</p><ul class="list-plain">${dist(d.budgets)}</ul></div>
    <div class="panel"><h2 class="panel-title">1차 배급 매체</h2><p class="panel-note">&nbsp;</p><ul class="list-plain">${dist(d.medias)}</ul></div>
  </section>`;
}

/* ---------- 대시보드 엑셀 ---------- */
function exportDashboard() {
  if (typeof XLSX === "undefined") return toast("엑셀 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요");
  const { from, to } = view.exp;
  if (!from || !to) return toast("시작일과 종료일을 모두 입력해 주세요");
  if (from > to) return toast("시작일이 종료일보다 늦어요");
  const d = dashData(from, to), months = monthKeys(from, to);
  const sheet = (rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = (widths || []).map((w) => ({ wch: w })); return ws; };
  const wb = XLSX.utils.book_new();
  const add = (name, rows, widths) => XLSX.utils.book_append_sheet(wb, sheet(rows, widths), name);
  add("요약", [["기준 기간", `${from} ~ ${to}`], ["생성일", todayIso()], [],
    ["지표", "값", "기준"],
    ["신청 접수(편)", d.apps.length, "접수일이 기간 안에 있는 신청"], ["지역별 지원 건수", d.sup.length, "위 신청의 지역별 지원 건"],
    ["성사 지원 건수", d.ok, "촬영승인 + 촬영완료"], ["성사율(%)", d.rate, "성사 지원 건 / 전체 지원 건"],
    ["평균 처리일수(일)", d.avgDays ?? "", "촬영완료 작품의 접수일~마지막 메모일"],
    ["촬영완료 지원 건수", d.supDone.length, "지역별 촬영완료 처리일이 기간 안에 있는 건"],
    ["지원 완료 편수", d.worksDone.length, "모든 촬영 건이 촬영완료(반려 제외)된 날이 기간 안에 있는 작품"]], [24, 14, 60]);
  add("월별 현황", [["월", "신청 편수", "지원 건수(촬영완료)", "지원 완료 편수"], ...months.map((m) => [m, d.apps.filter((a) => a.receivedAt.startsWith(m)).length, d.supDone.filter((x) => x.date.startsWith(m)).length, d.worksDone.filter((x) => x.date.startsWith(m)).length]),
    ["합계", d.apps.length, d.supDone.length, d.worksDone.length]], [12, 12, 20, 16]);
  add("시군별 신청건수", [["시군", "신청 건수"], ...REGIONS.map((r) => [r, d.regionCount[r]]), ["미정", d.sup.filter((s) => s.region === "미정").length]], [14, 12]);
  const pct = (rows) => { const t = rows.reduce((p, r) => p + r[1], 0) || 1; return rows.map(([k, n]) => [k, n, Math.round((n / t) * 1000) / 10]); };
  add("작품구분별", [["구분", "편수", "비율(%)"], ...pct(d.kinds)], [14, 10, 10]);
  add("진행상태·분포", [["진행 상태", "편수"], ...d.status, [], ["작품 종류", "편수"], ...d.types, [], ["예산 규모", "편수"], ...d.budgets, [], ["1차 배급 매체", "편수"], ...d.medias], [22, 10]);
  add("촬영완료 지원건", [["접수번호", "작품명", "지역", "촬영완료 처리일"], ...d.supDone.sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => [x.app.id, x.app.title, x.region, x.date])], [12, 28, 12, 16]);
  add("지원완료 작품", [["접수번호", "작품명", "제작사", "완료일(마지막 촬영완료)"], ...d.worksDone.sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => [x.app.id, x.app.title, x.app.company, x.date])], [12, 28, 20, 22]);
  add("신청목록", [APP_HEAD, ...d.apps.slice().sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1)).map(appRow)], APP_WIDTHS);
  const titleOf = Object.fromEntries(S.apps.map((a) => [a.id, a.title]));
  add("메모이력", [["접수번호", "작품명", "날짜", "작성자", "진행 방법", "업무 분류", "지역", "메모 내용", "상태 변경"],
    ...S.memos.filter((m) => inRange(m.date, from, to)).sort((a, b) => (a.date === b.date ? (a.appNo < b.appNo ? -1 : 1) : a.date < b.date ? -1 : 1))
      .map((m) => [m.appNo, titleOf[m.appNo] || "", m.date, m.author, m.method, m.category, m.region || "", m.text, m.statusChange ? `${m.statusChange.from} → ${m.statusChange.to}` : ""])], [12, 28, 12, 12, 12, 14, 12, 60, 22]);
  XLSX.writeFile(wb, `대시보드_${from}_${to}.xlsx`);
  toast("엑셀 파일을 내려받았어요");
}

/* ---------- 신청 목록 ---------- */
function filtered() {
  const f = view.filters; const q = f.q.trim().toLowerCase();
  return S.apps.filter((a) => {
    if (f.year && !a.receivedAt.startsWith(f.year)) return false;
    if (f.region && !a.supports.some((s) => s.region === f.region)) return false;
    if (f.type && a.type !== f.type) return false;
    if (f.category && !S.memos.some((m) => m.appNo === a.id && m.category === f.category)) return false;
    if (f.status !== "전체" && appStatus(a) !== f.status) return false;
    if (q && ![a.title, a.company, a.applicant.name, a.id, a.director].join(" ").toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    if (f.sort === "reg") return a.id < b.id ? -1 : 1; /* 등록순: 접수번호가 작은 것부터 */
    if (f.sort === "oldest") return a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.id < b.id ? -1 : 1;
    return a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : a.id < b.id ? 1 : -1; /* 최신순: 접수일이 늦은 것부터 */
  });
}
function vList() {
  const f = view.filters;
  const base = S.apps.filter((a) => (!f.year || a.receivedAt.startsWith(f.year)));
  const list = filtered();
  const tabs = ["전체", ...STATUSES].map((s) => { const n = s === "전체" ? base.length : base.filter((a) => appStatus(a) === s).length; return `<button class="tab" data-act="tab" data-v="${s}" aria-pressed="${f.status === s}">${s}<span class="c">${n}</span></button>`; }).join("");
  const shown = list.slice(0, f.limit);
  const rows = shown.map((a) => {
    const st = appStatus(a);
    return `<a class="row" href="#/apps/${encodeURIComponent(a.id)}">
      <span class="no">${a.id}</span>
      <span class="cell"><span class="t">${esc(a.title)}</span><span class="s"> · ${esc(a.company)} · ${esc(a.type)}</span></span>
      <span class="cell"><span class="t2">${esc(a.applicant.name)}</span><span class="s"> · ${esc(a.supports.map((x) => x.region).join(", "))}</span></span>
      <span class="cell"><span class="t2">${fdate(a.receivedAt)}</span><span class="s"> · ${esc(a.assignee || "-")}</span></span>
      ${badge(st)}</a>`;
  }).join("");
  return `
  <header class="top">
    <div><h1>신청 목록</h1><p>${list.length}건을 보고 있습니다.</p></div>
    <div class="top-tools"><button class="btn" data-act="csv">엑셀(CSV)로 내보내기</button><a class="btn rec" href="#/new"><span class="rec-dot"></span>신청 등록</a></div>
  </header>
  <div class="filters">
    <label class="field"><span>검색</span><input type="search" id="fq" placeholder="작품명, 제작사, 신청자, 접수번호" value="${esc(f.q)}"></label>
    <label class="field"><span>접수 연도</span><select data-act="flt" data-k="year">${opts(years(), f.year, "전체")}</select></label>
    <label class="field"><span>지역</span><select data-act="flt" data-k="region">${opts(REGIONS, f.region, "전체")}</select></label>
    <label class="field"><span>작품 종류</span><select data-act="flt" data-k="type">${opts(TYPES, f.type, "전체")}</select></label>
    <label class="field"><span>업무 분류</span><select data-act="flt" data-k="category">${opts(CATEGORIES, f.category, "전체")}</select></label>
    <label class="field"><span>정렬</span><select data-act="flt" data-k="sort">${[["latest", "최신순 (접수일)"], ["oldest", "오래된순 (접수일)"], ["reg", "등록순 (접수번호)"]].map(([v, t]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <button class="btn sm" data-act="reset" style="height:44px">초기화</button>
  </div>
  <div class="tabs" role="group" aria-label="진행 상태">${tabs}</div>
  ${list.length ? `<div class="rows"><div class="row head" aria-hidden="true"><span>접수번호</span><span>작품</span><span>신청자·지역</span><span>접수일·담당</span><span>상태</span></div>${rows}</div>
  ${list.length > shown.length ? `<div style="text-align:center;margin-top:22px"><button class="btn" data-act="more">${list.length - shown.length}건 더 보기</button></div>` : ""}` :
  `<div class="panel empty"><b>조건에 맞는 신청이 없습니다</b>검색어나 필터를 바꾸거나 초기화해 보세요.</div>`}`;
}

/* ---------- 신청 상세 ---------- */
function vDetail(id) {
  const a = S.apps.find((x) => x.id === id);
  if (!a) return `<div class="panel empty"><b>접수번호 ${esc(id)} 신청을 찾을 수 없습니다</b><a class="btn" href="#/apps">신청 목록으로</a></div>`;
  const st = appStatus(a);
  const supports = a.supports.map((s, i) => `<div class="support"><b>${esc(s.region)}</b><select data-act="sup" data-i="${i}" aria-label="${esc(s.region)} 상태">${opts(STATUSES, s.status)}</select></div>`).join("");
  const memos = memosOf(id);
  const tl = memos.map((m, i) => `<li class="${i === 0 ? "first" : ""}"><div class="meta"><b>${esc(m.author)}</b><span>${fdate(m.date)}</span><span>${esc(m.method)}</span><span>${esc(m.category)}</span>${m.region ? `<span>${esc(m.region)}</span>` : ""}</div><div class="body">${esc(m.text)}</div>${m.statusChange ? `<span class="badge chg" data-s="${esc(m.statusChange.to)}">${esc(m.statusChange.from)} → ${esc(m.statusChange.to)}</span>` : ""}</li>`).join("");
  const files = a.files.map((f) => `<li class="file"><span class="ext">링크</span>${safeUrl(f.url) ? `<a class="nm" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.name)}</a>` : `<span class="nm">${esc(f.name)}</span>`}</li>`).join("") || `<li class="hint">연결된 첨부 링크가 없습니다.</li>`;
  return `
  <div class="crumb"><a class="btn sm" href="#/apps">← 신청 목록</a></div>
  <header class="top">
    <div><h1>${esc(a.title)}</h1><p>${a.id} · ${esc(a.company)} · ${fdate(a.receivedAt)} 접수 · ${esc(a.source)}</p></div>
    <div class="top-tools">${badge(st)}<label class="sr" for="asg">담당자</label><select id="asg" data-act="asg" style="width:150px">${opts(S.staff, a.assignee, "담당자 미지정")}</select></div>
  </header>
  <div class="detail">
    <div class="stack">
      <section class="panel"><h2 class="panel-title">지역별 지원 건</h2><p class="panel-note">지역마다 상태를 따로 관리합니다. 바꾸면 메모에도 자동으로 기록됩니다.</p>${supports}
        <div class="memo-form" style="grid-template-columns:1fr auto;align-items:end"><label class="field"><span>지역 추가</span><select id="addreg">${opts(REGIONS.filter((r) => !a.supports.some((s) => s.region === r)), "", "지역 선택")}</select></label><button class="btn sm" data-act="addreg" style="height:44px">추가</button></div></section>
      <section class="panel"><h2 class="panel-title">작품 정보</h2><p class="panel-note">&nbsp;</p><dl class="dl">
        <dt>작품 종류</dt><dd>${esc(a.type)} (${esc(a.kind)})</dd><dt>감독</dt><dd>${esc(a.director)}</dd><dt>주연배우</dt><dd>${esc(a.cast)}</dd>
        <dt>배급·예산</dt><dd>${esc(a.media)} · ${esc(a.budget)}</dd><dt>스탭 인원</dt><dd>${a.staff}명</dd><dt>촬영 기간</dt><dd>${fdate(a.crankIn)} ~ ${fdate(a.crankUp)}</dd>
        <dt>작품 내용</dt><dd style="font-weight:500">${esc(a.synopsis)}</dd><dt>지원 요청</dt><dd style="font-weight:500">${esc(a.request)}</dd></dl></section>
      <section class="panel"><h2 class="panel-title">신청자</h2><p class="panel-note">&nbsp;</p><dl class="dl"><dt>이름</dt><dd>${esc(a.applicant.name)} (${esc(a.applicant.role)})</dd><dt>연락처</dt><dd>${esc(a.applicant.phone)}</dd><dt>이메일</dt><dd>${esc(a.applicant.email)}</dd></dl></section>
      <section class="panel"><h2 class="panel-title">첨부파일</h2><p class="panel-note">구글 드라이브 파일의 공유 링크를 붙여 넣어 연결합니다.</p><ul class="files">${files}</ul>
        ${a.drivePath ? `<p class="panel-note" style="margin:12px 0 0">드라이브 폴더 경로: ${esc(a.drivePath)}</p>` : ""}
        <form id="flink" class="flink" novalidate><label class="field"><span>이름</span><input type="text" name="fname" placeholder="예: 촬영계획서"></label><label class="field"><span>링크</span><input type="url" name="furl" placeholder="https://drive.google.com/..."></label><button class="btn sm" type="submit" style="height:44px">링크 추가</button></form></section>
    </div>
    <div class="stack">
      <section class="panel"><h2 class="panel-title">메모 남기기</h2><p class="panel-note">작성자: <b>${esc(S.author)}</b> (왼쪽 아래에서 바꿀 수 있습니다)</p>
        <form id="memo" class="memo-form" novalidate>
          <label class="field"><span>진행 방법</span><select name="method">${opts(METHODS)}</select></label>
          <label class="field"><span>업무 분류</span><select name="category">${opts(CATEGORIES)}</select></label>
          <label class="field"><span>지역</span><select name="region">${opts(a.supports.map((s) => s.region), "", "전체")}</select></label>
          <label class="field"><span>날짜</span><input type="date" name="date" value="${todayIso()}"></label>
          <label class="field"><span>이 지역 상태 변경</span><select name="newstatus">${opts(STATUSES, "", "변경 안 함")}</select></label>
          <div class="hint">상태를 바꾸려면 지역을 먼저 고르세요. 촬영완료로 바꾼 날짜가 대시보드의 월별 집계에 쓰여요.</div>
          <label class="field wide"><span>메모 <em>*</em></span><textarea name="text" placeholder="통화·협의 내용을 적어 주세요"></textarea><span class="err" id="memoerr"></span></label>
          <div class="wide"><button class="btn rec" type="submit">메모 저장</button></div>
        </form></section>
      <section class="panel"><h2 class="panel-title">진행 기록</h2><p class="panel-note">최근 기록이 맨 위에 있습니다.</p>${memos.length ? `<ol class="timeline">${tl}</ol>` : `<div class="hint">아직 기록이 없습니다. 위에서 첫 메모를 남겨 보세요.</div>`}</section>
    </div>
  </div>`;
}

/* ---------- 신청 등록 (4단계) ---------- */
const STEPS = ["작품", "일정·규모", "신청자", "지원 요청·첨부"];
const emptyDraft = () => ({ title: "", director: "", cast: "", kind: "국내", type: "", synopsis: "", crankIn: "", crankUp: "", staff: "", budget: "", media: "", company: "", name: "", role: "", phone: "", email: "", receivedAt: todayIso(), source: "직접 입력", assignee: "", regions: [], undecided: false, request: "", link1: "", link2: "" });
function vWizard() {
  if (!view.draft) { view.draft = emptyDraft(); view.step = 0; }
  const d = view.draft, i = view.step;
  const reel = STEPS.map((s, k) => `<div class="frame ${k < i ? "done" : ""}" ${k === i ? 'aria-current="step"' : ""}><span class="no">${k < i ? "✓" : k + 1}</span>${s}</div>`).join("");
  const f = (name, label, html, req, hint) => `<div class="field" data-f="${name}"><span>${label}${req ? "<em>*</em>" : ""}</span>${html}${hint ? `<small>${hint}</small>` : ""}<span class="err"></span></div>`;
  const inp = (n, t = "text", ph = "") => `<input type="${t}" name="${n}" value="${esc(d[n])}" placeholder="${esc(ph)}">`;
  let body = "";
  if (i === 0) body = `<div class="form-grid">
    ${f("title", "작품명", inp("title"), 1)}${f("type", "작품 종류", `<select name="type">${opts(TYPES, d.type, "선택")}</select>`, 1)}
    ${f("director", "감독", inp("director"))}${f("cast", "주연배우", inp("cast", "text", "여러 명이면 쉼표로 구분"))}
    ${f("kind", "작품 구분", `<select name="kind">${opts(KINDS, d.kind)}</select>`)}<div></div>
    <div class="wide">${f("synopsis", "작품 내용", `<textarea name="synopsis">${esc(d.synopsis)}</textarea>`)}</div></div>`;
  if (i === 1) body = `<div class="form-grid">
    ${f("crankIn", "크랭크인", inp("crankIn", "date"))}${f("crankUp", "크랭크업", inp("crankUp", "date"))}
    ${f("staff", "스탭 인원 수", inp("staff", "number"), 0, "명 단위 숫자")}${f("budget", "예산 규모", `<select name="budget">${opts(BUDGETS, d.budget, "선택")}</select>`)}
    ${f("media", "1차 배급 매체", `<select name="media">${opts(MEDIA, d.media, "선택")}</select>`)}<div></div></div>`;
  if (i === 2) body = `<div class="form-grid">
    ${f("company", "제작사명", inp("company"), 1)}${f("role", "직책 또는 소속", inp("role"))}
    ${f("name", "신청자 이름", inp("name"), 1)}${f("phone", "연락처", inp("phone", "tel", "010-0000-0000"), 1)}
    ${f("email", "이메일", inp("email", "email", "name@example.com"))}${f("assignee", "담당자", `<select name="assignee">${opts(S.staff, d.assignee || S.author)}</select>`)}
    ${f("receivedAt", "접수일", inp("receivedAt", "date"), 1, "전화·메일로 받은 날짜로 바꿀 수 있습니다")}${f("source", "접수 경로", `<select name="source">${opts(SOURCES, d.source)}</select>`)}</div>`;
  if (i === 3) body = `<div class="form-grid"><div class="wide field" data-f="regions"><span>지원 요청 지역<em>*</em></span><div class="chips" id="regchips">${REGIONS.map((r) => `<button type="button" class="chip" data-act="reg" data-v="${r}" aria-pressed="${d.regions.includes(r)}">${r}</button>`).join("")}</div>
    <label style="display:flex;gap:10px;align-items:center;margin-top:8px;font-weight:600"><input type="checkbox" name="undecided" ${d.undecided ? "checked" : ""} style="width:20px;height:20px"> 아직 정해지지 않았어요 (지역 미정)</label><span class="err"></span></div>
    <div class="wide">${f("request", "지원 요청사항", `<textarea name="request">${esc(d.request)}</textarea>`)}</div>
    ${f("link1", "제작기획서·촬영계획서 링크", inp("link1", "url", "https://drive.google.com/..."), 0, "구글 드라이브 공유 링크. 나중에 신청 상세에서도 추가할 수 있어요")}${f("link2", "시나리오·스탭리스트 등 기타자료 링크", inp("link2", "url", "https://drive.google.com/..."))}</div>`;
  return `<header class="top"><div><h1>신청 등록</h1><p>접수번호는 저장할 때 자동으로 붙습니다.</p></div></header>
  <div class="reel" aria-label="등록 단계">${reel}</div>
  <form class="panel" id="wiz" novalidate>${body}
    <div class="wiz-nav"><div>${i > 0 ? `<button type="button" class="btn" data-act="prev">이전</button>` : `<a class="btn" href="#/apps" data-act="cancel">취소</a>`}</div>
    <div>${i < 3 ? `<button type="submit" class="btn rec">다음</button>` : `<button type="submit" class="btn rec"><span class="rec-dot"></span>신청 저장</button>`}</div></div></form>`;
}
function readStep() {
  const d = view.draft;
  $$("#wiz [name]").forEach((el) => { if (el.type === "checkbox") d[el.name] = el.checked; else d[el.name] = el.value.trim(); });
}
function validate(i) {
  const d = view.draft; const errs = {};
  const need = (k, m) => { if (!String(d[k] ?? "").trim()) errs[k] = m; };
  if (i === 0) { need("title", "작품명을 입력해 주세요"); need("type", "작품 종류를 선택해 주세요"); }
  if (i === 1) { if (d.crankIn && d.crankUp && d.crankUp < d.crankIn) errs.crankUp = "크랭크업은 크랭크인보다 빠를 수 없어요"; if (d.staff && Number(d.staff) < 0) errs.staff = "0 이상의 숫자를 입력해 주세요"; }
  if (i === 2) {
    need("company", "제작사명을 입력해 주세요"); need("name", "신청자 이름을 입력해 주세요"); need("receivedAt", "접수일을 입력해 주세요");
    if (!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(d.phone.replace(/\s/g, ""))) errs.phone = "연락처를 확인해 주세요 (예: 010-1234-5678)";
    if (d.email) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errs.email = "이메일 형식을 확인해 주세요"; else if (/@(naer|nave|gmial|gamil|daum\.com|hanmial)\./.test(d.email) || /@naer\.com$/.test(d.email)) errs.email = "도메인에 오타가 있는지 확인해 주세요 (예: naver.com)"; }
  }
  if (i === 3 && !d.regions.length && !d.undecided) errs.regions = "지역을 한 곳 이상 고르거나 '지역 미정'을 체크해 주세요";
  if (i === 3) { if (d.link1 && !safeUrl(d.link1)) errs.link1 = "http(s)로 시작하는 링크를 넣어 주세요"; if (d.link2 && !safeUrl(d.link2)) errs.link2 = "http(s)로 시작하는 링크를 넣어 주세요"; }
  return errs;
}
function showErrs(errs) {
  $$("#wiz [data-f]").forEach((w) => { const m = errs[w.dataset.f]; w.classList.toggle("bad", !!m); $(".err", w).textContent = m || ""; });
  const first = $("#wiz .bad input, #wiz .bad select, #wiz .bad textarea, #wiz .bad button"); if (first) first.focus();
}
async function saveDraft() {
  const d = view.draft, regions = d.regions.length ? d.regions : ["미정"], files = [];
  if (safeUrl(d.link1)) files.push({ name: "제작기획서·촬영계획서", url: safeUrl(d.link1) });
  if (safeUrl(d.link2)) files.push({ name: "시나리오·스탭리스트 등 기타자료", url: safeUrl(d.link2) });
  const btn = $("#wiz button[type=submit]"); if (btn) btn.disabled = true;
  for (let tries = 0; tries < 3; tries++) {
    const id = nextId(d.receivedAt.slice(0, 4));
    const app = { id, receivedAt: d.receivedAt, source: d.source, title: d.title, director: d.director || "-", cast: d.cast || "-", kind: d.kind, type: d.type, media: d.media || "-", budget: d.budget || "-", staff: Number(d.staff) || 0, crankIn: d.crankIn, crankUp: d.crankUp, synopsis: d.synopsis || "-", company: d.company, applicant: { name: d.name, role: d.role || "-", phone: d.phone, email: d.email || "-" }, request: d.request || "-", supports: regions.map((r) => ({ region: r, status: "접수완료" })), assignee: d.assignee || S.author, files, drivePath: "" };
    try { await persistNewApps([app]); S.apps.push(app); view.draft = null; view.step = 0; toast(`${id} 신청을 저장했어요`); location.hash = `#/apps/${encodeURIComponent(id)}`; return; }
    catch (e) { if (e && e.code === "23505") { await reloadData(); continue; } console.error(e); toast("저장하지 못했어요: " + (e.message || e)); if (btn) btn.disabled = false; return; }
  }
  toast("접수번호가 겹쳐 저장하지 못했어요. 다시 시도해 주세요"); if (btn) btn.disabled = false;
}

/* ---------- 가져오기 / 설정 ---------- */
/* ---------- 엑셀로 신청 등록 ---------- */
const XL_HEADERS = ["접수일", "작품명", "감독", "주연배우", "작품구분", "작품종류", "1차 배급매체", "예산규모", "스탭 인원 수", "크랭크인", "크랭크업", "작품내용", "제작사명", "신청자 이름", "신청자 연락처", "신청자 이메일", "직책 또는 소속", "신청 지역", "지원 요청사항", "담당자"];
const XL_ALIASES = {
  appNo: ["접수번호", "신청번호"], receivedAt: ["접수일", "접수일자", "신청일", "신청일자"], title: ["작품명", "제목"], director: ["감독"], cast: ["주연배우", "배우"],
  kind: ["작품구분"], type: ["작품종류"], media: ["1차배급매체", "배급매체"], budget: ["예산규모"], staff: ["스탭인원수", "스탭인원", "스태프인원수"],
  crankIn: ["크랭크인"], crankUp: ["크랭크업"], synopsis: ["작품내용"], company: ["제작사명", "제작사"], name: ["신청자이름", "신청자", "이름"],
  phone: ["신청자연락처", "연락처"], email: ["신청자이메일", "이메일"], role: ["직책또는소속", "소속", "직책"], regions: ["신청지역", "지역"], request: ["지원요청사항", "요청사항"], assignee: ["담당자"],
};
const normHead = (h) => String(h ?? "").replace(/\s+/g, "").toLowerCase();
function xlDate(v) {
  if (v === "" || v == null) return "";
  if (typeof v === "number" && v > 20000 && v < 80000 && typeof XLSX !== "undefined") { const p = XLSX.SSF.parse_date_code(v); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
  const m = String(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
}
function xlRegions(v) {
  const out = [], unknown = [];
  String(v ?? "").split(/[,，、/·\n]+|\s{2,}/).map((x) => x.trim()).filter(Boolean).forEach((t) => {
    const r = REGIONS.find((x) => x === t || x.replace(/시$|군$/, "") === t);
    if (r) { if (!out.includes(r)) out.push(r); } else if (t !== "미정") unknown.push(t);
  });
  return { out, unknown };
}
function parseExcelRows(json) {
  const first = json[0] || {}; const map = {};
  Object.keys(first).forEach((h) => { const key = Object.keys(XL_ALIASES).find((k) => XL_ALIASES[k].includes(normHead(h))); if (key && !map[key]) map[key] = h; });
  const seen = new Set(S.apps.map((a) => `${a.title}|${a.applicant.name}|${a.receivedAt}`));
  const rows = json.map((r, i) => {
    const g = (k) => (map[k] ? String(r[map[k]] ?? "").trim() : "");
    const raw = (k) => (map[k] ? r[map[k]] : "");
    const errors = [], warns = [];
    const d = { title: g("title"), director: g("director"), cast: g("cast"), kind: g("kind"), type: g("type"), media: g("media"), budget: g("budget"), staff: g("staff"), synopsis: g("synopsis"), company: g("company"), name: g("name"), role: g("role"), email: g("email"), request: g("request"), assignee: g("assignee"), appNo: g("appNo") };
    if (!d.title) errors.push("작품명이 없어요");
    if (!d.company) errors.push("제작사명이 없어요");
    if (!d.name) errors.push("신청자 이름이 없어요");
    let ph = g("phone").replace(/[^\d]/g, ""); if (ph && !ph.startsWith("0")) ph = "0" + ph;
    if (!/^0\d{8,10}$/.test(ph)) errors.push("연락처를 확인해 주세요"); else d.phone = ph.length === 11 ? `${ph.slice(0, 3)}-${ph.slice(3, 7)}-${ph.slice(7)}` : ph.length === 10 && ph.startsWith("02") ? `${ph.slice(0, 2)}-${ph.slice(2, 6)}-${ph.slice(6)}` : ph.length === 10 ? `${ph.slice(0, 3)}-${ph.slice(3, 6)}-${ph.slice(6)}` : ph;
    const rd = xlDate(raw("receivedAt")); if (rd === null) errors.push("접수일 형식을 확인해 주세요"); else if (!rd) { d.receivedAt = todayIso(); warns.push("접수일이 비어 오늘로 넣어요"); } else d.receivedAt = rd;
    const ci = xlDate(raw("crankIn")), cu = xlDate(raw("crankUp")); d.crankIn = ci || ""; d.crankUp = cu || "";
    if (ci === null || cu === null) warns.push("촬영 기간 날짜를 읽지 못해 비워요");
    if (!TYPES.includes(d.type)) { if (d.type) warns.push(`작품종류 '${d.type}'은 '기타'로 넣어요`); d.type = "기타"; }
    if (!KINDS.includes(d.kind)) { if (d.kind) warns.push(`작품구분 '${d.kind}'은 '국내'로 넣어요`); d.kind = "국내"; }
    if (d.budget && !BUDGETS.includes(d.budget)) warns.push(`예산규모 '${d.budget}'은 목록에 없어요`);
    if (d.media && !MEDIA.includes(d.media)) warns.push(`배급매체 '${d.media}'은 목록에 없어요`);
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) warns.push("이메일 형식을 확인해 주세요"); else if (/@(naer|nave|gmial|gamil|hanmial)\./.test(d.email)) warns.push("이메일 도메인 오타일 수 있어요");
    const rg = xlRegions(raw("regions")); d.regions = rg.out;
    if (rg.unknown.length) warns.push(`알 수 없는 지역(${rg.unknown.join(", ")})은 뺐어요`);
    if (!rg.out.length) warns.push("지역이 없어 '미정'으로 넣어요");
    d.staff = Number(d.staff) || 0;
    if (d.assignee && !S.staff.includes(d.assignee)) { warns.push(`담당자 '${d.assignee}'는 등록된 담당자가 아니에요`); d.assignee = ""; }
    if (d.title && d.name && d.receivedAt) { const k = `${d.title}|${d.name}|${d.receivedAt}`; if (seen.has(k)) errors.push("이미 등록된 신청이에요 (작품명·신청자·접수일 동일)"); else seen.add(k); }
    return { line: i + 2, d, errors, warns };
  });
  return { rows, missing: ["title", "company", "name", "phone"].filter((k) => !map[k]).map((k) => XL_ALIASES[k][0]) };
}
function readExcelFile(file) {
  if (typeof XLSX === "undefined") return toast("엑셀 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요");
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const wb = XLSX.read(fr.result, { type: "array" });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      if (!json.length) return toast("읽을 행이 없어요. 첫 줄은 제목 행이어야 해요");
      view.imp = { name: file.name, ...parseExcelRows(json) }; route();
    } catch (e) { toast("파일을 읽지 못했어요. 엑셀(.xlsx) 파일인지 확인해 주세요"); }
  };
  fr.readAsArrayBuffer(file);
}
function downloadTemplate() {
  if (typeof XLSX === "undefined") return toast("엑셀 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요");
  const ex = [todayIso(), "예시 작품", "홍길동", "김배우, 이배우", "국내", "TV/OTT 드라마", "OTT", "10~30억 미만", 60, todayIso(), todayIso(), "작품 소개를 적어 주세요", "예시제작사", "김신청", "010-1234-5678", "name@example.com", "제작부장", "수원시, 용인시", "로케이션 섭외 지원", S.staff[0]];
  const ws = XLSX.utils.aoa_to_sheet([XL_HEADERS, ex]); ws["!cols"] = XL_HEADERS.map((h) => ({ wch: Math.max(12, h.length * 2) }));
  const guide = [["항목", "입력 방법"], ["필수", "작품명, 제작사명, 신청자 이름, 신청자 연락처"], ["접수일", "2026-11-19 또는 2026. 11. 19 형식. 비우면 오늘 날짜"], ["작품구분", KINDS.join(", ")], ["작품종류", TYPES.join(", ")], ["1차 배급매체", MEDIA.join(", ")], ["예산규모", BUDGETS.join(", ")], ["신청 지역", "여러 곳이면 쉼표로 구분 (예: 수원시, 용인시). 비우면 '미정'"], ["담당자", S.staff.join(", ")], ["참고", "접수번호는 자동으로 붙어요. 첫 줄의 제목은 바꾸지 마세요"]];
  const gs = XLSX.utils.aoa_to_sheet(guide); gs["!cols"] = [{ wch: 14 }, { wch: 90 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "신청등록"); XLSX.utils.book_append_sheet(wb, gs, "입력 안내");
  XLSX.writeFile(wb, "신청등록_양식.xlsx");
}
async function commitImport() {
  const imp = view.imp; if (!imp) return;
  const list = [];
  imp.rows.filter((r) => !r.errors.length).forEach(({ d }) => {
    const id = /^\d{4}-\d{3}$/.test(d.appNo) && !S.apps.some((a) => a.id === d.appNo) ? d.appNo : nextId(d.receivedAt.slice(0, 4));
    const app = { id, receivedAt: d.receivedAt, source: "엑셀 업로드", title: d.title, director: d.director || "-", cast: d.cast || "-", kind: d.kind, type: d.type, media: d.media || "-", budget: d.budget || "-", staff: d.staff, crankIn: d.crankIn, crankUp: d.crankUp, synopsis: d.synopsis || "-", company: d.company, applicant: { name: d.name, role: d.role || "-", phone: d.phone, email: d.email || "-" }, request: d.request || "-", supports: (d.regions.length ? d.regions : ["미정"]).map((r) => ({ region: r, status: "접수완료" })), assignee: d.assignee || S.author, files: [], drivePath: "" };
    S.apps.push(app); list.push(app);
  });
  view.imp = null;
  if (await dbRun(() => persistNewApps(list))) { toast(`${list.length}건을 등록했어요`); location.hash = "#/apps"; }
}

/* ---------- 기존 구글 시트(엑셀)에서 이관 ---------- */
function parseLegacy(wb) {
  const get = (n) => (wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: true }) : []);
  const pg = get("진행관리").filter((r) => String(r["신청번호"]).trim()), sv = get("설문지 응답 시트1").filter((r) => String(r["작품명"]).trim());
  if (!pg.length) return null;
  const norm = (x) => String(x ?? "").replace(/\s+/g, "").toLowerCase(), map = new Map();
  sv.forEach((r) => { const k = norm(r["작품명"]) + "|" + norm(r["신청자 이름"]); if (!map.has(k)) map.set(k, []); map.get(k).push(r); });
  const dayOf = (v) => xlDate(typeof v === "number" ? Math.floor(v) : v);
  const existing = new Set(S.apps.map((a) => a.id)), apps = [], skipped = [], warns = [], dups = [];
  const g = (row, k) => (row ? String(row[k] ?? "").trim() : "");
  const dupKey = (title, name, day, req) => [norm(title), norm(name), day, norm(req).slice(0, 120)].join("|");
  const seenKey = new Set(S.apps.map((a) => dupKey(a.title, a.applicant.name, a.receivedAt, a.request)));
  /* 같은 작품·신청자·접수일·요청 내용이 반복된 행은 시트의 중복 생성 오류로 보고 첫 행만 남긴다 */
  pg.forEach((r) => {
    const id = String(r["신청번호"]).trim();
    if (existing.has(id)) { skipped.push(id); return; }
    const dk = dupKey(r["작품명"], r["신청자 이름"], dayOf(r["접수일"]), r["지원 요청사항"]);
    if (seenKey.has(dk)) { dups.push(id); return; }
    seenKey.add(dk);
    const cands = map.get(norm(r["작품명"]) + "|" + norm(r["신청자 이름"])) || [], recv = dayOf(r["접수일"]) || todayIso();
    const s = cands.find((c) => dayOf(c["타임스탬프"]) === recv) || cands[0] || null;
    let regs = xlRegions(g(r, "신청 지역")).out; if (!regs.length && s) regs = xlRegions(g(s, "신청 지역")).out;
    const status = STATUSES.includes(g(r, "진행상태")) ? g(r, "진행상태") : "접수완료", files = [];
    [["제작기획서(작품소개서), 촬영계획서", "제작기획서·촬영계획서"], ["시나리오, 스탭리스트, 장소구분표 등 기타자료", "시나리오·스탭리스트 등 기타자료"]].forEach(([col, label]) => { const u = safeUrl(g(s, col)); if (u) files.push({ name: label, url: u }); });
    let ph = g(r, "신청자 연락처"); if (/^\d{9,11}$/.test(ph) && !ph.startsWith("0")) ph = "0" + ph;
    if (!s) warns.push(id);
    apps.push({ id, receivedAt: recv, source: "이관", title: g(r, "작품명"), director: g(s, "감독") || "-", cast: g(r, "배우") || g(s, "주연배우") || "-", kind: KINDS.includes(g(s, "작품구분")) ? g(s, "작품구분") : "국내", type: g(r, "작품종류") || g(s, "작품종류") || "기타", media: g(s, "1차 배급매체") || "-", budget: g(s, "예산규모") || "-", staff: Number(g(s, "스탭 인원 수")) || 0, crankIn: (s && xlDate(s["크랭크인"])) || "", crankUp: (s && xlDate(s["크랭크업"])) || "", synopsis: g(s, "작품내용") || "-", company: g(r, "제작사 명") || g(s, "제작사명") || "-", applicant: { name: g(r, "신청자 이름") || "-", role: g(r, "직책 또는 소속") || "-", phone: ph, email: g(r, "신청자 이메일") || "-" }, request: g(r, "지원 요청사항") || g(s, "지원 요청사항") || "-", supports: (regs.length ? regs : ["미정"]).map((x) => ({ region: x, status })), assignee: "", files, drivePath: g(r, "첨부파일") });
  });
  /* 진행관리에 아직 올라오지 않은 설문지 응답은 새 접수번호로 등록 */
  const pgKeys = new Set(pg.map((r) => norm(r["작품명"]) + "|" + norm(r["신청자 이름"])));
  const maxNo = {};
  [...existing, ...apps.map((a) => a.id)].forEach((id) => { const m = /^(\d{4})-(\d+)$/.exec(id); if (m) maxNo[m[1]] = Math.max(maxNo[m[1]] || 0, +m[2]); });
  const fresh = [];
  sv.forEach((r) => {
    if (pgKeys.has(norm(r["작품명"]) + "|" + norm(r["신청자 이름"]))) return;
    const recv = dayOf(r["타임스탬프"]) || todayIso();
    const dk = dupKey(r["작품명"], r["신청자 이름"], recv, r["지원 요청사항"]);
    if (seenKey.has(dk)) { dups.push("응답 " + g(r, "작품명")); return; }
    seenKey.add(dk);
    const y = recv.slice(0, 4); maxNo[y] = (maxNo[y] || 0) + 1;
    const id = `${y}-${pad(maxNo[y]).padStart(3, "0")}`;
    const regs = xlRegions(g(r, "신청 지역")).out, files = [];
    [["제작기획서(작품소개서), 촬영계획서", "제작기획서·촬영계획서"], ["시나리오, 스탭리스트, 장소구분표 등 기타자료", "시나리오·스탭리스트 등 기타자료"]].forEach(([col, label]) => { const u = safeUrl(g(r, col)); if (u) files.push({ name: label, url: u }); });
    let ph = g(r, "신청자 연락처"); if (/^\d{9,11}$/.test(ph) && !ph.startsWith("0")) ph = "0" + ph;
    const a = { id, receivedAt: recv, source: "이관", title: g(r, "작품명"), director: g(r, "감독") || "-", cast: g(r, "주연배우") || "-", kind: KINDS.includes(g(r, "작품구분")) ? g(r, "작품구분") : "국내", type: g(r, "작품종류") || "기타", media: g(r, "1차 배급매체") || "-", budget: g(r, "예산규모") || "-", staff: Number(g(r, "스탭 인원 수")) || 0, crankIn: xlDate(r["크랭크인"]) || "", crankUp: xlDate(r["크랭크업"]) || "", synopsis: g(r, "작품내용") || "-", company: g(r, "제작사명") || "-", applicant: { name: g(r, "신청자 이름") || "-", role: g(r, "직책 또는 소속") || "-", phone: ph, email: g(r, "신청자 이메일") || "-" }, request: g(r, "지원 요청사항") || "-", supports: (regs.length ? regs : ["미정"]).map((x) => ({ region: x, status: "접수완료" })), assignee: "", files, drivePath: "" };
    apps.push(a); fresh.push(id);
  });
  const ids = new Set([...existing, ...apps.map((a) => a.id)]);
  const memos = get("메모이력").filter((r) => String(r["메모내용"]).trim() && ids.has(String(r["신청번호"]).trim())).map((r) => ({ id: uuid(), appNo: String(r["신청번호"]).trim(), date: dayOf(r["날짜"]) || todayIso(), author: g(r, "작성자"), method: g(r, "진행방법") || "기타", category: g(r, "업무분류") || "기타", region: g(r, "지역"), text: g(r, "메모내용"), statusChange: null }));
  return { apps, skipped, warns, memos, dups, fresh };
}
function readLegacyFile(file) {
  if (typeof XLSX === "undefined") return toast("엑셀 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요");
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const res = parseLegacy(XLSX.read(fr.result, { type: "array" }));
      if (!res) return toast("'진행관리' 시트를 찾지 못했어요. 구글 시트를 엑셀로 내려받은 파일인지 확인해 주세요");
      view.legacy = { name: file.name, ...res }; route();
    } catch (e) { console.error(e); toast("파일을 읽지 못했어요. 엑셀(.xlsx) 파일인지 확인해 주세요"); }
  };
  fr.readAsArrayBuffer(file);
}
async function commitLegacy() {
  const lg = view.legacy; if (!lg || !lg.apps.length) return;
  const btn = $("[data-act=lgcommit]"); if (btn) btn.disabled = true;
  const ok = await dbRun(async () => { await persistNewApps(lg.apps); await insertBatch("memos", lg.memos.map(memoToRow)); });
  if (ok) { S.apps.push(...lg.apps); S.memos.push(...lg.memos); toast(`${lg.apps.length}건을 이관했어요`); view.legacy = null; location.hash = "#/apps"; }
}
function vImport() {
  const imp = view.imp;
  let preview = "";
  if (imp) {
    const okN = imp.rows.filter((r) => !r.errors.length).length, warnN = imp.rows.filter((r) => !r.errors.length && r.warns.length).length, errN = imp.rows.length - okN;
    const rows = imp.rows.slice(0, 300).map((r) => `<tr class="${r.errors.length ? "e" : r.warns.length ? "w" : ""}"><td>${r.line}</td><td>${esc(r.d.title)}</td><td>${esc(r.d.name)}</td><td>${esc(r.d.receivedAt || "")}</td><td>${esc((r.d.regions || []).join(", ") || "미정")}</td><td>${r.errors.length ? `<b>등록 안 함</b> ${esc(r.errors.join(" · "))}` : r.warns.length ? `<b>확인</b> ${esc(r.warns.join(" · "))}` : "<b>등록 가능</b>"}</td></tr>`).join("");
    preview = `<section class="panel" style="margin-top:24px"><h2 class="panel-title">미리보기: ${esc(imp.name)}</h2>
      <p class="panel-note">${imp.rows.length}행 중 <b>${okN}건 등록 가능</b>(확인 필요 ${warnN}건), ${errN}건은 등록하지 않아요. 아직 저장되지 않았어요.</p>
      ${imp.missing.length ? `<div class="hint" style="margin-bottom:14px"><b>찾지 못한 제목:</b> ${esc(imp.missing.join(", "))}. 양식의 첫 줄 제목과 같은지 확인해 주세요.</div>` : ""}
      <div class="tblwrap"><table class="tbl"><thead><tr><th>줄</th><th>작품명</th><th>신청자</th><th>접수일</th><th>지역</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${imp.rows.length > 300 ? `<p class="panel-note" style="margin-top:10px">앞의 300행만 보여드려요. 등록은 전체 행에 적용돼요.</p>` : ""}
      <div class="wiz-nav"><button class="btn" data-act="xlcancel">취소</button><button class="btn rec" data-act="xlcommit" ${okN ? "" : "disabled"}><span class="rec-dot"></span>${okN}건 등록</button></div></section>`;
  }
  let legacy = "";
  const lg = view.legacy;
  if (lg) {
    const withLinks = lg.apps.filter((a) => a.files.length).length, sample = lg.apps.slice(0, 8).map((a) => `<tr><td>${esc(a.id)}</td><td>${esc(a.title)}</td><td>${esc(a.applicant.name)}</td><td>${esc(a.receivedAt)}</td><td>${esc(a.supports.map((x) => x.region).join(", "))}</td></tr>`).join("");
    legacy = `<section class="panel" style="margin-top:24px"><h2 class="panel-title">이관 미리보기: ${esc(lg.name)}</h2>
      <p class="panel-note">신청 <b>${lg.apps.length}건</b>과 메모 <b>${lg.memos.length}건</b>을 옮겨요. 이미 있는 접수번호 ${lg.skipped.length}건은 건너뜁니다. <b>중복으로 보고 뺀 행 ${lg.dups.length}건</b>(같은 작품·신청자·접수일·요청 내용 반복), 진행관리에 없어 <b>새 접수번호로 등록하는 응답 ${lg.fresh.length}건</b>. 첨부 링크가 있는 신청 ${withLinks}건${lg.warns.length ? `, 신청서 원문을 찾지 못한 신청 ${lg.warns.length}건(감독·작품내용 등이 비어요)` : ""}. 아직 저장되지 않았어요.</p>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>접수번호</th><th>작품명</th><th>신청자</th><th>접수일</th><th>지역</th></tr></thead><tbody>${sample}</tbody></table></div>
      <div class="wiz-nav"><button class="btn" data-act="lgcancel">취소</button><button class="btn rec" data-act="lgcommit" ${lg.apps.length ? "" : "disabled"}><span class="rec-dot"></span>${lg.apps.length}건 이관하기</button></div></section>`;
  }
  return `<header class="top"><div><h1>엑셀 등록·가져오기</h1><p>엑셀 파일로 신청을 한꺼번에 등록하고, 기존 자료와 외부 접수 사이트를 연결합니다.</p></div></header>
  <section class="panel"><h2 class="panel-title">엑셀로 신청 등록</h2><p class="panel-note">양식을 받아 채운 뒤 올려 주세요. 올리면 저장 전에 미리보기로 확인할 수 있어요. 접수번호는 자동으로 붙고, 첨부파일은 등록 후 신청 상세에서 추가해요.</p>
    <div class="top-tools"><button class="btn" data-act="xltemplate">양식 내려받기</button>
    <label class="btn rec" style="cursor:pointer">엑셀 파일 올리기<input type="file" id="xl" class="sr" accept=".xlsx,.xls,.csv"></label></div>
    <p class="panel-note" style="margin:14px 0 0">필수 항목: 작품명, 제작사명, 신청자 이름, 연락처. 같은 작품명·신청자·접수일이 이미 있으면 중복으로 보고 등록하지 않아요.</p></section>
  ${preview}
  <section class="panel" style="margin-top:24px"><h2 class="panel-title">기존 구글 시트에서 이관</h2><p class="panel-note">시트 "경기콘텐츠진흥원 촬영지원 신청서(응답)"를 엑셀(.xlsx)로 내려받아 올려 주세요. 진행관리와 설문지 응답을 합쳐 접수번호 그대로 옮기고, 이미 있는 접수번호는 건너뛰므로 여러 번 올려도 안전해요.</p>
    <label class="btn rec" style="cursor:pointer">시트 엑셀 올리기<input type="file" id="lg" class="sr" accept=".xlsx"></label></section>
  ${legacy}
  <section class="grid-eq" style="margin-top:24px;grid-template-columns:1fr">
    <div class="panel"><h2 class="panel-title">필름코리아 접수 연동</h2><p class="panel-note" style="margin:0">API 제공 여부를 아직 확인하지 못했어요. 제공되면 새 접수를 자동으로 가져오고, 제공되지 않으면 필름코리아에서 내려받은 엑셀을 위 방식으로 올리면 됩니다. 필름코리아 엑셀의 제목 행을 알려 주시면 그대로 읽도록 맞춥니다.</p></div>
  </section>`;
}

function vSettings() {
  const chips = (l) => `<div class="chips">${l.map((x) => `<span class="chip static">${esc(x)}</span>`).join("")}</div>`;
  return `<header class="top"><div><h1>설정</h1><p>담당자 이름과 선택 항목을 관리합니다.</p></div></header>
  <section class="panel" style="margin-bottom:24px"><h2 class="panel-title">담당자</h2><p class="panel-note">로그인 계정은 하나를 같이 쓰므로, 메모를 남긴 사람은 이름으로 구분합니다.</p>
    <form id="staff" class="form-grid" style="grid-template-columns:repeat(3,1fr)">${S.staff.map((n, i) => `<label class="field"><span>담당자 ${i + 1}</span><input type="text" name="s${i}" value="${esc(n)}"></label>`).join("")}<div class="wide"><button class="btn rec" type="submit">이름 저장</button></div></form></section>
  <section class="panel" style="margin-bottom:24px"><h2 class="panel-title">선택 항목</h2><p class="panel-note">실제 서비스에서는 이곳에서 항목을 추가·수정합니다. 현재 값은 기존 시트에서 확인된 값과 추정값이 섞여 있어 확인이 필요합니다.</p>
    <div class="stack"><div><b>진행 상태</b>${chips(STATUSES)}</div><div><b>진행 방법</b>${chips(METHODS)}</div><div><b>업무 분류</b>${chips(CATEGORIES)}</div><div><b>예산 규모</b>${chips(BUDGETS)}</div></div></section>`;
}

/* ---------- 이벤트 ---------- */
function csv() {
  const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const rows = filtered().map(appRow);
  const blob = new Blob(["\ufeff" + [APP_HEAD, ...rows].map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `신청목록_${todayIso()}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
function curApp() { return S.apps.find((x) => x.id === decodeURIComponent(location.hash.split("/")[2] || "")); }
function addMemo(a, o) { const m = { id: uuid(), appNo: a.id, date: todayIso(), author: S.author, method: "기타", category: "기타", region: "", ...o }; S.memos.push(m); return m; }

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act;
  if (act === "tab") { view.filters.status = el.dataset.v; view.filters.limit = 60; route(); }
  else if (act === "more") { const y = window.scrollY; view.filters.limit += 60; route(true); window.scrollTo(0, y); }
  else if (act === "reset") { view.filters = { q: "", year: "", region: "", type: "", category: "", status: "전체", sort: "latest", limit: 60 }; route(); }
  else if (act === "csv") csv();
  else if (act === "export") { view.exp.from = $("#expfrom").value; view.exp.to = $("#expto").value; exportDashboard(); }
  else if (act === "exprange") { const n = new Date(), y = n.getFullYear(); view.exp = el.dataset.v === "year" ? { from: `${y}-01-01`, to: todayIso() } : el.dataset.v === "month" ? { from: `${y}-${pad(n.getMonth() + 1)}-01`, to: todayIso() } : { from: [...S.apps].map((a) => a.receivedAt).sort()[0], to: todayIso() }; route(); }
  else if (act === "xltemplate") downloadTemplate();
  else if (act === "xlcommit") commitImport();
  else if (act === "xlcancel") { view.imp = null; route(); }
  else if (act === "lgcommit") commitLegacy();
  else if (act === "lgcancel") { view.legacy = null; route(); }
  else if (act === "reg") { readStep(); const r = el.dataset.v, d = view.draft; d.regions = d.regions.includes(r) ? d.regions.filter((x) => x !== r) : [...d.regions, r]; el.setAttribute("aria-pressed", d.regions.includes(r)); if (d.regions.length) { d.undecided = false; const c = $('#wiz [name="undecided"]'); if (c) c.checked = false; } }
  else if (act === "prev") { readStep(); view.step--; route(); }
  else if (act === "cancel") { view.draft = null; view.step = 0; }
  else if (act === "addreg") { const a = curApp(), sel = $("#addreg"), reg = sel.value; if (!reg) return toast("추가할 지역을 먼저 선택해 주세요"); const had = a.supports.some((x) => x.region === "미정"); a.supports = a.supports.filter((x) => x.region !== "미정"); a.supports.push({ region: reg, status: "접수완료" }); const m = addMemo(a, { region: reg, text: `${reg} 지원 건을 추가했습니다.` }); route(); dbRun(async () => { if (had) q(await sb.from("supports").delete().eq("application_id", a.id).eq("region", "미정")); q(await sb.from("supports").insert({ application_id: a.id, region: reg, status: "접수완료" })); await persistMemo(m); }, `${reg} 지원 건을 추가했어요`); }
});
document.addEventListener("change", (e) => {
  const el = e.target; const act = el.dataset.act;
  if (act === "dyear") { view.dashYear = el.value; route(); }
  else if (act === "flt") { view.filters[el.dataset.k] = el.value; view.filters.limit = 60; route(); }
  else if (act === "asg") { const a = curApp(), v = el.value; a.assignee = v; dbRun(async () => q(await sb.from("applications").update({ assignee: v }).eq("id", a.id)), v ? `담당자를 ${v}로 바꿨어요` : "담당자를 비웠어요"); }
  else if (act === "sup") { const a = curApp(), sp = a.supports[Number(el.dataset.i)], to = el.value; if (to === sp.status) return; const from = sp.status, region = sp.region; sp.status = to; const m = addMemo(a, { region, text: `${region} 지원 건 상태를 변경했습니다.`, statusChange: { from, to } }); route(); dbRun(async () => { q(await sb.from("supports").update({ status: to }).eq("application_id", a.id).eq("region", region)); await persistMemo(m); }, `${region}: ${to}`); }
  else if (el.id === "lg") { if (el.files[0]) readLegacyFile(el.files[0]); }
  else if (el.id === "xl") { if (el.files[0]) readExcelFile(el.files[0]); }
  else if (el.id === "expfrom") view.exp.from = el.value;
  else if (el.id === "expto") view.exp.to = el.value;
  else if (el.id === "author") { S.author = el.value; try { localStorage.setItem(AUTHOR_KEY, el.value); } catch (x) { /* 무시 */ } if ($("#memo")) route(); }
  else if (el.name === "undecided") { readStep(); if (el.checked) { view.draft.regions = []; $$("#regchips .chip").forEach((c) => c.setAttribute("aria-pressed", "false")); } }
});
document.addEventListener("input", (e) => { if (e.target.id === "fq") { view.filters.q = e.target.value; view.filters.limit = 60; clearTimeout(input.t); input.t = setTimeout(() => { const pos = e.target.selectionStart; route(); const n = $("#fq"); n.focus(); n.setSelectionRange(pos, pos); }, 250); } });
const input = {};
document.addEventListener("submit", (e) => {
  if (!S) return;
  const f = e.target;
  if (f.id === "wiz") { e.preventDefault(); readStep(); const errs = validate(view.step); showErrs(errs); if (Object.keys(errs).length) return; if (view.step < 3) { view.step++; route(); } else saveDraft(); }
  else if (f.id === "memo") { e.preventDefault(); const a = curApp(), fd = new FormData(f), text = (fd.get("text") || "").trim(), ns = fd.get("newstatus"), rg = fd.get("region"), date = fd.get("date") || todayIso(); const err = $("#memoerr");
    if (!text) { err.textContent = "메모 내용을 입력해 주세요"; $('[name="text"]').focus(); return; }
    if (ns && !rg) { err.textContent = "상태를 바꿀 지역을 먼저 선택해 주세요"; $('[name="region"]').focus(); return; }
    let sc = null; if (ns) { const sp = a.supports.find((x) => x.region === rg); if (sp && sp.status !== ns) { sc = { from: sp.status, to: ns }; sp.status = ns; } }
    const m = addMemo(a, { date, method: fd.get("method"), category: fd.get("category"), region: rg, text, statusChange: sc }); route();
    dbRun(async () => { if (sc) q(await sb.from("supports").update({ status: ns }).eq("application_id", a.id).eq("region", rg)); await persistMemo(m); }, sc ? `메모를 저장하고 ${rg}을(를) ${ns}로 바꿨어요` : "메모를 저장했어요"); }
  else if (f.id === "flink") { e.preventDefault(); const a = curApp(), fd = new FormData(f), url = safeUrl(fd.get("furl")), name = (fd.get("fname") || "").trim() || "첨부파일"; if (!url) return toast("http(s)로 시작하는 링크를 넣어 주세요"); a.files = [...a.files, { name, url }]; const files = a.files; route(); dbRun(async () => q(await sb.from("applications").update({ files }).eq("id", a.id)), "첨부 링크를 추가했어요"); }
  else if (f.id === "staff") { e.preventDefault(); const fd = new FormData(f); const names = S.staff.map((_, i) => (fd.get("s" + i) || "").trim() || S.staff[i]); const map = Object.fromEntries(S.staff.map((o, i) => [o, names[i]])); S.apps.forEach((a) => (a.assignee = map[a.assignee] || a.assignee)); S.memos.forEach((m) => (m.author = map[m.author] || m.author)); S.author = map[S.author] || names[0]; S.staff = names; fillAuthor(); route();
    dbRun(async () => { q(await sb.from("settings").upsert({ key: "staff", value: names })); for (const [o, n] of Object.entries(map)) if (o !== n) { q(await sb.from("applications").update({ assignee: n }).eq("assignee", o)); q(await sb.from("memos").update({ author: n }).eq("author", o)); } }, "담당자 이름을 저장했어요"); }
});
function fillAuthor() { const s = $("#author"); s.innerHTML = opts(S.staff, S.author); }
window.addEventListener("hashchange", route);
async function startApp() {
  hideAuth(); $("#main").innerHTML = `<div class="panel empty"><b>불러오는 중이에요</b>잠시만 기다려 주세요.</div>`;
  try { await loadAll(); } catch (e) { console.error(e); $("#main").innerHTML = `<div class="panel empty"><b>자료를 불러오지 못했어요</b>${esc(e.message || e)}<br><br><button class="btn" onclick="location.reload()">다시 시도</button></div>`; return; }
  fillAuthor(); route();
}
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { S = null; showAuth(); } });
(async () => { const { data } = await sb.auth.getSession(); if (data.session) await startApp(); else showAuth(); })();
