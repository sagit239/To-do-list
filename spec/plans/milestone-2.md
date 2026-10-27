# תוכנית – Milestone 2: יצירת משימה באמצעות Modal

**מקורות:** `MILESTONES.md` (Milestone 2), `PRD.md` (זרימה 2, FR-02, FR-03, FR-10, Edge Cases), `DESIGN.md` (1.1, 1.3, 2.3), `ARCHITECTURE.md` (2.3, 2.4, 2.5, 2.6, ADR-5, ADR-6, ADR-7, ADR-11), `wireframes.png` (מסך "הוספת משימה").

**מצב קיים (מ-Milestone 1):** `GET /api/tasks` בלבד (`api/tasks/index.ts` + `api/_lib/tasksRepo.ts`), דף בית לקריאה בלבד (`HomePage` מחזיק את רשימת המשימות ואת `selectedId`), `TaskDetails` לקריאה בלבד. אין עדיין `shared/validation.ts`, כפתורים או Modal. אין צורך ב-Migration: הטבלה והאילוצים כבר קיימים.

**מחוץ לתחום:** עריכה ומחיקה (Milestone 3), Checkbox וגרירה (Milestone 4), ליטוש חזותי מלא (Milestone 5). אין לשנות את `TaskDetails` מעבר למה שנדרש.

---

## 1. כללי Validation משותפים – `shared/validation.ts` (חדש, ADR-5, ADR-6)

קובץ אחד, בטוח לדפדפן, שנטען גם ב-React וגם ב-Functions.

- קבועים: `TITLE_MAX = 100`, `DESCRIPTION_MAX = 2000`, `TASK_LIMIT = 1000`, `PRODUCT_TIME_ZONE = 'Asia/Jerusalem'`.
- `charLength(s)` – אורך ב-Code Points (`[...s].length`), לא `s.length`.
- `localToday(): string` – התאריך המקומי של המכשיר כ-`YYYY-MM-DD` (מתוך `getFullYear/getMonth/getDate`, **לא** `toISOString`). משמש לברירת מחדל ול-`min` בטופס.
- `todayInZone(timeZone = PRODUCT_TIME_ZONE, now = new Date()): string` – "היום" בשרת באמצעות `Intl.DateTimeFormat('en-CA', { timeZone })`.
- `isValidDateString(s)` – תבנית `YYYY-MM-DD` ותאריך קלנדרי אמיתי (למשל דוחה `2026-02-30`).
- `validateTaskInput(input, { today, storedDueDate? })`:
  - קלט: `{ title: unknown, description: unknown, dueDate: unknown }`.
  - נרמול: מחרוזת → `trim`; ריקה → `null`. ערך שאינו מחרוזת/`null` → שגיאה.
  - מחזיר `{ ok: true, value: { title, description, dueDate } }` או `{ ok: false, errors: FieldError[] }`, כאשר `FieldError = { field: 'title' | 'description' | 'dueDate' | 'form', code, message }`.
  - כללים והודעות (עברית):
    - שניהם ריקים: `form` – **"יש להזין כותרת או תיאור למשימה"** (נוסח מה-PRD).
    - כותרת ארוכה: `title` – "הכותרת ארוכה מדי (עד 100 תווים)".
    - תיאור ארוך: `description` – "התיאור ארוך מדי (עד 2,000 תווים)".
    - תאריך לא תקין: `dueDate` – "תאריך היעד אינו תקין".
    - תאריך בעבר (`dueDate < today`): `dueDate` – "תאריך היעד לא יכול להיות בעבר". הבדיקה מדולגת כאשר `storedDueDate` הועבר ו-`dueDate === storedDueDate` (הכנה ל-Milestone 3; ביצירה לא מועבר).
  - אורך נבדק על הערך **אחרי** `trim`.
- `shared/types.ts`: להוסיף `TaskInput = { title: string | null; description: string | null; dueDate: string | null }`.

## 2. שרת – `POST /api/tasks`

### 2.1 Repository – `api/_lib/tasksRepo.ts`

