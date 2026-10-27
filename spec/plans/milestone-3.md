# תוכנית – Milestone 3: עריכת פרטים ומחיקת משימה

**מקורות:** `MILESTONES.md` (Milestone 3), `PRD.md` (זרימות 3 ו-6, FR-02, FR-05, FR-08, FR-10, טבלת מקרי הקצה), `ARCHITECTURE.md` (2.2–2.6, ADR-6, ADR-8, ADR-9), `DESIGN.md` (1.2, 1.4, 2.3), `wireframes.png` ("דף הבית – משימה נבחרת", "אישור מחיקה", מובייל), `style-guide.png` (כפתור Danger, שדות, Feedback).

**מצב נוכחי (מהקוד):** `TaskDetails` מציג שדות לקריאה בלבד; `api/tasks/index.ts` מטפל ב-`GET`/`POST`; `shared/validation.ts` כבר תומך ב-`storedDueDate` (כלל "תאריך בעבר" רק כשהתאריך שונה); ל-`app_backend` כבר יש הרשאות `update`/`delete`, וקיים Trigger שמעדכן `updated_at`. **אין צורך ב-Migration.**

## 1. מטרה

המשתמש בוחר משימה, משנה כותרת/תיאור/תאריך יעד ישירות באזור הפרטים ושומר ב-"שמור שינויים"; או מוחק אותה דרך "מחק משימה" וחלון אישור. טיוטה שלא נשמרה נעלמת בשקט במעבר משימה, מעבר דף או Refresh.

## 2. Backend

### 2.1 נתיב חדש: `api/tasks/[id]/index.ts`
נבנה ישר במיקום שנקבע ב-ADR-9 (כדי שב-Milestone 4 יהיה אפשר להוסיף לצידו `[id]/status.ts` בלי להזיז קבצים). המזהה מגיע מ-`req.query.id`.

- **בדיקת מזהה:** מזהה שאינו UUID ⇒ `400 INVALID_ID` (לפני כל גישה למסד). פונקציה קטנה `isUuid` ב-`api/_lib/http.ts`.
- **Methods:** `PATCH` ו-`DELETE` בלבד; אחרים ⇒ `405` עם `Allow: PATCH, DELETE` (`methodNotAllowed` הקיים).
- **`PATCH /api/tasks/:id`:**
  1. `readJsonBody` (16KB, JSON בלבד – כמו ביצירה).
  2. שלושת המפתחות `title`, `description`, `dueDate` חייבים להופיע בגוף (מותר `null`); חסר אחד ⇒ `400 MISSING_FIELDS` (ADR-8). כל שדה אחר (`completed`, `position`, …) מתעלמים ממנו.
  3. קריאה ל-`updateTaskDetails` ב-Repository (ראו 2.2) עם `today = todayInZone()`.
  4. תוצאות: הצלחה ⇒ `200` + המשימה המעודכנת; Validation ⇒ `422` עם `code`, `message` ו-`field` (בדיוק כמו ב-`POST`); משימה לא קיימת ⇒ `404 TASK_NOT_FOUND`; שגיאת קלט מה-DB (`23514`/`22001`) ⇒ `422 VALIDATION_ERROR`; אחרת `sendServerError` (`503`).
- **`DELETE /api/tasks/:id`:** קריאה ל-`deleteTask`; הצלחה ⇒ `204` בלי גוף; לא קיימת (כולל מחיקה כפולה) ⇒ `404 TASK_NOT_FOUND`; אחרת `503`.
- הודעת 404 בעברית: **"המשימה לא נמצאה. ייתכן שנמחקה בידי מבקר אחר – רעננו את הדף."**
- תשובת `204` נשלחת עם `Cache-Control: no-store` ו-`res.status(204).end()` (פונקציה קטנה `sendNoContent` ב-`http.ts`).
- את קבוע `DB_INPUT_ERRORS` שכרגע ב-`api/tasks/index.ts` מעבירים ל-`api/_lib/http.ts` כדי ששני הנתיבים ישתמשו בו.

