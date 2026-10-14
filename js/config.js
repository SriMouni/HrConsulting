// Supabase connection for the website forms and the admin page.
// Both values are public by design (Project Settings → API) and safe to publish.
// NEVER put the service_role key or the Resend key here.
// While supabaseUrl is empty, the forms fall back to WhatsApp / the visitor's email app.
window.SG_CONFIG = {
  supabaseUrl: "https://mupskjecdglhinooprzx.supabase.co",
  supabaseAnonKey: "sb_publishable_tN3YGxgNMZA8LfnPutNOfg_6ytMuxNh",
};