- קבוע `LIST_LOCK_KEY` (מספר bigint קבוע, למשל `727001`) – ה-Advisory Lock המשותף לכל שינויי מבנה הרשימה (יצירה עכשיו; מחיקה וגרירה בהמשך, ARCHITECTURE 2.6).
- `export class TaskLimitError extends Error`.
- `createTask(input: TaskInput, pool = getPool()): Promise<Task>`:
  1. `client = await pool.connect()`; כל השלבים על אותו `client`.
  2. `begin`
  3. `select pg_advisory_xact_lock($1)` עם `LIST_LOCK_KEY`.
  4. `select count(*)::int as count, coalesce(max(position) + 1, 0) as next from public.tasks`.
  5. אם `count >= TASK_LIMIT` → `rollback` וזריקת `TaskLimitError`.
  6. `insert into public.tasks (title, description, due_date, position) values ($1, $2, $3, $4) returning id, title, description, due_date, completed, position` (`completed` נשאר `false` כברירת המחדל של העמודה).
  7. `commit`; החזרת `toTask(row)`. בכל שגיאה: `rollback`, ובסוף `client.release()`.
- SQL פרמטרי בלבד.

### 2.2 עזרי HTTP – `api/_lib/http.ts`

- `readJsonBody(req, maxBytes = 16 * 1024)` – בודק `Content-Type: application/json` ואת `Content-Length`/גודל הגוף. מחזיר את האובייקט או תוצאת שגיאה:
  - Content-Type שגוי → `415 UNSUPPORTED_MEDIA_TYPE` "יש לשלוח את הבקשה בפורמט JSON."
  - גוף גדול מדי → `413 PAYLOAD_TOO_LARGE` "הבקשה גדולה מדי."
  - JSON לא תקין או שאינו אובייקט → `400 INVALID_BODY` "הבקשה אינה תקינה."

### 2.3 Handler – `api/tasks/index.ts`

- `GET` – ללא שינוי. `POST` – חדש. כל Method אחר → `405` עם `Allow: GET, POST`.
- זרימת `POST`:
  1. `readJsonBody` (שגיאות כמפורט למעלה).
  2. `validateTaskInput(body, { today: todayInZone() })`. כישלון → `422 VALIDATION_ERROR` עם השגיאה **הראשונה** (`{error: {code, message, field}}`, `field` = `title`/`description`/`dueDate`, או ללא `field` עבור `form`).
  3. `createTask(value)` → `201` עם המשימה.
  4. `TaskLimitError` → `409 TASK_LIMIT_REACHED` – "הרשימה מלאה (1,000 משימות). יש למחוק משימה כדי להוסיף חדשה."
  5. שגיאת אילוץ מה-DB (`23514`/`22001`) → `422` (הגנת גיבוי); כל השאר → `sendServerError` (`503`).
- שדות נוספים בגוף (כמו `completed`, `position`, `id`) **מתעלמים** מהם.

## 3. לקוח

### 3.1 API Client – `src/api/tasksClient.ts`

- `createTask(input: TaskInput): Promise<Task>` – `POST /api/tasks` עם JSON. שגיאת רשת → `ApiRequestError(NETWORK_ERROR_MESSAGE_SAVE, null, 'NETWORK_ERROR')` עם הודעה מתאימה לשמירה: "אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב." תשובה לא תקינה → `readError` (קיים), ולהרחיב את `ApiRequestError` בשדה `field?` שמגיע מהשרת.
- ההודעה הכללית של `readError` לשמירה: "השמירה נכשלה. נסו שוב." (פרמטר להודעת ברירת המחדל, כדי לא לשבור את הודעת הטעינה הקיימת).

### 3.2 רכיב Modal – `src/components/CreateTaskModal.tsx` (חדש)

מבנה לפי ה-Wireframe "הוספת משימה" ו-DESIGN 1.3:

- Overlay אפור שקוף-למחצה (`.modal-overlay`) וחלון לבן ממורכז (`.modal`) עם `role="dialog"`, `aria-modal="true"`, `aria-labelledby` לכותרת.
- כותרת **"הוספת משימה"** וכפתור סגירה (אייקון X, `aria-label="סגור"`).
- שדות (תוויות + Placeholders לפי ה-Wireframe):
  - **כותרת** – `input type="text"`, Placeholder: "הזן כותרת (לא חובה)".
  - **תיאור** – `textarea`, Placeholder: "הזן תיאור (לא חובה)".
  - **תאריך יעד** – `input type="date"`, ערך התחלתי `localToday()`, `min={localToday()}`, ניתן לניקוי (בקר התאריך של Chrome), ללא שעה.