### 2.2 Repository – `api/_lib/tasksRepo.ts`
- **`TaskNotFoundError`** – מחלקת שגיאה חדשה, בסגנון `TaskLimitError`.
- **`updateTaskDetails(id, rawInput, today, pool = getPool())`** – לפי ADR-8, ב-Transaction אחת על אותו `client`:
  1. `begin`; `select due_date from public.tasks where id = $1 for update` (נעילת שורה בלבד, **בלי** ה-Advisory Lock של הרשימה).
  2. אין שורה ⇒ `rollback` וזריקת `TaskNotFoundError`.
  3. `validateTaskInput(rawInput, { today, storedDueDate })` – אותו כלל של הלקוח (ADR-6). נכשל ⇒ `rollback` והחזרת `{ ok: false, errors }`.
  4. `update public.tasks set title = $2, description = $3, due_date = $4 where id = $1 returning …` – **רק** שלושת השדות (`updated_at` מתעדכן ב-Trigger הקיים); `commit`; החזרת `{ ok: true, task }`.
  - כך שתי שמירות מקבילות לאותה משימה מסודרות לפי נעילת השורה, והאחרונה קובעת (`last write wins`); `completed` ו-`position` אינם נכתבים אף פעם.
- **`deleteTask(id, pool = getPool())`** – תחת ה-Advisory Lock המשותף `LIST_LOCK_KEY` (כמו `createTask`):
  1. `begin`; `pg_advisory_xact_lock`; `delete from public.tasks where id = $1`.
  2. לא נמחקה שורה ⇒ `rollback` וזריקת `TaskNotFoundError`.
  3. נרמול מיקומים ל-0..N-1 בשאילתה אחת: `row_number() over (order by position, id) - 1`, ועדכון רק של שורות שהמיקום שלהן השתנה; `commit`.

## 3. Frontend

### 3.1 `src/api/tasksClient.ts`
- **`updateTask(id, input): Promise<Task>`** – `PATCH` עם JSON; אותו טיפול שגיאות כמו `createTask` (רשת ⇒ `SAVE_NETWORK_ERROR_MESSAGE`; שגיאת שרת ⇒ ההודעה מהשרת או `SAVE_ERROR_MESSAGE`).
- **`deleteTask(id): Promise<void>`** – `DELETE`; הצלחה רק ב-`204`/`2xx`; הודעת כשל ברירת מחדל: **"המחיקה נכשלה. נסו שוב."**
- את קוד ה-`fetch` + טיפול בשגיאות המשותף לשלוש פעולות הכתיבה מאחדים לפונקציה פנימית אחת קטנה (בלי לשנות את ההתנהגות של `createTask`).

### 3.2 רכיב Modal משותף – `src/components/Modal.tsx`
חלון אישור המחיקה צריך בדיוק את אותה התנהגות כמו Modal היצירה: Overlay, `role="dialog"`, `aria-modal`, Escape לסגירה, Focus שנשאר בתוך החלון, נעילת גלילת הדף והחזרת Focus בסגירה. מוציאים את הקוד הקיים מ-`CreateTaskModal` לרכיב `Modal` (props: `titleId`, `onClose`, `children`, ו-`className` אופציונלי לגודל), ו-`CreateTaskModal` עובר להשתמש בו בלי שינוי התנהגות. בדיקות ה-Modal של Milestone 2 חייבות להמשיך לעבור.

