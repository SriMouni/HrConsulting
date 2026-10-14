// Theme toggle (initial theme is set by the inline script in <head>)
const root = document.documentElement;
const themeToggle = document.querySelector(".theme-toggle");

function updateThemeLabel() {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
}

themeToggle.addEventListener("click", () => {
  const theme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", theme);
  try { localStorage.setItem("theme", theme); } catch (e) {}
  updateThemeLabel();
});

updateThemeLabel();

// Mobile navigation
const navToggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("site-nav");

function setNav(open) {
  nav.classList.toggle("open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

navToggle.addEventListener("click", () => setNav(!nav.classList.contains("open")));
nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setNav(false)));

// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Reveal content on scroll
const revealTargets = document.querySelectorAll(
  ".section-head, .about-grid > *, .service, .mg-card, .track, .t-card, .careers-grid > *, .contact-wrap"
);
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      }),
    { threshold: 0.12 }
  );
  revealTargets.forEach((el) => {
    el.classList.add("reveal");
    observer.observe(el);
  });
}

// Forms: "Send" posts to the Supabase `submit` function, which stores the
// submission (and resume) and emails us. WhatsApp opens a pre-written chat.
// Until Supabase is configured in js/config.js, "Send" opens the visitor's email app.
const WHATSAPP_NUMBER = "918125014466";
const EMAIL = "hr@sriguruhrconsultants.com";
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

const SUBMIT_URL = window.SG_CONFIG?.supabaseUrl
  ? `${window.SG_CONFIG.supabaseUrl.replace(/\/$/, "")}/functions/v1/submit`
  : "";

// Post a form to the back end; resolves { ok, error? }
async function submitOnline(form, type) {
  const data = new FormData(form);
  data.append("type", type);
  try {
    const res = await fetch(SUBMIT_URL, { method: "POST", body: data });
    const body = await res.json().catch(() => ({}));
    return res.ok && body.ok ? { ok: true } : { ok: false, error: body.error };
  } catch (e) {
    return { ok: false };
  }
}

const forms = {
  "contact-form": {
    type: "enquiry",
    success: "✓ Sent! We have received your enquiry and will get back to you soon.",
    error: "Please fill in your name and a message (and check the email address, if given).",
    build: (d) => ({
      subject: `Enquiry: ${d.get("service")} — ${d.get("name")}`,
      lines: [
        ["Name", d.get("name")],
        ["Company", d.get("company")],
        ["Email", d.get("email")],
        ["Phone", d.get("phone")],
        ["Service", d.get("service")],
      ],
      intro: "Hello Sri Guru HR Consultants, I have an enquiry.",
      message: d.get("message"),
    }),
  },
  "resume-form": {
    type: "candidate",
    success: "✓ Thank you! Your application and resume have been received.",
    error: "Please fill in your name, mobile number and the position you are applying for.",
    attach: true,
    build: (d) => ({
      subject: `Resume: ${d.get("position")} — ${d.get("name")}`,
      lines: [
        ["Name", d.get("name")],
        ["Mobile", d.get("mobile")],
        ["E-mail", d.get("email")],
        ["Position & department", d.get("position")],
        ["Qualification", d.get("qualification")],
        ["Total experience", d.get("experience")],
        ["Present organisation & location", d.get("present_org")],
        ["Previous organisations & locations", d.get("previous_orgs")],
        ["CTC (present / expected)", [d.get("ctc_present"), d.get("ctc_expected")].map((v) => v.trim() || "-").join(" / ").replace(/^- \/ -$/, "")],
        ["Notice period", d.get("notice")],
        ["Languages known", d.get("languages")],
        ["Present role / skills", d.get("skills")],
      ],
      intro: "Hello Sri Guru HR Consultants, please find my candidate summary below.",
      message: "My resume is attached.",
    }),
  },
  "vacancy-form": {
    type: "vacancy",
    success: "✓ Sent! We have received your vacancy details and will be in touch soon.",
    error: "Please fill in the company name, contact person, mobile number and position.",
    build: (d) => ({
      subject: `Vacancy: ${d.get("role")} — ${d.get("company")}`,
      lines: [
        ["Company", d.get("company")],
        ["Contact person", d.get("name")],
        ["Mobile", d.get("mobile")],
        ["E-mail", d.get("email")],
        ["Position / role", d.get("role")],
        ["Number of openings", d.get("openings")],
        ["Job location", d.get("location")],
        ["Experience needed", d.get("experience")],
        ["Requirements / notes", d.get("notes")],
      ],
      intro: "Hello Sri Guru HR Consultants, we would like to share a vacancy.",
      message: "Please get in touch to discuss.",
    }),
  },
};

