// Supabase Edge Function: receives every website form (enquiry, vacancy, candidate),
// validates it, stores it (and the resume file) and emails a notification via Resend.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   Resend key with "Sending access" (never put this in the website)
//   NOTIFY_TO        where notifications go, e.g. hr@sriguruhrconsultants.com
//   NOTIFY_FROM      sender, e.g. "Sri Guru HR Website <website@sriguruhrconsultants.com>"
//   ADMIN_URL        link to the admin page, used in notification emails
//   CONTACT_PHONE    shown in the acknowledgement email, e.g. +91 81250 14466
//   ALLOWED_ORIGINS  comma-separated sites allowed to submit, e.g.
//                    https://srimouni.github.io,https://www.sriguruhrconsultants.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Deploy with JWT verification OFF (the website calls it without a login).

import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = allowedOrigins.length === 0
    ? "*"
    : origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

class BadRequest extends Error {}

type Field = [label: string, value: string | number | null];
type Prepared = {
  table: "enquiries" | "vacancies" | "candidates";
  row: Record<string, unknown>;
  subject: string;
  fields: Field[];
  replyTo: string | null;
  // Acknowledgement email to the person who submitted (only sent if they gave an email)
  ack: { name: string; subject: string; body: string };
};

function prepare(form: FormData): Prepared {
  const text = (key: string, max = 2000): string | null => {
    const v = String(form.get(key) ?? "").trim().slice(0, max);
    return v === "" ? null : v;
  };
  const required = (key: string, label: string, max = 200): string => {
    const v = text(key, max);
    if (!v) throw new BadRequest(`${label} is required.`);
    return v;
  };
  const email = (): string | null => {
    const v = text("email", 200);
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BadRequest("Please enter a valid email address.");
    return v;
  };

  switch (String(form.get("type") ?? "")) {
    case "enquiry": {
      const row = {
        name: required("name", "Name"),
        company: text("company", 200),
        email: email(),
        phone: text("phone", 30),
        service: text("service", 100),
        message: required("message", "Message", 5000),
      };
      return {
        table: "enquiries",
        row,
        subject: `New enquiry: ${row.service ?? "General"} — ${row.name}`,
        fields: [["Name", row.name], ["Company", row.company], ["Email", row.email], ["Phone", row.phone],
          ["Service", row.service], ["Message", row.message]],
        replyTo: row.email,
        ack: {
          name: row.name,
          subject: "We have received your enquiry — Sri Guru HR Consultants",
          body: "Thank you for contacting Sri Guru HR Consultants. We have received your enquiry and will get back to you soon.",
        },
      };
    }
    case "vacancy": {
      const openings = Number.parseInt(String(form.get("openings") ?? ""), 10);
      const row = {
        company: required("company", "Company name"),
        contact_person: required("name", "Contact person"),
        mobile: required("mobile", "Mobile number", 30),
        email: email(),
        role: required("role", "Position / role"),
        openings: Number.isFinite(openings) && openings > 0 && openings <= 10000 ? openings : null,
        location: text("location", 200),
        experience: text("experience", 100),
        requirements: text("notes", 5000),
      };
      return {
        table: "vacancies",
        row,
        subject: `New vacancy: ${row.role} — ${row.company}`,
        fields: [["Company", row.company], ["Contact person", row.contact_person], ["Mobile", row.mobile],
          ["Email", row.email], ["Position / role", row.role], ["Number of openings", row.openings],
          ["Job location", row.location], ["Experience needed", row.experience], ["Requirements / notes", row.requirements]],
        replyTo: row.email,
        ack: {
          name: row.contact_person,
          subject: `We have received your vacancy: ${row.role} — Sri Guru HR Consultants`,
          body: `Thank you for sharing the ${row.role} vacancy at ${row.company} with Sri Guru HR Consultants. We have received the details and will get in touch with you soon.`,
        },
      };
    }
    case "candidate": {
      if (String(form.get("consent") ?? "") !== "yes") {
        throw new BadRequest("Please agree to us storing your details.");
      }
      const row = {
        name: required("name", "Name"),
        mobile: required("mobile", "Mobile number", 30),
        email: email(),
        position: required("position", "Position & department"),
        qualification: text("qualification", 200),
        experience: text("experience", 100),
        notice_period: text("notice", 50),
        present_org: text("present_org", 300),
        previous_orgs: text("previous_orgs", 2000),
        ctc_present: text("ctc_present", 50),
        ctc_expected: text("ctc_expected", 50),
        languages: text("languages", 200),
        skills: text("skills", 5000),
        consent: true,
      };
      return {
        table: "candidates",
        row,
        subject: `New candidate: ${row.position} — ${row.name}`,
        fields: [["Name", row.name], ["Mobile", row.mobile], ["E-mail", row.email],
          ["Position & department", row.position], ["Qualification", row.qualification],
          ["Total experience", row.experience], ["Notice period", row.notice_period],
          ["Present organisation & location", row.present_org], ["Previous organisations & locations", row.previous_orgs],
          ["Present CTC", row.ctc_present], ["Expected CTC", row.ctc_expected],
          ["Languages known", row.languages], ["Present role / skills", row.skills]],
        replyTo: row.email,
        ack: {
          name: row.name,
          subject: "We have received your resume — Sri Guru HR Consultants",
          body: `Thank you for sharing your profile for ${row.position} with Sri Guru HR Consultants. We have received your candidate summary and resume, and will contact you when a suitable role comes up. Your details are used only to contact you about suitable roles.`,
        },
      };
    }
    default:
      throw new BadRequest("Unknown form.");
  }
}