- אזור הודעה כללית (`role="alert"`) מעל הכפתורים – לשגיאת `form` ולשגיאות שרת/רשת (כמו במיקום שבו ה-Wireframe מציג "יש להזין כותרת או תיאור למשימה"). שגיאה של שדה מסוים מוצגת מתחת לשדה, עם `aria-invalid` ו-`aria-describedby`.
- כפתורים: **"הוסף משימה"** (Primary, `type="submit"`) ו-**"סגור"** (Secondary).
- התנהגות:
  - State מקומי בלבד (`title`, `description`, `dueDate`, `errors`, `saving`). הרכיב מוצג רק כשה-Modal פתוח, כך שכל פתיחה מתחילה מערכי ברירת המחדל (סגירה = Unmount = מחיקת הטיוטה, ללא התראה).
  - Submit: `validateTaskInput` עם `today: localToday()`; אם נכשל – הצגת השגיאות, בלי בקשה. אם עבר – `createTask`, בזמן השמירה הכפתורים במצב Disabled (מונע יצירה כפולה מלחיצה כפולה).
  - הצלחה → `onCreated(task)` (ההורה סוגר ובוחר).
  - כישלון → הערכים נשארים, ההודעה מוצגת (שדה ספציפי אם השרת החזיר `field`, אחרת באזור הכללי), אפשר ללחוץ שוב.
  - סגירה: X, **"סגור"**, או מקש `Escape`. לחיצה על ה-Overlay **אינה** סוגרת (מונעת איבוד הקלדה בטעות). בזמן שמירה הסגירה מושבתת.
  - Focus עובר לשדה הכותרת בפתיחה; בסגירה חוזר לכפתור "הוסף משימה". Focus נשאר בתוך החלון (מעבר Tab מחזורי בסיסי).
  - `body` לא נגלל מאחורי ה-Modal כל עוד הוא פתוח.

### 3.3 דף הבית – `src/pages/HomePage.tsx`

- ב-`page-header`, לצד הכותרת **"המשימות שלי"** (בצד שמאל ב-RTL, כמו ב-Wireframe): כפתור **"הוסף משימה"** (Primary).
  - Disabled כשהרשימה עדיין נטענת או בשגיאת טעינה (אין רשימה ידועה), וכש-`tasks.length >= TASK_LIMIT`.
  - כשהרשימה מלאה, לצד הכפתור הודעה קצרה: "הרשימה מלאה (1,000 משימות)", מקושרת לכפתור ב-`aria-describedby`.
- `isCreateOpen` State; פתיחה מציגה את `CreateTaskModal`.
- `onCreated(task)`: הוספת המשימה לסוף הרשימה ב-State, `setSelectedId(task.id)`, סגירת ה-Modal. אזור הפרטים מציג את המשימה החדשה (דרך `TaskDetails` הקיים).
- אין Refetch אחרי יצירה – התשובה מהשרת היא הרשומה השמורה.

### 3.4 עיצוב – `src/styles/global.css` (+ `tokens.css` לפי הצורך)

לפי DESIGN 2.3 וה-Style Guide, רק מה שה-Milestone צריך:

- כפתורים: `.btn`, `.btn--primary` (`primary`, טקסט לבן, Hover כהה יותר), `.btn--secondary` (לבן עם מסגרת כחולה, Hover תכלת בהיר), מצב `:disabled` אפור-בהיר כמו ב-Style Guide; פינות מעוגלות 8px.
- `.page-header` – כותרת וכפתור באותה שורה (`space-between`); הודעת "הרשימה מלאה" בטקסט משני קטן.
- `.modal-overlay` (קבוע, מכסה את המסך, רקע כהה שקוף), `.modal` (לבן, רדיוס 16px, צל רך, רוחב עד ~480px, גלילה פנימית אם הגובה חורג), `.modal__header`, `.modal__close`, `.modal__actions`.
- `.field__error` – טקסט אדום (`error`) קטן מתחת לשדה; `.form-alert` – קופסת שגיאה ברקע אדום עדין ומסגרת (כמו "States & Feedback").
- שדה עם שגיאה: מסגרת אדומה (`[aria-invalid="true"]`).
- מובייל (`max-width: 767px`): כפתור "הוסף משימה" ברוחב מלא מתחת לכותרת (כמו ב-Wireframe המובייל), Modal ברוחב המסך פחות 16px מכל צד, כפתורי הפעולה ברוחב שווה.

