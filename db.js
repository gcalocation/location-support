/* Supabase 연결, 로그인, 데이터 읽기·쓰기 */
const SB_URL = "https://ldvjtujmzqfaoiljwtbe.supabase.co";
/* 공개용(publishable) 키입니다. 데이터 보호는 DB의 접근 규칙(RLS)과 허용 이메일 목록이 맡습니다. */
const SB_KEY = "sb_publishable_NdR_WTTTiHGxKjOcTl2xpQ_yuOVPQ8o";
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const AUTHOR_KEY = "loc-author";

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

/* ---------- 행 변환 ---------- */
const appFromRow = (r, supports) => ({
  id: r.id, receivedAt: r.received_at, source: r.source, title: r.title, director: r.director, cast: r.cast_members, kind: r.kind, type: r.work_type, media: r.media, budget: r.budget,
  staff: r.staff_count, crankIn: r.crank_in || "", crankUp: r.crank_up || "", synopsis: r.synopsis, company: r.company,
  applicant: { name: r.applicant_name, role: r.applicant_role, phone: r.applicant_phone, email: r.applicant_email },
  request: r.request, assignee: r.assignee, files: Array.isArray(r.files) ? r.files : [], drivePath: r.drive_path || "", legacyNo: r.legacy_no || "", supports,
});
const appToRow = (a) => ({
  id: a.id, received_at: a.receivedAt, source: a.source, title: a.title, director: a.director || "-", cast_members: a.cast || "-", kind: a.kind, work_type: a.type, media: a.media || "-", budget: a.budget || "-",
  staff_count: Number(a.staff) || 0, crank_in: a.crankIn || null, crank_up: a.crankUp || null, synopsis: a.synopsis || "-", company: a.company,
  applicant_name: a.applicant.name, applicant_role: a.applicant.role || "-", applicant_phone: a.applicant.phone || "", applicant_email: a.applicant.email || "-",
  request: a.request || "-", assignee: a.assignee || "", files: a.files || [], drive_path: a.drivePath || "", legacy_no: a.legacyNo || "",
});
const memoFromRow = (m) => ({ id: m.id, appNo: m.application_id, date: m.memo_date, author: m.author, method: m.method, category: m.category, region: m.region, text: m.body, statusChange: m.status_to ? { from: m.status_from || "", to: m.status_to } : null });
const memoToRow = (m) => ({ id: m.id, application_id: m.appNo, memo_date: m.date, author: m.author, method: m.method, category: m.category, region: m.region || "", body: m.text, status_from: m.statusChange ? m.statusChange.from : null, status_to: m.statusChange ? m.statusChange.to : null });

/* ---------- 읽기 ---------- */
async function fetchAll(table, orderCol) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select("*").order(orderCol, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}
async function loadAll() {
  const [apps, sups, memos, st] = await Promise.all([fetchAll("applications", "id"), fetchAll("supports", "region"), fetchAll("memos", "created_at"), sb.from("settings").select("value").eq("key", "staff").maybeSingle()]);
  if (st.error) throw st.error;
  const by = {};
  sups.forEach((s) => (by[s.application_id] = by[s.application_id] || []).push({ region: s.region, status: s.status }));
  const staff = st.data && Array.isArray(st.data.value) && st.data.value.length ? st.data.value : [...STAFF];
  let author = ""; try { author = localStorage.getItem(AUTHOR_KEY) || ""; } catch (e) { /* 저장소 사용 불가 */ }
  S = { apps: apps.map((r) => appFromRow(r, by[r.id] || [])), memos: memos.map(memoFromRow), staff, author: staff.includes(author) ? author : staff[0] };
}
async function reloadData() { try { await loadAll(); } catch (e) { console.error(e); } }