### 3.3 `src/components/TaskDetails.tsx` – עריכה בתוך האזור
- Props: `task`, `onSaved(task)`, `onDeleted(id)`.
- **טיוטה מקומית** (`useState`) של `title`, `description`, `dueDate` שמאותחלת מהמשימה. הרכיב כבר מקבל `key={task.id}` ב-`HomePage`, ולכן מעבר למשימה אחרת מאפס את הטיוטה; מעבר לדף "אודות" או Refresh מוחקים אותה כי היא רק בזיכרון. שינוי עתידי של `completed`/`position` של אותה משימה (Milestone 4) לא יאפס את הטיוטה, כי היא מאותחלת רק פעם אחת.
- השדות כבר אינם `readOnly`: כותרת (שורה אחת), תיאור (מרובה שורות), תאריך יעד (`type="date"`, ניתן לניקוי, ללא שעה). Placeholders זהים ל-Modal היצירה. `min` של שדה התאריך = היום המקומי, **רק אם** הערך הנוכחי אינו התאריך השמור (כדי לא לסמן תאריך שמור שעבר כשגוי).
- **"שמור שינויים"** (`btn--primary`, `type="submit"`): `validateTaskInput(draft, { today: localToday(), storedDueDate: task.dueDate })`; שגיאות מוצגות ליד השדות / כהודעת טופס (אותו מבנה `field__error` / `form-alert` כמו במודל היצירה), והתוכן נשאר. תקין ⇒ `updateTask`; בזמן השמירה הכפתור "שומר…" ומושבת. הצלחה ⇒ `onSaved(task)`, הטיוטה מתעדכנת לערכים שהשרת החזיר (אחרי `trim`), ומוצג חיווי הצלחה קצר **"השינויים נשמרו"** בירוק (`role="status"`, נעלם בשינוי הבא – מותר לפי DESIGN 2.3 Feedback). כישלון (כולל `404`, רשת, `503`) ⇒ הודעת השגיאה בתוך הטופס, ערכי הטיוטה נשארים, וניתן לנסות שוב.
- **"מחק משימה"** (`btn--danger` – מסגרת וטקסט אדומים, לפי ה-Style Guide): פותח את `DeleteTaskModal`. המחיקה לא נוגעת בטיוטה.
- כשאין משימה נבחרת – ההודעה הקיימת "בחר משימה מהרשימה כדי לצפות בפרטיה".

### 3.4 `src/components/DeleteTaskModal.tsx` – אישור מחיקה (DESIGN 1.4)
- מבוסס על `Modal`; חלון קטן וממורכז: כותרת **"מחיקת משימה"**, שאלה **"האם אתה בטוח שברצונך למחוק את המשימה הזו?"**, כפתורים **"אישור"** (`btn--danger`) ו-**"ביטול"** (`btn--secondary`), לפי סדר ה-Wireframe ב-RTL. Focus ראשוני על "ביטול" (בטוח יותר).
- **ביטול** / X / Escape ⇒ סגירה בלי בקשה לשרת.
- **אישור** ⇒ `deleteTask`; בזמן הבקשה הכפתורים מושבתים ו"אישור" מציג "מוחק…". הצלחה ⇒ `onDeleted(id)`. כישלון ⇒ החלון נשאר פתוח עם הודעת השגיאה (`form-alert`), המשימה נשארת ברשימה, ואפשר לנסות שוב או לבטל.

### 3.5 `src/pages/HomePage.tsx`
- **`handleSaved(task)`** – מעדכן ברשימה **רק** את `title`, `description`, `dueDate` של אותה משימה (לא `completed`/`position`, לפי ADR-9), כך שהטקסט בשורה מתעדכן מיד.
- **`handleDeleted(id)`** – מסיר את המשימה מהרשימה, מנרמל את `position` המקומי ל-0..N-1 (תואם לשרת), ומאפס `selectedId` ל-`null` ⇒ חוזרת הודעת הבחירה. אם הרשימה הייתה מלאה, כפתור "הוסף משימה" חוזר להיות זמין.

