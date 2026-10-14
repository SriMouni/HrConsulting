# Supabase setup — forms, resumes, emails and admin page

This connects the website forms to Supabase (database + resume storage), sends
emails through Resend, and enables the admin page (`admin.html`).
Until these steps are done the website keeps working: forms fall back to
WhatsApp or the visitor's email app.

**Never** put the Supabase `service_role` key or the Resend API key in the website,
in this repository, or in chat. They only go into Supabase secrets (step 4).

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → sign in → **New project**.
2. Name: `sriguru-hr` · Region: **South Asia (Mumbai)** · set a strong database password and keep it safe.
3. When it is ready, open **Project Settings → API** and note:
   - **Project URL** (e.g. `https://abcdefghijkl.supabase.co`)
   - **anon / publishable key**

## 2. Create the tables, storage and security rules

1. Supabase → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) → **Run**.
3. Check **Table Editor** shows `candidates`, `vacancies`, `enquiries`, `admins`,
   and **Storage** shows a private bucket `resumes`.

## 3. Create the admin login

1. **Authentication → Sign In / Providers → Email**: make sure Email is enabled.
2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up"
   (only people you add can log in).
3. **Authentication → Users → Add user → Create new user**: email `hr@sriguruhrconsultants.com`,
   a strong password, tick **Auto confirm user**.
4. **SQL Editor** → run (change the email if needed):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'hr@sriguruhrconsultants.com';
   ```

5. **Authentication → URL Configuration**:
   - Site URL: `https://srimouni.github.io/HrConsulting/admin.html`
     (later: `https://www.sriguruhrconsultants.com/admin.html`)
   - Add the same URL under **Redirect URLs** (used by "Forgot password").

## 4. Deploy the `submit` Edge Function

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly **`submit`**.
3. Replace the sample code with the whole of
   [`supabase/functions/submit/index.ts`](supabase/functions/submit/index.ts) → **Deploy**.
4. Open the function → **Details / Settings** → turn **off** "Verify JWT"
   (the website calls it without a login) → save.
5. **Edge Functions → Secrets** → add:

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | a **new** Resend key with *Sending access* (create it in Resend → API Keys) |
   | `NOTIFY_TO` | `hr@sriguruhrconsultants.com` |
   | `NOTIFY_FROM` | `Sri Guru HR Website <website@sriguruhrconsultants.com>` |
   | `CONTACT_PHONE` | `+91 81250 14466` |
   | `ADMIN_URL` | `https://srimouni.github.io/HrConsulting/admin.html` |
   | `ALLOWED_ORIGINS` | `https://srimouni.github.io,https://sriguruhrconsultants.com,https://www.sriguruhrconsultants.com` |

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically — do not add them.

## 5. Connect the website

Edit [`js/config.js`](js/config.js) with the values from step 1 (both are safe to publish):

```js
window.SG_CONFIG = {
  supabaseUrl: "https://abcdefghijkl.supabase.co",
  supabaseAnonKey: "<anon / publishable key>",
};
```

Commit and push — GitHub Actions redeploys the site.

## 6. Test

1. On the website, send a **General enquiry** with your own email → you should get
   the notification at hr@ and a "We have received your enquiry" email.
2. In **Careers**, submit a test candidate with a small PDF → hr@ receives it with the resume attached.
3. Open `/admin.html`, sign in → the test rows appear; **Resume** downloads the file.
4. Delete the test rows in Supabase **Table Editor** (and the file in **Storage → resumes**).

If an email does not arrive, check **Edge Functions → submit → Logs** and the Resend dashboard (**Emails**).

---

### Notes

- **Free plan pausing:** free Supabase projects pause after about a week without activity.
  Form submissions and admin logins keep it active; if paused, click **Restore** in the dashboard.
- **Resend sender domain:** `sriguruhrconsultants.com` is verified in Resend (DNS records in Zoho),
  so `NOTIFY_FROM` can use any address at that domain.
- **Adding another admin:** create the user (step 3.3) and run the `insert into public.admins` query with their email.