/* ---------- 쓰기 ---------- */
async function insertBatch(table, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + size));
    if (error) throw error;
  }
}
async function persistNewApps(apps) {
  await insertBatch("applications", apps.map(appToRow));
  try {
    await insertBatch("supports", apps.flatMap((a) => a.supports.map((s) => ({ application_id: a.id, region: s.region, status: s.status }))));
  } catch (e) {
    /* 지원 건 저장에 실패하면 방금 넣은 신청도 지워 절반만 저장되는 일을 막는다 */
    await sb.from("applications").delete().in("id", apps.map((a) => a.id));
    throw e;
  }
}
async function persistMemo(m) { await insertBatch("memos", [memoToRow(m)]); }
async function dbRun(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) { console.error(e); toast("저장하지 못했어요: " + (e.message || e)); await reloadData(); route(); return false; }
}
const q = (r) => { if (r.error) throw r.error; return r; };

/* ---------- 로그인 화면 ---------- */
function authMessage(e) {
  const m = String((e && e.message) || e || "");
  if (/Invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 맞지 않아요";
  if (/Email not confirmed/i.test(m)) return "메일 확인이 아직 안 됐어요. 받은 편지함의 확인 링크를 눌러 주세요";
  if (/Database error|허용되지 않은/i.test(m)) return "허용된 이메일만 가입할 수 있어요";
  if (/already registered|already been registered/i.test(m)) return "이미 가입된 이메일이에요. 로그인해 주세요";
  if (/Password should be at least/i.test(m)) return "비밀번호는 6자 이상이어야 해요";
  if (/rate limit|too many/i.test(m)) return "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요";
  return "문제가 생겼어요: " + m;
}
function showAuth(mode = "login", note = "") {
  const el = $("#auth"); el.hidden = false; document.body.classList.add("locked");
  const signup = mode === "signup";
  el.innerHTML = `<form class="panel auth-card" id="authform" novalidate>
    <div class="brand" style="margin-bottom:6px"><div class="brand-mark" aria-hidden="true"><i></i></div><div><div class="brand-name">로케이션 지원<br>관리 시스템</div><div class="brand-sub">경기콘텐츠진흥원 · 담당자 전용</div></div></div>
    <h1 style="font-size:1.25rem;font-weight:800">${signup ? "비밀번호 만들기" : "로그인"}</h1>
    <label class="field"><span>이메일</span><input type="email" name="email" autocomplete="username" required></label>
    <label class="field"><span>비밀번호</span><input type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" required minlength="6"></label>
    ${signup ? `<label class="field"><span>비밀번호 확인</span><input type="password" name="password2" autocomplete="new-password" required></label>` : ""}
    <p class="err" id="autherr" role="alert" style="min-height:1.2em">${esc(note)}</p>
    <button class="btn rec" type="submit" style="justify-content:center">${signup ? "가입하고 확인 메일 받기" : "로그인"}</button>
    <button class="btn sm" type="button" data-auth="${signup ? "login" : "signup"}" style="justify-content:center">${signup ? "이미 만들었어요, 로그인" : "처음이에요, 비밀번호 만들기"}</button>
  </form>`;
  const first = $("#authform input"); if (first) first.focus();
}
function hideAuth() { const el = $("#auth"); el.hidden = true; el.innerHTML = ""; document.body.classList.remove("locked"); }
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-auth]"); if (b) showAuth(b.dataset.auth);
  if (e.target.closest("[data-logout]")) sb.auth.signOut();
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "authform") return;
  e.preventDefault();
  const f = e.target, email = f.email.value.trim(), pw = f.password.value, signup = !!f.password2, err = $("#autherr"), btn = $("button[type=submit]", f);
  if (!email || !pw) { err.textContent = "이메일과 비밀번호를 입력해 주세요"; return; }
  if (signup && pw !== f.password2.value) { err.textContent = "비밀번호가 서로 달라요"; return; }
  btn.disabled = true; err.textContent = "";
  try {
    if (signup) {
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (data.session) { await startApp(); return; }
      showAuth("login", "확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      await startApp();
    }
  } catch (ex) { err.textContent = authMessage(ex); btn.disabled = false; }
});