### 3.6 CSS – `src/styles/global.css` (+ `tokens.css` אם חסר טוקן)
- הסרת עיצוב ה-`readonly` משדות הפרטים (הסגנון נשאר רק אם עדיין בשימוש).
- `.btn--danger`: רקע לבן, מסגרת וטקסט `error` (#EB5757), Hover עם רקע אדום עדין; מצב Disabled כמו שאר הכפתורים.
- `.task-details__actions`: כפתורי "שמור שינויים" ו"מחק משימה" באותה שורה (בסדר ה-Wireframe), ובמובייל ברוחב מלא זה לצד זה.
- `.form-success`: הודעת הצלחה בגוון `success` עדין (בדומה ל-`form-alert`).
- `.modal--small` לחלון האישור.
- ליטוש חזותי מלא נשאר ל-Milestone 5; כאן רק מבנה, צבעי בסיס וכפתורים לפי ה-Style Guide.

## 4. בדיקות

### 4.1 יחידה וממשק (`npm test`)
- **`api/tasks/[id]/index.test.ts`** (Repository מדומה, בסגנון `api/tasks/index.test.ts`): `405` ל-Method אחר; `400` למזהה לא UUID; `415`/`400` לגוף לא תקין; `400 MISSING_FIELDS` כשחסר שדה; שדות נוספים (`completed`, `position`) לא מועברים ל-Repository; `422` עם `field` כשה-Validation נכשל; `200` בהצלחה; `404`; `503`; `DELETE` ⇒ `204`/`404`/`503`.
- **`shared/validation.test.ts`**: לוודא כיסוי ל-`storedDueDate` – תאריך שמור שעבר ולא שונה עובר; שינוי לתאריך אחר בעבר נחסם; ניקוי התאריך (`null`) תמיד מותר.
- **`src/components/TaskDetails.test.tsx`** (חדש): השדות ניתנים לעריכה; שמירה שולחת את שלושת השדות וקוראת ל-`onSaved`; Validation (ריק/רווחים, אורך, תאריך עבר שהשתנה) מציג הודעה ולא שולח בקשה; משימה עם תאריך שמור שעבר נשמרת בלי שינוי תאריך; כישלון שרת משאיר את הערכים ומציג שגיאה; לחיצה על "מחק משימה" פותחת אישור; "ביטול" לא שולח בקשה; "אישור" קורא ל-`onDeleted` רק אחרי הצלחה; כישלון מחיקה משאיר את החלון וההודעה.
- **`src/pages/HomePage.test.tsx`**: אחרי שמירה הטקסט בשורה מתעדכן; מעבר למשימה אחרת וחזרה מבטל טיוטה; אחרי מחיקה המשימה נעלמת וחוזרת הודעת הבחירה; רשימה מלאה + מחיקה ⇒ "הוסף משימה" זמין שוב.
- **`src/components/CreateTaskModal.test.tsx`** – חייב להמשיך לעבור אחרי המעבר ל-`Modal` המשותף.

### 4.2 Integration מול Dev (`npm run test:integration`, ADR-7 – הנתונים מוחזרים בסיום)
- `updateTaskDetails`: עדכון נשמר; `completed` ו-`position` לא משתנים; משימה עם `due_date` שעבר (מוזן ישירות ב-SQL) מתעדכנת כשהתאריך לא שונה; שינוי לתאריך אחר בעבר נדחה בלי לשנות דבר; מזהה שלא קיים ⇒ `TaskNotFoundError`.
- **שמירות מקבילות** (שני Pools = שני מבקרים): שתי עריכות שונות לאותה משימה במקביל – שתיהן מצליחות, הערך הסופי במסד הוא של אחת מהן במלואה (לא ערבוב שדות), ו-`completed`/`position` נשארים כפי שהיו.
- `deleteTask`: מחיקה מאמצע הרשימה ⇒ המיקומים רציפים 0..N-1 בלי כפילויות; מחיקה כפולה ⇒ `TaskNotFoundError`; מחיקה ויצירה במקביל ⇒ אין מיקום כפול או חסר.

### 4.3 E2E ב-Chrome (`npm run test:e2e`, Desktop + Mobile, מול Dev) – `e2e/milestone3.spec.ts`
- עריכת כותרת/תיאור/תאריך ⇒ "שמור שינויים" ⇒ השורה מתעדכנת ⇒ Refresh ⇒ הערכים נשמרו.
- משימה עם תאריך יעד שעבר (מוזנת ישירות ב-DB לבדיקה): שינוי כותרת ושמירה מצליחים; שינוי התאריך לתאריך אחר בעבר נחסם עם הודעה בטופס.
- טיוטה שלא נשמרה נעלמת: במעבר למשימה אחרת וחזרה, במעבר ל"אודות" וחזרה, וב-Refresh.
- שגיאת שרת מדומה (`page.route` ⇒ `503`) בשמירה: הודעה בטופס, הערכים נשארים, ניסיון חוזר מצליח.
- מחיקה: "ביטול" משאיר; "אישור" מוחק ⇒ הודעת הבחירה חוזרת ⇒ Refresh ⇒ המשימה לא קיימת; כשל מחיקה מדומה ⇒ המשימה נשארת ומוצגת שגיאה.
- `404`: עריכת משימה שנמחקה בינתיים (מחיקה ישירה דרך ה-API) ⇒ הודעת "המשימה לא נמצאה…".
- במובייל: שדות הפרטים, הכפתורים וחלון האישור נכנסים ברוחב המסך.
- **רגרסיה:** `milestone1.spec.ts` ו-`milestone2.spec.ts` עוברים כמו שהם (אם בדיקה קיימת מסתמכת על `readonly` בשדות הפרטים – מעדכנים רק את ההנחה הזו).

### 4.4 בדיקה ידנית שלי לפני סימון 🟡
`npm start` ⇒ מעבר ידני על כל סעיפי ה-Definition of Done בדסקטופ ובתצוגת מובייל, ובדיקה ש-`npm run build` עובר. בסיום – סגירת השרת.

## 5. קבצים

| פעולה | קובץ |
|---|---|
| חדש | `api/tasks/[id]/index.ts`, `api/tasks/[id]/index.test.ts` |
| חדש | `src/components/Modal.tsx`, `src/components/DeleteTaskModal.tsx`, `src/components/TaskDetails.test.tsx` |
| חדש | `e2e/milestone3.spec.ts` |
| שינוי | `api/_lib/tasksRepo.ts`, `api/_lib/http.ts`, `api/tasks/index.ts` (רק העברת `DB_INPUT_ERRORS`) |
| שינוי | `api/_lib/tasksRepo.integration.test.ts`, `shared/validation.test.ts` (אם חסר כיסוי) |
| שינוי | `src/api/tasksClient.ts`, `src/components/TaskDetails.tsx`, `src/components/CreateTaskModal.tsx`, `src/pages/HomePage.tsx`, `src/pages/HomePage.test.tsx` |
| שינוי | `src/styles/global.css` (ו-`tokens.css` אם צריך) |
| שינוי בסיום | `spec/MILESTONES.md` – סימון 🟡 ליד Milestone 3 |

אין Migration, אין משתני סביבה חדשים ואין תלויות חדשות.

## 6. החלטות ו-ADRs
- ADR-8 ב-`ARCHITECTURE.md` כבר מתאר את ההחלטות של ה-Milestone הזה (שלושת השדות חובה, `select … for update`, Advisory Lock ונרמול במחיקה). אם המימוש יחרוג ממנו – מעדכנים/מוסיפים ADR.
- מיקום הקובץ `api/tasks/[id]/index.ts` לפי ADR-9 כבר עכשיו.
- רכיב `Modal` משותף – החלטה קטנה, לא דורשת ADR.

## 7. מחוץ לטווח של Milestone זה
Checkbox פעיל, Drag & Drop, `PATCH /status`, `PUT /order` (Milestone 4); ליטוש חזותי סופי ו-PWA (Milestone 5); זיהוי התנגשויות עריכה או התראה על שינויים שלא נשמרו (מחוץ ל-PRD).

## 8. Definition of Done – איך כל סעיף ייבדק
| סעיף DoD | בדיקה |
|---|---|
| עריכה ושמירה נשמרות במסד ונראות אחרי Refresh | E2E 4.3, Integration 4.2 |
| תאריך שמור שעבר – אפשר לשמור בלי לשנותו; שינוי לתאריך עבר אחר נחסם | יחידה 4.1, Integration 4.2, E2E 4.3 |
| מעבר משימה / אודות / Refresh מבטלים טיוטה בלי התראה | HomePage 4.1, E2E 4.3 |
| כישלון שמירה או Validation – שגיאה ותוכן נשאר | TaskDetails 4.1, E2E 4.3 |
| "מחק משימה" פותח אישור; "ביטול" משאיר; "אישור" מוחק רק אחרי הצלחת השרת | TaskDetails 4.1, E2E 4.3 |
| אחרי מחיקה – המשימה נעלמת והודעת הבחירה חוזרת; כישלון לא מסיר אותה | HomePage 4.1, E2E 4.3 |
| שמירות מקבילות – האחרונה קובעת, בלי לדרוס סטטוס/סדר | Integration 4.2 |
| מראה השדות וה-Modal לפי DESIGN; בדיקות קודמות עוברות | בדיקה ידנית 4.4 מול Wireframes/Style Guide, רגרסיה 4.3 |
