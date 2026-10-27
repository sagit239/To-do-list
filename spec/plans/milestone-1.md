# תוכנית עבודה – Milestone 1: יסודות המערכת וצפייה ברשימה משותפת

**מקורות:** `spec/MILESTONES.md`, `spec/ARCHITECTURE.md` (כולל ADR-1 עד ADR-12), `spec/DESIGN.md`, `spec/PRD.md`
**סטטוס:** אושר ונדחף.

**החלטות שהתקבלו:**
- שני פרויקטי Supabase קיימים (Dev ו-Production), באזור Frankfurt (`eu-central-1`), עם Data API כבוי ומשתמש `app_backend` בכל אחד.
- פעולות כתיבה מוסתרות ב-M1: Checkbox לקריאה בלבד, ללא כפתורי הוספה/גרירה/שמירה/מחיקה.
- Vercel Functions באזור `fra1` (Frankfurt), קרוב ל-Supabase.

---

## 0. הכנות שרק את/ה יכול/ה לבצע (חשבונות וסיסמאות)

לפי כללי הבטיחות אני לא יוצר חשבונות ולא מקליד סיסמאות. אלה הצעדים החד-פעמיים שיידרשו ממך; אדריך בכל אחד ברגע הנכון:

| # | פעולה | מתי |
|---|---|---|
| 0.1 | חשבון GitHub ו-Repository **ריק** חדש (למשל `todolist`) – דרך האתר (`gh` אינו מותקן במחשב) | לפני שלב 8 |
| 0.2 | חשבון Supabase ושני פרויקטים: `todolist-dev` ו-`todolist-prod`, באותו אזור (מומלץ Frankfurt `eu-central-1`), **עם Data API כבוי** | לפני שלב 2 |
| 0.3 | בכל פרויקט, ב-SQL Editor: `create user app_backend with password '...'` – סיסמה שונה לכל פרויקט (ADR-2) | לפני שלב 2 |
| 0.4 | התחברות `npx supabase login` (פותח דפדפן) | שלב 2 |
| 0.5 | חשבון Vercel והתחברות `npx vercel login` | שלב 7 |
| 0.6 | יצירת קובץ `.env` מקומי עם ה-Connection String של **Dev** (אני מכין תבנית; את/ה מדביק/ה את הסיסמה) | שלב 7 |
| 0.7 | חיבור Vercel ל-GitHub, הגדרת Environment Variables, וחיבור `todolist-prod` ל-GitHub Integration ב-Supabase | שלב 8 |

---

## 1. הקמת הפרויקט

- `git init` בתיקייה `todolist` (הענף הראשי: `main`); תיקיית `spec/` נשארת כפי שהיא.
- פרויקט Vite – `react-ts`; תלויות: `react-router-dom`, `@fontsource-variable/inter`, `pg`.
- devDependencies (ADR-4, ADR-11): `supabase`, `vercel`, `@vercel/node`, `@types/pg`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`.
- Chromium של Playwright בתוך הפרויקט (`PLAYWRIGHT_BROWSERS_PATH=0`) דרך `scripts/install-browser.mjs` כ-`postinstall` – כ-150MB בהתקנה הראשונה.
- `engines.node` ל-Node LTS הנתמך ב-Vercel; Lockfile נשמר ב-Git.
- `.gitignore`: `node_modules`, `dist`, `.env*` (חוץ מ-`.env.example`), `.vercel`, `supabase/.temp`.
- `.env.example` – שמות בלבד: `DATABASE_URL=`.
- Scripts: `start` (`vercel dev` – אתר + API מקומית), `dev` (Vite בלבד; `vercel dev` מפעיל אותו בעצמו), `build`, `test`, `test:integration`, `test:e2e`, `db:push` (`supabase db push`).

**מבנה תיקיות מתוכנן:**
```text
api/
  _lib/db.ts            Pool יחיד ברמת מודול (קבצים עם _ אינם Functions ב-Vercel)
  _lib/tasksRepo.ts     SQL פרמטרי
  _lib/http.ts          תשובות JSON ושגיאות אחידות
  tasks/index.ts        GET /api/tasks
shared/types.ts         טיפוס Task משותף (בטוח לדפדפן)
src/
  main.tsx, App.tsx     Router: "/" ו-"/about"
  api/tasksClient.ts    עטיפת fetch
  components/           NavBar, TaskList, TaskRow, TaskDetails
  pages/                HomePage, AboutPage
  styles/               tokens.css, global.css
supabase/
  migrations/<timestamp>_create_tasks.sql
  dev-seed.sql
