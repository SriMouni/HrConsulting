// Admin page: sign in with Supabase Auth, list submissions, update status and
// notes, download resumes through short-lived signed links, export CSV.
// Data access is enforced by Row Level Security: only users in public.admins see rows.

const cfg = window.SG_CONFIG || {};
const $ = (selector) => document.querySelector(selector);
const SCREENS = ["screen-setup", "screen-login", "screen-reset", "screen-app"];

function show(id) {
  SCREENS.forEach((s) => (document.getElementById(s).hidden = s !== id));
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
  show("screen-setup");
} else {
  start(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey));
}

function start(sb) {
  // ── Record types ──────────────────────────────────────────────────────────
  const fmtDate = (iso) =>
    new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const VIEWS = {
    candidates: {
      label: "candidates",
      statuses: ["new", "shortlisted", "interviewing", "placed", "on_hold", "rejected"],
      search: ["name", "mobile", "email", "position", "qualification", "present_org", "previous_orgs", "skills", "languages"],
      columns: ["Received", "Candidate", "Position", "Experience", "Notice", "CTC (present → expected)", "Status", ""],
      cells: (r) => [
        text(fmtDate(r.created_at), "nowrap"),
        person(r.name, r.mobile, r.email),
        text(r.position),
        text(r.experience),
        text(r.notice_period, "nowrap"),
        text([r.ctc_present || "–", r.ctc_expected || "–"].join(" → "), "nowrap"),
        "status",
        "actions",
      ],
      details: [
        ["Name", "name"], ["Mobile", "mobile"], ["E-mail", "email"], ["Position & department", "position"],
        ["Qualification", "qualification"], ["Total experience", "experience"], ["Notice period", "notice_period"],
        ["Present organisation & location", "present_org"], ["Previous organisations & locations", "previous_orgs"],
        ["Present CTC", "ctc_present"], ["Expected CTC", "ctc_expected"], ["Languages known", "languages"],
        ["Present role / skills", "skills"], ["Resume file", "resume_name"],
      ],
    },
    vacancies: {
      label: "vacancies",
      statuses: ["new", "in_progress", "filled", "closed"],
      search: ["company", "contact_person", "mobile", "email", "role", "location", "requirements"],
      columns: ["Received", "Company", "Role", "Openings", "Location", "Experience", "Status", ""],
      cells: (r) => [
        text(fmtDate(r.created_at), "nowrap"),
        person(r.company, r.mobile, r.email, r.contact_person),
        text(r.role),
        text(r.openings),
        text(r.location),
        text(r.experience),
        "status",
        "actions",
      ],
      details: [
        ["Company", "company"], ["Contact person", "contact_person"], ["Mobile", "mobile"], ["E-mail", "email"],
        ["Position / role", "role"], ["Number of openings", "openings"], ["Job location", "location"],
        ["Experience needed", "experience"], ["Requirements / notes", "requirements"],
      ],
    },
    enquiries: {
      label: "enquiries",
      statuses: ["new", "contacted", "closed"],
      search: ["name", "company", "email", "phone", "service", "message"],
      columns: ["Received", "From", "Service", "Message", "Status", ""],
      cells: (r) => [
        text(fmtDate(r.created_at), "nowrap"),
        person(r.name, r.phone, r.email, r.company),
        text(r.service),
        text(r.message, "clip"),
        "status",
        "actions",
      ],
      details: [
        ["Name", "name"], ["Company", "company"], ["E-mail", "email"], ["Phone", "phone"],
        ["Service", "service"], ["Message", "message"],
      ],
    },
  };

  const state = { view: "candidates", data: { candidates: [], vacancies: [], enquiries: [] }, open: new Set() };
  const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  // ── DOM helpers (textContent only, so submitted text can never inject HTML) ─
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.flat().forEach((c) => c != null && node.append(c instanceof Node ? c : String(c)));
    return node;
  }
  function text(value, cls) {
    return el("span", cls ? { class: cls } : {}, value == null || value === "" ? "–" : String(value));
  }
  // Indian 10-digit numbers get the 91 prefix for WhatsApp links
  function waNumber(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.length === 10 ? `91${digits}` : digits;
  }
  function person(primary, phone, email, extra) {
    const wrap = el("div", {}, el("span", { class: "primary" }, primary || "–"));
    if (extra) wrap.append(el("span", { class: "secondary" }, extra));
    if (phone) {
      wrap.append(el("span", { class: "secondary" },
        el("a", { href: `tel:${phone}` }, phone), " · ",
        el("a", { href: `https://wa.me/${waNumber(phone)}`, target: "_blank", rel: "noopener" }, "WhatsApp")));
    }
    if (email) wrap.append(el("span", { class: "secondary" }, el("a", { href: `mailto:${email}` }, email)));
    return wrap;
  }
  const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';

  // ── Auth ─────────────────────────────────────────────────────────────────
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") show("screen-reset");
    else if (event === "SIGNED_OUT") show("screen-login");
    else if (event === "SIGNED_IN" && $("#screen-app").hidden) route(session);
  });
  sb.auth.getSession().then(({ data }) => {
    if (!location.hash.includes("type=recovery")) route(data.session);
  });

  async function route(session) {
    if (!session) return show("screen-login");
    const { data: admin } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (!admin) {
      await sb.auth.signOut();
      show("screen-login");
      return setNote("#login-note", "This account does not have admin access.", true);
    }
    $("#user-email").textContent = session.user.email;
    show("screen-app");
    selectView(state.view);
    load();
  }

  function setNote(selector, message, isError = false) {
    const note = $(selector);
    note.textContent = message;
    note.classList.toggle("error", isError);
  }

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return setNote("#login-note", "Enter your email and password.", true);
    setNote("#login-note", "Signing in…");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) setNote("#login-note", "Email or password is incorrect.", true);
    else form.reset();
  });

  $("#forgot-btn").addEventListener("click", async () => {
    const email = $("#login-form").email.value.trim();
    if (!email) return setNote("#login-note", "Enter your email above first, then click Forgot password.", true);
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    setNote("#login-note", "If that email has an admin account, a reset link has been sent.");
  });

  $("#reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = event.target.password.value;
    if (password.length < 8) return setNote("#reset-note", "Use at least 8 characters.", true);
    const { error } = await sb.auth.updateUser({ password });
    if (error) return setNote("#reset-note", error.message, true);
    history.replaceState(null, "", location.pathname);
    const { data } = await sb.auth.getSession();
    route(data.session);
  });

  $("#signout-btn").addEventListener("click", () => sb.auth.signOut());

  // ── Data ─────────────────────────────────────────────────────────────────
  async function load() {
    $("#summary").textContent = "Loading…";
    const results = await Promise.all(Object.keys(VIEWS).map((name) =>
      sb.from(name).select("*").order("created_at", { ascending: false }).limit(2000)));
    Object.keys(VIEWS).forEach((name, i) => {
      if (results[i].error) toast(`Could not load ${name}: ${results[i].error.message}`);
      state.data[name] = results[i].data || [];
      const fresh = state.data[name].filter((r) => r.status === "new").length;
      document.querySelector(`[data-count="${name}"]`).textContent = fresh ? `${fresh} new` : state.data[name].length;
    });
    render();
  }

  function filtered() {
    const view = VIEWS[state.view];
    const q = $("#search").value.trim().toLowerCase();
    const status = $("#status-filter").value;
    return state.data[state.view].filter((r) =>
      (!status || r.status === status) &&
      (!q || view.search.some((f) => String(r[f] ?? "").toLowerCase().includes(q))));
  }

  function selectView(name) {
    state.view = name;
    document.querySelectorAll(".admin-tabs [data-view]").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.view === name)));
    const filter = $("#status-filter");
    filter.replaceChildren(el("option", { value: "" }, "All statuses"),
      ...VIEWS[name].statuses.map((s) => el("option", { value: s }, statusLabel(s))));
    render();
  }

  function render() {
    const view = VIEWS[state.view];
    const rows = filtered();
    const total = state.data[state.view].length;
    $("#summary").textContent = rows.length === total
      ? `${total} ${view.label}`
      : `Showing ${rows.length} of ${total} ${view.label}`;

    const table = $("#records");
    const head = el("thead", {}, el("tr", {}, view.columns.map((c) => el("th", {}, c))));
    const body = el("tbody");
    if (!rows.length) {
      body.append(el("tr", {}, el("td", { class: "empty", colspan: view.columns.length },
        total ? "No records match your search." : `No ${view.label} yet.`)));
    }
    rows.forEach((r) => {
      const tr = el("tr", r.status === "new" ? { class: "is-new" } : {});
      view.cells(r).forEach((cell) => {
        if (cell === "status") tr.append(el("td", {}, statusSelect(r)));
        else if (cell === "actions") tr.append(el("td", {}, actions(r)));
        else tr.append(el("td", {}, cell));
      });
      body.append(tr);
      if (state.open.has(r.id)) body.append(detailRow(r, view));
    });
    table.replaceChildren(head, body);
  }

  function statusSelect(r) {
    const select = el("select", { "aria-label": "Status" },
      VIEWS[state.view].statuses.map((s) => {
        const o = el("option", { value: s }, statusLabel(s));
        if (s === r.status) o.selected = true;
        return o;
      }));
    select.addEventListener("change", () => update(r, { status: select.value }, `Status set to ${statusLabel(select.value)}`));
    return select;
  }

  function actions(r) {
    const wrap = el("div", { class: "row-actions" });
    if (r.resume_path) {
      const btn = el("button", { type: "button", class: "mini-btn download", title: r.resume_name || "Resume" });
      btn.innerHTML = ICON_DOWNLOAD;
      btn.append("Resume");
      btn.addEventListener("click", () => downloadResume(r));
      wrap.append(btn);
    }
    wrap.append(el("button", {
      type: "button",
      class: "mini-btn",
      onclick: () => {
        state.open.has(r.id) ? state.open.delete(r.id) : state.open.add(r.id);
        render();
      },
    }, state.open.has(r.id) ? "Hide" : "Details"));
    return wrap;
  }

  function detailRow(r, view) {
    const grid = el("dl", { class: "detail-grid" },
      view.details.map(([label, key]) => el("div", {}, el("dt", {}, label), el("dd", {}, r[key] == null || r[key] === "" ? "–" : String(r[key])))));
    const notes = el("textarea", { rows: "3", placeholder: "Private notes (only visible to admins)" });
    notes.value = r.admin_notes || "";
    const save = el("button", { type: "button", class: "mini-btn", onclick: () => update(r, { admin_notes: notes.value.trim() || null }, "Notes saved") }, "Save notes");
    const notesBox = el("div", { class: "detail-notes" }, el("label", {}, "Admin notes", notes), save);
    return el("tr", { class: "detail-row" }, el("td", { colspan: view.columns.length }, grid, notesBox));
  }

  async function update(r, changes, message) {
    const { error } = await sb.from(state.view).update(changes).eq("id", r.id);
    if (error) return toast(`Not saved: ${error.message}`);
    Object.assign(r, changes);
    toast(message);
    render();
  }

  async function downloadResume(r) {
    const { data, error } = await sb.storage.from("resumes")
      .createSignedUrl(r.resume_path, 60, { download: r.resume_name || true });
    if (error) return toast(`Could not get the resume: ${error.message}`);
    window.location.href = data.signedUrl;
  }

  // CSV of the rows currently shown (search and status filter applied)
  function exportCsv() {
    const view = VIEWS[state.view];
    const rows = filtered();
    if (!rows.length) return toast("Nothing to export.");
    const fields = [["Received", "created_at"], ["Status", "status"], ...view.details, ["Admin notes", "admin_notes"]];
    const cell = (v) => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [fields.map(([label]) => cell(label)).join(",")]
      .concat(rows.map((r) => fields.map(([, key]) => cell(key === "created_at" ? fmtDate(r[key]) : r[key])).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `sriguru-${state.view}-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  document.querySelectorAll(".admin-tabs [data-view]").forEach((b) =>
    b.addEventListener("click", () => selectView(b.dataset.view)));
  $("#search").addEventListener("input", render);
  $("#status-filter").addEventListener("change", render);
  $("#refresh-btn").addEventListener("click", load);
  $("#export-btn").addEventListener("click", exportCsv);
}