Object.entries(forms).forEach(([id, config]) => {
  const form = document.getElementById(id);
  const note = form.querySelector(".form-note");

  form.querySelectorAll("[data-send]").forEach((button) =>
    button.addEventListener("click", async () => {
      // Spam trap: real visitors never see or tick this box
      if (form.querySelector('[name="botcheck"]')?.checked) return;

      let valid = true;
      form.querySelectorAll("input:not([name='botcheck']), textarea").forEach((field) => {
        const ok = field.checkValidity() && (!field.required || field.value.trim() !== "");
        field.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });

      if (!valid) {
        note.textContent = config.error;
        note.classList.add("error");
        return;
      }

      const msg = config.build(new FormData(form));
      const details = msg.lines.filter(([, value]) => value && value.trim());

      if (button.dataset.send === "whatsapp") {
        const text = [
          msg.intro,
          "",
          ...details.map(([label, value]) => `*${label}:* ${value.trim()}`),
          "",
          msg.message,
        ].join("\n");
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        note.textContent = config.attach
          ? "WhatsApp is opening. Tap the 📎 clip icon to attach your resume, then send."
          : "WhatsApp is opening with your details. Just press send.";
      } else if (SUBMIT_URL) {
        // Resumes need the file and consent before uploading
        if (config.attach) {
          const file = form.querySelector('[name="resume"]');
          const consent = form.querySelector('[name="consent"]');
          const chosen = file.files[0];
          const fileProblem = !chosen
            ? "Please attach your resume (PDF or Word)."
            : chosen.size > MAX_RESUME_BYTES
              ? "Your resume is larger than 5 MB. Please attach a smaller file."
              : !/\.(pdf|docx?)$/i.test(chosen.name)
                ? "Your resume must be a PDF or Word document."
                : "";
          file.classList.toggle("invalid", fileProblem !== "");
          const problem = fileProblem || (consent.checked ? "" : "Please tick the box to agree to us storing your details.");
          if (problem) {
            note.textContent = problem;
            note.classList.add("error");
            return;
          }
        }

        const buttons = form.querySelectorAll("[data-send]");
        buttons.forEach((b) => (b.disabled = true));
        note.classList.remove("error");
        note.textContent = config.attach ? "Uploading your resume…" : "Sending…";
        const result = await submitOnline(form, config.type);
        buttons.forEach((b) => (b.disabled = false));
        if (result.ok) {
          form.reset();
          note.textContent = config.success;
        } else {
          note.textContent = result.error || "Sorry, that didn't send. Please try WhatsApp, or call 81250 14466.";
          note.classList.add("error");
        }
        return;
      } else {
        const body = [
          ...details.map(([label, value]) => `${label}: ${value.trim()}`),
          "",
          msg.message,
        ].join("\n");
        window.location.href =
          `mailto:${EMAIL}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(body)}`;
        note.textContent = config.attach
          ? "Your email app is opening. Attach your resume, then send."
          : "Your email app is opening with your details. Just press send.";
      }
      note.classList.remove("error");
    })
  );
});

// Contact tabs: general enquiry / share a vacancy
const tabs = [...document.querySelectorAll('.form-tabs [role="tab"]')];

function selectTab(tab) {
  tabs.forEach((t) => {
    const selected = t === tab;
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
  });
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const next = tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next);
    next.focus();
  });
});

// "Share a vacancy" buttons jump to the contact card with the vacancy tab open
document.querySelectorAll("[data-open-vacancy]").forEach((button) =>
  button.addEventListener("click", () => {
    selectTab(document.getElementById("tab-vacancy"));
    document.getElementById("contact").scrollIntoView({ behavior: "smooth" });
    document.querySelector('#vacancy-form [name="company"]').focus({ preventScroll: true });
  })
);