## 4. בדיקות

### 4.1 Unit – `npm test`

- `shared/validation.test.ts` (חדש): כותרת בלבד / תיאור בלבד / שניהם; רווחים בלבד → הודעת ה-PRD; 100 תווים עובר ו-101 נכשל; 2000/2001 בתיאור; אורך לפי Code Points (אמוג'י/תווים מורכבים נספרים כתו אחד); `trim` ונרמול ל-`null`; תאריך היום עובר, אתמול נכשל, `null` עובר, `2026-02-30` ותבנית שגויה נכשלים; ערך שאינו מחרוזת נכשל; `todayInZone` מחזיר את התאריך בישראל לשעה נתונה (למשל 22:30 UTC = היום הבא בישראל); `localToday` לא משתמש ב-UTC.
- `api/tasks/index.test.ts` (הרחבה, Repository ממוקק): `POST` תקין → `201` ומעביר ל-`createTask` רק את שלושת השדות המנורמלים; קלט לא תקין → `422` עם `field` מתאים ובלי קריאה ל-Repository; `TaskLimitError` → `409 TASK_LIMIT_REACHED`; Content-Type שגוי → `415`; גוף גדול → `413`; JSON שבור → `400`; שגיאת DB → `503`; `PUT`/`DELETE` → `405` עם `Allow: GET, POST`.
- `src/components/CreateTaskModal.test.tsx` (חדש): ערכי פתיחה (ריקים + תאריך היום, Placeholders); אפשר לנקות את התאריך ולשמור; שמירה ריקה מציגה "יש להזין כותרת או תיאור למשימה" ולא שולחת בקשה; תאריך בעבר נחסם; כישלון שרת משאיר את הערכים ואת ה-Modal ומאפשר ניסיון חוזר; Escape/X/"סגור" קוראים לסגירה.
- `src/pages/HomePage.test.tsx` (הרחבה): פתיחת Modal; יצירה מוצלחת סוגרת, מוסיפה בסוף ובוחרת (הפרטים מוצגים); סגירה ופתיחה מחדש מאפסות; 1,000 משימות → כפתור Disabled והודעה; הכפתור Disabled בזמן טעינה ובשגיאת טעינה.

### 4.2 Integration מול Dev – `npm run test:integration` (ADR-7)

הרחבת `api/_lib/tasksRepo.integration.test.ts`:
- יצירה בטבלה ריקה מקבלת `position = 0`; יצירה נוספת – `max + 1`; `completed = false`; נוצרת **רשומה אחת** בדיוק.
- 1,000 משימות קיימות (הוספה מהירה ב-`generate_series`) → `TaskLimitError` ולא נוספה רשומה.
- **שתי יצירות מקבילות** כשיש 999 משימות, משני Pools נפרדים (שני מבקרים) → בדיוק אחת מצליחה, השנייה `TaskLimitError`, ובטבלה 1,000 בדיוק.
- כמה יצירות מקבילות בטבלה קטנה → מיקומים ייחודיים ורציפים.
- Snapshot/Restore כמו היום, כך שנתוני הבדיקה ב-Dev חוזרים בסיום.

### 4.3 E2E ב-Chrome – `npm run test:e2e` (ADR-11)

קובץ חדש `e2e/milestone2.spec.ts` (Desktop + Mobile), מול `vercel dev` ו-Dev:
- יצירה עם כותרת בלבד, תיאור בלבד, ושניהם, ללא תאריך ועם תאריך: ה-Modal נסגר, המשימה בסוף הרשימה ונבחרת, הפרטים מוצגים; **Refresh** – המשימה עדיין שם.
- **חלון/Context שני** (מבקר אחר) רואה את המשימה החדשה.
- שדה התאריך מתחיל בתאריך היום, ניתן לנקותו, הוא `type="date"` (ללא שעה).
- Validation: ריק/רווחים, 101 תווים בכותרת (באמצעות `fill`, עוקף `maxLength` אם יוגדר), תאריך בעבר → הודעה בטופס, אין בקשת POST.
- סגירה (X, "סגור", Escape) ופתיחה מחדש → טופס מאופס, לא נוצרה משימה.
- שגיאת שרת מדומה (`page.route` שמחזיר `503` ל-POST) → ה-Modal והערכים נשארים, הודעה מוצגת; הסרת ה-Route ולחיצה חוזרת מצליחה.
- רשימה מלאה מדומה (`page.route` ל-GET עם 1,000 משימות) → הכפתור Disabled וההודעה מוצגת.
- `409` ישיר מה-API מכוסה ב-Integration (ולא ב-E2E, כדי לא למלא את Dev ב-1,000 שורות דרך הדפדפן); בנוסף בדיקת `request.post` אחת שמוודאת `422` על קלט ריק.
- כל בדיקות `e2e/milestone1.spec.ts` ממשיכות לעבור (רגרסיה). ייתכן שצריך לעדכן בדיקה קיימת אם היא נשענת על מספר המשימות הקבוע – Global Setup נשאר כפי שהוא, ובדיקות Milestone 2 רצות אחרי Milestone 1 (`workers: 1`).

### 4.4 בדיקה ידנית קצרה בזמן הבנייה

הרצת `npm start`, פתיחה ב-Chrome, יצירת משימה, Refresh, ובדיקת מראה ה-Modal בדסקטופ ובמובייל (Viewport צר). סגירת השרת בסיום.

## 5. קבצים

| קובץ | פעולה |
|---|---|
| `shared/validation.ts` | חדש |
| `shared/validation.test.ts` | חדש |
| `shared/types.ts` | הוספת `TaskInput` |
| `api/_lib/tasksRepo.ts` | `createTask`, `TaskLimitError`, `LIST_LOCK_KEY` |
| `api/_lib/http.ts` | `readJsonBody` |
| `api/tasks/index.ts` | `POST` |
| `api/tasks/index.test.ts` | הרחבה |
| `api/_lib/tasksRepo.integration.test.ts` | הרחבה |
| `src/api/tasksClient.ts` | `createTask`, `field` ב-`ApiRequestError` |
| `src/components/CreateTaskModal.tsx` | חדש |
| `src/components/CreateTaskModal.test.tsx` | חדש |
| `src/pages/HomePage.tsx` | כפתור, מצב רשימה מלאה, Modal, בחירה אחרי יצירה |
| `src/pages/HomePage.test.tsx` | הרחבה |
| `src/styles/global.css` | כפתורים, Modal, שגיאות, Header |
| `e2e/milestone2.spec.ts` | חדש |
| `spec/MILESTONES.md` | 🟡 ליד Milestone 2 בסיום הבנייה |

אין Migration, אין משתני סביבה חדשים ואין תלויות חדשות.

## 6. Definition of Done – איך כל תנאי ייבדק

| תנאי | בדיקה |
|---|---|
| יצירה עם כותרת בלבד / תיאור בלבד / שניהם; תאריך אופציונלי | Unit (validation), E2E |
| ריק/רווחים, חריגת אורך, תאריך בעבר נחסמים עם הודעה בטופס | Unit (validation + Modal), Handler `422`, E2E |
| התאריך הראשוני הוא היום, ניתן לנקותו, אין שעה | Unit (Modal), E2E |
| שמירה יוצרת רשומה אחת בסטטוס "לביצוע", מוצגת, Modal נסגר, המשימה נבחרת | Integration (רשומה אחת, `completed=false`), Unit (HomePage), E2E |
| 1,000 משימות: כפתור לא זמין + הודעה; API מחזיר `409` ולא יוצר, גם במקביל | Unit (HomePage), E2E (GET מדומה), Handler `409`, Integration (שתי בקשות מקבילות) |
| סגירה ופתיחה מאפסות; שגיאת שרת משאירה Modal וערכים ומאפשרת ניסיון חוזר | Unit (Modal + HomePage), E2E |
| נראה אחרי Refresh ובחלון אחר; הבדיקות הקודמות עוברות | E2E (Refresh + Context שני), הרצת כל `npm test`, `test:integration`, `test:e2e` ו-`npm run build` |