// Validate the resume and return what we need to store and attach it
async function readResume(form: FormData) {
  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) throw new BadRequest("Please attach your resume.");
  if (file.size > MAX_RESUME_BYTES) throw new BadRequest("Resume must be 5 MB or smaller.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = RESUME_TYPES[ext];
  if (!contentType) throw new BadRequest("Resume must be a PDF or Word document.");
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-100);
  const now = new Date();
  const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  return { bytes: new Uint8Array(await file.arrayBuffer()), contentType, path, name: safeName };
}

const FROM = () => Deno.env.get("NOTIFY_FROM") ?? "Sri Guru HR Website <onboarding@resend.dev>";

async function sendEmail(message: Record<string, unknown>) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("[submit] RESEND_API_KEY not set — email skipped");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), ...message }),
  });
  if (!res.ok) console.error("[submit] Resend failed:", res.status, await res.text().catch(() => ""));
}

// Notification to the firm, with the resume attached for candidates
async function notify(p: Prepared, attachment?: { name: string; bytes: Uint8Array }) {
  const to = Deno.env.get("NOTIFY_TO");
  if (!to) {
    console.warn("[submit] NOTIFY_TO not set — notification skipped");
    return;
  }
  const adminUrl = Deno.env.get("ADMIN_URL");
  const rows = p.fields
    .filter(([, v]) => v !== null && v !== "")
    .map(([label, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#5a6680;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>` +
      `<td style="padding:6px 0;color:#0f1b3d">${escapeHtml(String(v)).replace(/\n/g, "<br>")}</td></tr>`
    ).join("");
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px">` +
    `<h2 style="color:#12245c;font-size:18px;margin:0 0 12px">${escapeHtml(p.subject)}</h2>` +
    `<table style="border-collapse:collapse">${rows}</table>` +
    (attachment ? `<p style="color:#5a6680">Resume attached: ${escapeHtml(attachment.name)}</p>` : "") +
    (adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">Open the admin page</a></p>` : "") +
    `</div>`;
  const text = p.fields.filter(([, v]) => v !== null && v !== "").map(([l, v]) => `${l}: ${v}`).join("\n") +
    (adminUrl ? `\n\nAdmin page: ${adminUrl}` : "");

  await sendEmail({
    to: to.split(",").map((s) => s.trim()),
    subject: p.subject,
    html,
    text,
    ...(p.replyTo ? { reply_to: p.replyTo } : {}),
    ...(attachment ? { attachments: [{ filename: attachment.name, content: encodeBase64(attachment.bytes) }] } : {}),
  });
}

// "We have received your details" email to the person who submitted
async function acknowledge(p: Prepared) {
  if (!p.replyTo) return;
  const firmEmail = (Deno.env.get("NOTIFY_TO") ?? "").split(",")[0].trim();
  const phone = Deno.env.get("CONTACT_PHONE") ?? "";
  const contact = [phone && `Phone / WhatsApp: ${phone}`, firmEmail && `Email: ${firmEmail}`].filter(Boolean);
  const text = [
    `Dear ${p.ack.name},`,
    "",
    p.ack.body,
    "",
    ...(contact.length ? [...contact, ""] : []),
    "Warm regards,",
    "Sri Guru HR Consultants",
    "Specialists in workforce optimisation",
  ].join("\n");
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f1b3d;line-height:1.6">` +
    `<p>Dear ${escapeHtml(p.ack.name)},</p><p>${escapeHtml(p.ack.body)}</p>` +
    (contact.length ? `<p style="color:#5a6680">${contact.map(escapeHtml).join("<br>")}</p>` : "") +
    `<p>Warm regards,<br><strong>Sri Guru HR Consultants</strong><br>` +
    `<span style="color:#5a6680">Specialists in workforce optimisation</span></p></div>`;
  await sendEmail({
    to: [p.replyTo],
    subject: p.ack.subject,
    html,
    text,
    ...(firmEmail ? { reply_to: firmEmail } : {}),
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  try {
    const form = await req.formData();
    // Spam trap: hidden checkbox real visitors never tick — pretend success
    if (form.get("botcheck")) return json({ ok: true });

    const prepared = prepare(form);
    let resume: Awaited<ReturnType<typeof readResume>> | undefined;

    if (prepared.table === "candidates") {
      resume = await readResume(form);
      const { error } = await supabase.storage.from("resumes")
        .upload(resume.path, resume.bytes, { contentType: resume.contentType, upsert: false });
      if (error) throw error;
      prepared.row.resume_path = resume.path;
      prepared.row.resume_name = resume.name;
    }

    const { error } = await supabase.from(prepared.table).insert(prepared.row);
    if (error) {
      if (resume) await supabase.storage.from("resumes").remove([resume.path]);
      throw error;
    }

    // The submission is saved; a failed email must not turn it into an error
    const emails = await Promise.allSettled([
      notify(prepared, resume ? { name: resume.name, bytes: resume.bytes } : undefined),
      acknowledge(prepared),
    ]);
    emails.forEach((r) => r.status === "rejected" && console.error("[submit] email error:", r.reason));

    return json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return json({ ok: false, error: e.message }, 400);
    console.error("[submit] error:", e);
    return json({ ok: false, error: "Something went wrong. Please try again or contact us on WhatsApp." }, 500);
  }
});