e2e/                    בדיקות Playwright
test-support/devSnapshot.ts
vercel.json
```

## 2. מסד הנתונים (Dev) ו-Migrations

- `npx supabase init`, ואז `npx supabase link` **לפרויקט ה-Dev בלבד** (ADR-1).
- Migration `create_tasks` – כתובה כך שאפשר להריץ אותה שוב על Dev בלי שגיאה (`if not exists`, `drop policy if exists` וכו'):
  - טבלת `public.tasks` בדיוק לפי ARCHITECTURE 2.3 (uuid, `varchar(100)`, `varchar(2000)`, `date`, `boolean`, `integer`, `timestamptz`).
  - `CHECK`: לפחות אחד מ-`title`/`description` מכיל תו שאינו רווח (`~ '\S'`); `CHECK (position >= 0)`.
  - אינדקס על `(position, id)`; ללא UNIQUE על `position`.
  - Trigger שמעדכן את `updated_at` בכל `UPDATE`.
  - ADR-2: `grant select, insert, update, delete` ל-`app_backend`; `enable row level security`; Policy ל-`app_backend` בלבד; `revoke all` מ-`anon` ו-`authenticated`.
- `supabase/dev-seed.sql` – כ-6 משימות בדיקה: אחת שהושלמה, אחת ללא כותרת עם תיאור ארוך (לבדיקת קיצור), אחת ללא תאריך יעד, אחת עם כותרת ארוכה.
- `npm run db:push` → Migration מוחלת על Dev; הרצת ה-Seed ב-SQL Editor של Dev.
- בדיקה: התחברות כ-`app_backend` מצליחה לקרוא, ו-`anon` נחסם.

## 3. ה-API: `GET /api/tasks`

- `api/_lib/db.ts`: `pg.Pool` עם `max: 1`, `ssl: { rejectUnauthorized: false }` (ADR-3), Connection/Idle/Query Timeouts, חיבור דרך Transaction Pooler (פורט 6543, משתמש `app_backend.<project-ref>`). Type Parser לסוג `date` (OID 1082) שמחזיר מחרוזת `YYYY-MM-DD` ולא אובייקט `Date` – למניעת הזזת יום בגלל אזור זמן.
- `tasksRepo.listTasks()`: `select ... order by position asc, id asc`, המרה ל-camelCase (`dueDate`, `completed`, `position`, ללא `created_at`/`updated_at`).
- `api/tasks/index.ts`:
  - `GET` → `200` + מערך (גם `[]`), `Cache-Control: no-store`.
  - Method אחר → `405` עם `{error: {code, message}}` בעברית (POST יתווסף ב-M2).
  - תקלת DB → `503`/`500` עם הודעה בעברית, בלי לחשוף SQL או פרטי חיבור.
- הגדרת אזור ה-Functions קרוב לאזור Supabase (`vercel.json` → `regions`).

## 4. ה-Frontend

- `index.html`: `lang="he" dir="rtl"`, כותרת בעברית.
- `tokens.css`: כל צבעי ה-Style Guide כמשתני CSS, Typography (32/24/18/16/14/12), ריווח 8px, רדיוס 8–16px, צל `0 2px 8px rgba(0,0,0,0.08)`. גופן: Inter (מקומי) + `Segoe UI, Roboto, "Noto Sans Hebrew", sans-serif` לעברית.
- **NavBar** משותף: **דף הבית** / **אודות** עם `NavLink` ומצב פעיל מודגש.
- **HomePage**: כותרת **המשימות שלי**; מצב `loading | error | ready`; `selectedId` בזיכרון בלבד (ריק בכניסה).
  - **TaskList**: כותרת **רשימת משימות**; שורה = Checkbox + טקסט (כותרת, או תחילת תיאור כשאין כותרת) עם `text-overflow: ellipsis`; משימה שהושלמה – Checkbox מסומן וטקסט חצוי; שורה נבחרת ברקע תכלכל עדין.
  - מצבים: טעינה ("טוען משימות…"), רשימה ריקה ("אין משימות ברשימה"), שגיאה ("לא ניתן לטעון את המשימות. בדקו את החיבור לאינטרנט ורעננו את הדף.") – **שגיאה לעולם אינה מוצגת כרשימה ריקה**.
  - **TaskDetails**: כותרת **פרטי משימה**; ללא בחירה – "בחר משימה מהרשימה כדי לצפות בפרטיה"; עם בחירה – כותרת, תיאור ותאריך יעד בשדות לקריאה בלבד.
- **AboutPage**: כותרת **אודות** ופסקה קצרה (כנוסח ב-Wireframe).
- **Responsive**: Grid של שתי עמודות בדסקטופ (רשימה מימין, פרטים משמאל); מתחת ל-768px – עמודה אחת, רשימה מעל פרטים. ללא אייקון המבורגר (DESIGN 1.6).
- ללא Local Storage, Polling או Cache בצד הלקוח.

> **פעולות כתיבה ב-M1 (הוחלט):** Checkbox מוצג **לקריאה בלבד** (משקף סטטוס, לא לחיץ); **לא** מוצגים כפתור "הוסף משימה", ידית גרירה, "שמור שינויים" ו-"מחק משימה" – הם יתווספו ב-M2–M4 יחד עם הפעולה עצמה.

## 5. ניתוב ו-Vercel

- `vercel.json`: Rewrite של כל נתיב שאינו `/api/` אל `/index.html` (SPA fallback). קבצים סטטיים קיימים (assets, בעתיד Manifest) מוגשים לפני ה-Rewrite, ו-`/api/*` אינו נפגע.

## 6. בדיקות

| סוג | מה נבדק | פקודה |
|---|---|---|
| Unit (Vitest) | חישוב טקסט השורה (כותרת / תיאור / רווחים), Handler של ה-API עם Repo מדומה: `200`, `[]`, `no-store`, `405`, שגיאת DB → `503` בלי חשיפת פרטים | `npm test` |
| UI (RTL) | Loading; שגיאה ≠ רשימה ריקה; רשימה ריקה; אין בחירה בכניסה + הודעת הבחירה; לחיצה על שורה מציגה פרטים; סימון משימה שהושלמה | `npm test` |
| Integration (Dev בלבד) | `GET` מול Dev: סדר לפי `position, id`, `[]` כשהטבלה ריקה; Snapshot ושחזור של הטבלה (ADR-7) | `npm run test:integration` |
| E2E (Playwright, Desktop + Pixel 7) | טעינת דף הבית מול `vercel dev`, בחירת משימה, ניווט לאודות ובחזרה, Refresh ב-`/about`, פריסה בעמודה אחת במובייל | `npm run test:e2e` |
| אבטחה | חיפוש ב-`dist/` וב-Git אחר `postgres://`, סיסמאות ו-`DATABASE_URL`; אין משתני `VITE_*` רגישים | ידני / סקריפט |
| Production | אחרי ה-Push: Deployment תקין, Migration הוחלה, `GET /api/tasks` מחזיר `[]`, Refresh ב-`/about` – קריאה בלבד | ידני ב-Chrome |

## 7. הרצה מקומית

- `npx vercel link` (יוצר פרויקט Vercel), קובץ `.env` עם `DATABASE_URL` של Dev, `npm start` → `http://localhost:3000`.
- בדיקה: שינוי רשומה ב-Dev דרך SQL Editor ← Refresh מציג את הנתון החדש.

## 8. GitHub, Deployment ו-Production

1. Commit ראשון ו-Push ל-`main` ב-Repository שיצרת.
2. ב-Vercel: חיבור הפרויקט ל-Repository; Environment Variables:
   - `DATABASE_URL` ל-**Production** → פרויקט `todolist-prod`.
   - `DATABASE_URL` ל-**Preview** ול-**Development** → פרויקט `todolist-dev`.
3. ב-Supabase, בפרויקט `todolist-prod` בלבד: GitHub Integration ל-Repository זה, נתיב `supabase`, *Deploy to production* פעיל, ללא Automatic Branching. פרויקט Dev אינו מחובר ל-GitHub.
4. Push נוסף (או Redeploy) ← וידוא שה-Migration הוחלה על Production אוטומטית ושה-Deployment הצליח.
5. בדיקות Production: טעינה, רשימה ריקה, ניווט ו-Refresh ב-`/about` ב-Chrome.

## 9. סיום ודיווח

עצירת הפיתוח והצגת טבלה מול כל סעיף ב-Definition of Done של M1: מה נבדק, איך, התוצאה, ומה לא בוצע (למשל, בדיקה במכשיר Android אמיתי שתלויה בך). **לא מתחילים את M2 ללא אישור מפורש.**

---

## סיכונים ונקודות פתוחות

- **Supabase GitHub Integration** – אם יתברר שאינה זמינה בתוכנית החינמית, החלופה לפי ADR-1 היא GitHub Actions שמריץ `supabase db push`; הדבר ידרוש Secret ב-GitHub.
- **Supabase Free** – פרויקטים לא פעילים נעצרים; ייתכן שיהיה צורך להפעיל מחדש את Dev.
- **Vercel Hobby** – לשימוש אישי לא-מסחרי בלבד.
- **Node** – במחשב מותקן Node 24; נקבע ב-`engines` גרסת LTS שנתמכת ב-Vercel ונוודא שהיא תואמת.
