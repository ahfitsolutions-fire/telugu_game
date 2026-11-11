# Google Sheet setup: see who is playing and their progress

This takes about 5 minutes and is free. You need a Google account (the teacher's).

## 1. Make the Sheet

1. Open <https://sheets.new> and name it, e.g. **Telugu class progress**.

## 2. Add the script

1. In the Sheet: **Extensions → Apps Script**.
2. Delete everything in `Code.gs`, then paste the whole of [`apps-script/Code.gs`](Code.gs) from this project.
3. At the top, change:
   ```js
   const TEACHER_KEY = 'CHANGE-ME';   // ← your own teacher password, 8+ characters
   const CLASS_CODES = [];            // ← optional, e.g. ['7B', '8A'] to accept only these
   ```
   Change these **only in the Apps Script editor**. Never put your real password in the GitHub copy.
4. Click **💾 Save**.

## 3. Deploy it as a web app

1. **Deploy → New deployment** → click ⚙️ → **Web app**.
2. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone. This is needed because students don't sign in. Anyone can *send* progress, but only someone with your password can *read* it.
3. **Deploy** → **Authorize access** → choose your account.
   - If you see "Google hasn't verified this app": click **Advanced → Go to … (unsafe)**. It's your own script.
4. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy…/exec`.

## 4. Connect the app

Send the URL to whoever maintains the app, or put it in `js/sync-config.js` yourself and push:

```js
export const SHEET_URL = 'https://script.google.com/macros/s/AKfy…/exec';
```

## 5. Share the link with each class

Add the class code to the link, so students don't need to type it:

```
https://ahfitsolutions-fire.github.io/telugu_game/?class=7B
```

Students type their **name** once at the top of the page. Progress then appears in the Sheet.

## 6. See the class

- **Teacher page:** <https://ahfitsolutions-fire.github.io/telugu_game/#/teacher>. Type your `TEACHER_KEY` to see charts, each student's level and question, and when they were last active.
- **The Sheet itself:**
  - **Students:** one row per student per device: class, name, current level and question, levels passed, stars, first-try correct, accuracy, best score per level, last active.
  - **Log:** a row each time a student opens the app, starts a level or completes one.

## Good to know

- **What is sent:** class code, typed name, a random device id, level/question numbers and scores. Never audio, never the student's email.
- **How often:** right away when a level starts or ends, otherwise at most every 15 seconds while practising (to stay well inside Google's free limits).
- **Changing the script later:** use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. This keeps the same URL. A *new* deployment gives a new URL, which would then need updating in the app.
- **Identity:** students aren't signed in, so a student is identified by their typed name plus their device. If the same student uses two phones, they appear as two rows.
