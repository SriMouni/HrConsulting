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
  ".section-head, .about-grid > *, .service, .mg-card, .careers-grid > *, .contact-wrap"
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

// Forms: a static site has no server, so each form opens WhatsApp or the
// visitor's email app with the message already written
const WHATSAPP_NUMBER = "918125014466";
const EMAIL = "hr@sriguruhrconsultants.com";

const forms = {
  "contact-form": {
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
    error: "Please fill in your name and the role you are looking for.",
    attach: true,
    build: (d) => ({
      subject: `Resume: ${d.get("role")} — ${d.get("name")}`,
      lines: [
        ["Name", d.get("name")],
        ["Phone", d.get("phone")],
        ["Role", d.get("role")],
        ["Experience", d.get("experience")],
      ],
      intro: "Hello Sri Guru HR Consultants, I would like to share my resume.",
      message: "Please find my resume attached.",
    }),
  },
};

Object.entries(forms).forEach(([id, config]) => {
  const form = document.getElementById(id);
  const note = form.querySelector(".form-note");

  form.querySelectorAll("[data-send]").forEach((button) =>
    button.addEventListener("click", () => {
      let valid = true;
      form.querySelectorAll("input, textarea").forEach((field) => {
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
          : "WhatsApp is opening with your enquiry. Just press send.";
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
          : "Your email app is opening with your enquiry. Just press send.";
      }
      note.classList.remove("error");
    })
  );
});
