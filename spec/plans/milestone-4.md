# תוכנית – Milestone 4: סטטוס ביצוע וסדר ידני

**מקורות:** `MILESTONES.md` (Milestone 4), `PRD.md` (זרימות 4–5, FR-01, FR-05, FR-06, FR-07, טבלת מקרי הקצה), `ARCHITECTURE.md` (1, 2.2–2.6, 2.10, ADR-7, ADR-9, ADR-11), `DESIGN.md` (1.1, 1.6, 2.3), `wireframes.png` (שורת משימה: טקסט ← Checkbox ← ידית גרירה, מימין לשמאל; מובייל), `style-guide.png` (Checkbox, אייקונים).

**מצב נוכחי (מהקוד):** `TaskRow` הוא כפתור אחד לכל השורה, עם ריבוע סטטוס לתצוגה בלבד (`task-row__check`) וטקסט חצוי למשימה שהושלמה. `api/tasks/[id]/index.ts` מטפל ב-`PATCH`/`DELETE`; `tasksRepo.ts` כבר כולל את `LIST_LOCK_KEY` (Advisory Lock משותף) ונרמול מיקומים במחיקה. `HomePage.handleSaved` כבר לוקח מהשמירה רק את שדות הפרטים (ADR-9), ו-`TaskDetails` מקבל `key={task.id}`, כך שהטיוטה לא מתאפסת כשמשתנים `completed`/`position`. **אין צורך ב-Migration ובמשתני סביבה חדשים.** ההחלטות הטכניות של ה-Milestone כבר מתועדות ב-ADR-9.

## 1. מטרה

כל מבקר יכול לסמן משימה כהושלמה (ולבטל את הסימון) ב-Checkbox שבשורה, ולשנות את סדר המשימות בגרירה – בעכבר במחשב ובמגע ב-Android. כל שינוי נשמר מיד במסד הנתונים ומשותף לכולם; בכישלון התצוגה חוזרת למצב השמור האחרון עם הודעה. הרשימה נשארת אחת, ומשימה שהושלמה לא זזה ממקומה.

## 2. Backend

### 2.1 `PATCH /api/tasks/:id/status` – קובץ חדש `api/tasks/[id]/status.ts`
- מזהה שאינו UUID ⇒ `400 INVALID_ID` (`isUuid` הקיים). Method אחר ⇒ `405` עם `Allow: PATCH`.
- `readJsonBody` (16KB). הגוף חייב להכיל `completed` מסוג `boolean` (ערך מפורש, לא Toggle); אחרת ⇒ `400 INVALID_STATUS` – **"יש לשלוח סטטוס תקין."**. שדות אחרים – מתעלמים מהם.
- קריאה ל-`setTaskStatus` (2.3). הצלחה ⇒ `200` + המשימה; לא קיימת ⇒ `404 TASK_NOT_FOUND` (אותה הודעה כמו ב-Milestone 3); אחרת `sendServerError` (`503`).

### 2.2 `PUT /api/tasks/order` – קובץ חדש `api/tasks/order.ts`
נתיב סטטי, שגובר על `[id]` (ADR-9).
- Method אחר ⇒ `405` עם `Allow: PUT`.
- `readJsonBody` עם מגבלה של **64KB** (קבוע חדש `ORDER_BODY_LIMIT` ב-`http.ts`; שאר הנתיבים נשארים 16KB).
- בדיקת מבנה: `orderedIds` הוא מערך של עד 1,000 מחרוזות UUID, ללא כפילויות. אחרת ⇒ `400 INVALID_ORDER` – **"סדר המשימות שנשלח אינו תקין."**.
- קריאה ל-`reorderTasks` (2.3). הצלחה ⇒ `200` + הרשימה המלאה בסדר החדש; קבוצת מזהים שאינה תואמת ⇒ `409 ORDER_CONFLICT` – **"רשימת המשימות השתנתה בינתיים. רעננו את הרשימה ונסו שוב."**; אחרת `503`.

### 2.3 Repository – `api/_lib/tasksRepo.ts`
- **`setTaskStatus(id, completed, pool = getPool())`** – שאילתה אחת: `update public.tasks set completed = $2 where id = $1 returning …`. **בלי** Advisory Lock ובלי Transaction: לא נוגעת ב-`position` או בשדות הפרטים, ולכן לא מתנגשת בשינויי מבנה או בעריכת פרטים (ADR-9). אין שורה ⇒ `TaskNotFoundError`. (`updated_at` מתעדכן ב-Trigger הקיים.)
- **`OrderConflictError`** – מחלקת שגיאה חדשה, בסגנון `TaskLimitError`.
- **`reorderTasks(orderedIds, pool = getPool())`** – Transaction אחת על אותו `client` (ARCHITECTURE 2.6, 2.9):
  1. `begin`; `pg_advisory_xact_lock(LIST_LOCK_KEY)` – אותה נעילה כמו ביצירה ובמחיקה.
  2. קריאת כל המזהים הקיימים; אם מספרם שונה ממספר המזהים שנשלחו, או שמזהה שנשלח אינו קיים ⇒ `rollback` וזריקת `OrderConflictError` (בלי לשנות דבר).
  3. עדכון בשאילתה אחת: `update public.tasks t set position = o.ord - 1 from unnest($1::uuid[]) with ordinality as o(id, ord) where t.id = o.id and t.position <> o.ord - 1` ⇒ מיקומים רציפים 0..N-1.
  4. `listTasks(client)` להחזרת הרשימה המעודכנת; `commit`.
  - כך: שתי גרירות במקביל מתבצעות זו אחר זו והאחרונה קובעת; גרירה שמתנגשת ביצירה/מחיקה במקביל נדחית ב-`409` או מתבצעת לפני/אחרי במלואה – אף פעם לא סדר חלקי, כפילות או משימה חסרה.

## 3. Frontend

### 3.1 תלויות חדשות
`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (כמו שנקבע ב-ARCHITECTURE 1). אין תלויות נוספות.

### 3.2 `src/api/tasksClient.ts`
- **`setTaskStatus(id, completed): Promise<Task>`** – `PATCH /api/tasks/:id/status`; הודעת כשל ברירת מחדל: **"שינוי הסטטוס נכשל. נסו שוב."**
- **`saveOrder(orderedIds): Promise<Task[]>`** – `PUT /api/tasks/order`; הודעת כשל ברירת מחדל: **"שמירת הסדר נכשלה. נסו שוב."** שתיהן דרך `sendWrite` הקיים, כך ש-`409` מגיע ללקוח כ-`ApiRequestError` עם `code: 'ORDER_CONFLICT'`.

### 3.3 `src/components/TaskRow.tsx` – שורה עם שלושה חלקים נפרדים
במקום כפתור אחד לכל השורה, השורה (`li`) מכילה שלושה רכיבים אחים, בסדר ה-Wireframe (מימין לשמאל ב-RTL):
1. **כפתור בחירה** עם טקסט השורה (כמו היום) – לחיצה עליו בלבד בוחרת את המשימה.
2. **Checkbox אמיתי** (`input type="checkbox"`, מעוצב לפי ה-Style Guide: ריבוע מעוגל, סימון כחול), עם תווית נגישה **"סימון המשימה כהושלמה"**. לחיצה עליו משנה רק סטטוס – לא בוחרת את השורה. מושבת בזמן שבקשת הסטטוס של אותה משימה ממתינה.
3. **ידית גרירה** – כפתור עם אייקון קו (⋮⋮), תווית נגישה **"גרירה לשינוי מיקום"**, `touch-action: none`, אזור מגע של לפחות 44px. רק ממנה אפשר להתחיל גרירה, כך שגלילת הרשימה במובייל ממשיכה לעבוד בשאר השורה.
- השורה משתמשת ב-`useSortable` (מ-`@dnd-kit/sortable`); ה-`listeners` מחוברים לידית בלבד. בזמן גרירה השורה מקבלת מראה מורם עדין (צל + רקע).
- טקסט חצוי ו-Checkbox מסומן למשימה שהושלמה – כולל משימה ללא כותרת (הטקסט הוא תחילת התיאור). המשימה לא זזה ממקומה.

### 3.4 `src/components/TaskList.tsx` – Drag & Drop
- עוטף את הרשימה ב-`DndContext` + `SortableContext` (`verticalListSortingStrategy`).
- Sensors (ADR-9): `PointerSensor` (עכבר ומגע) עם סף תזוזה קטן (כ-5px) כדי שנגיעה בידית בלי תזוזה לא תיחשב גרירה; `KeyboardSensor` עם `sortableKeyboardCoordinates` לנגישות.
- הודעות קורא מסך בעברית (`accessibility.announcements` + `screenReaderInstructions`), למשל: "הרמת את המשימה X", "המשימה X הועברה למקום 3", "הגרירה בוטלה".
- Props חדשים: `onToggle(id, completed)`, `onReorder(orderedIds)`, `pendingStatusIds` (Set), `dragDisabled`. בסיום גרירה עם שינוי מיקום – `arrayMove` ⇒ `onReorder`. גרירה שבוטלה או שחזרה לאותו מקום – לא נשלחת בקשה.

### 3.5 `src/pages/HomePage.tsx` – ממשק אופטימי עם החזרה בכישלון (ADR-9)
- **`handleToggle(id, completed)`:** מעדכן מיד את `completed` של אותה משימה ב-State ומוסיף אותה ל-`pendingStatusIds` ⇒ `setTaskStatus`. הצלחה ⇒ מוציא מ-`pending` (לא דורס שדות אחרים מתשובת השרת). כישלון ⇒ מחזיר **רק** את `completed` של אותה משימה לערך הקודם ומציג הודעת שגיאה.
- **`handleReorder(orderedIds)`:** שומר את סדר המזהים הקודם, מסדר מיד את הרשימה ב-State (עם `position` 0..N-1) ומסמן `orderSaving` (גרירה נוספת מושבתת עד הסיום) ⇒ `saveOrder`. הצלחה ⇒ מסיר את הסימון; הסדר המקומי כבר נכון, ולכן לא מחליפים את כל הרשימה בתשובת השרת (כדי לא לדרוס סימון סטטוס שעדיין נשמר). כישלון ⇒ `restoreOrder` – מחזיר רק את סדר המזהים הקודם (משימות שנוספו בינתיים נשארות בסוף; שינויי סטטוס/פרטים נשמרים) ומציג הודעה.
- **הודעת פעולה ברשימה:** אזור הודעה אחד מעל הרשימה (`role="alert"`, בגוון `error` עדין) שמציג את השגיאה האחרונה של Checkbox/גרירה, עם כפתור סגירה קטן. ב-`409 ORDER_CONFLICT` ההודעה כוללת כפתור **"רענן את הרשימה"**.
- **רענון הרשימה:** טוען מחדש `GET /api/tasks` (אותה פונקציה של הטעינה הראשונה, מוצאת לפונקציה משותפת `loadTasks`). אחרי הטעינה הבחירה נשמרת אם המשימה עדיין קיימת (ואז גם הטיוטה שבפרטים נשארת, כי ה-`key` לא השתנה), ואחרת מתאפסת. אין Polling ואין רענון אוטומטי (FR-01).
- **הטיוטה בפרטים:** Checkbox וגרירה משנים רק `completed`/`position` ב-State; `TaskDetails` לא מאותחל מחדש ולא שולח שמירה. לוודא שאין ב-`TaskDetails` קוד שמסנכרן את הטיוטה מחדש כשמשתנה אובייקט ה-`task` (אם יש – לתקן).

### 3.6 CSS – `src/styles/global.css` (+ `tokens.css` אם חסר טוקן)
- פריסת שורה: כפתור הבחירה ממלא את הרוחב; Checkbox וידית בגודל קבוע; רקע עדין לשורה הנבחרת נשאר.
- Checkbox מעוצב: ריבוע מעוגל, גבול `border`, סימון `primary`, Focus ברור, מצב Disabled חיוור.
- ידית: צבע `text-secondary`, Hover/Focus ב-`primary`, `cursor: grab` / `grabbing`, `touch-action: none`.
- שורה בזמן גרירה: צל רך (`0 2px 8px rgba(0,0,0,0.08)`) ורקע `surface`.
- `.list-alert` להודעת הפעולה, בדומה ל-`form-alert`.
- במובייל (הבלוק הקיים סביב שורה 497): אזורי מגע גדולים מספיק ל-Checkbox ולידית. ליטוש חזותי מלא נשאר ל-Milestone 5.

## 4. בדיקות

### 4.1 יחידה וממשק (`npm test`)
- **`api/tasks/[id]/status.test.ts`** (חדש, Repository מדומה): `405`; `400` למזהה לא UUID; `415`/`400` לגוף לא תקין; `400 INVALID_STATUS` ל-`completed` חסר או לא בוליאני (למשל `"true"`, `1`); `200` עם `true` ועם `false`; `404`; `503`.
- **`api/tasks/order.test.ts`** (חדש): `405`; `400` כשאין מערך, כשיש מזהה לא UUID, כפילות, או יותר מ-1,000 מזהים; מגבלת 64KB (`413`); `409 ORDER_CONFLICT`; `200` עם הרשימה; `503`.
- **`src/components/TaskRow` / `TaskList`** (בדיקה חדשה `TaskList.test.tsx`): לחיצה על Checkbox קוראת ל-`onToggle` ולא ל-`onSelect`; לחיצה על הידית לא בוחרת ולא משנה סטטוס; Checkbox מושבת כשהמשימה ב-`pending`; משימה שהושלמה – Checkbox מסומן וטקסט עם הסימון החזותי; גרירה במקלדת (רווח ⇒ חץ ⇒ רווח) קוראת ל-`onReorder` עם הסדר החדש.
- **`src/pages/HomePage.test.tsx`**: סימון מוצג מיד ונשמר; כישלון ⇒ ה-Checkbox חוזר + הודעה; סדר חדש מוצג מיד; כישלון שמירת סדר ⇒ הסדר הקודם חוזר + הודעה; `409` ⇒ כפתור "רענן את הרשימה" שטוען מחדש מהשרת; **טיוטה שלא נשמרה בפרטים נשארת** אחרי סימון Checkbox ואחרי שינוי סדר של המשימה הנבחרת (וגם לא נשלחת בקשת `PATCH` לפרטים); אין קריאות `GET` נוספות בלי פעולה של המשתמש.
- כל בדיקות היחידה הקיימות ממשיכות לעבור (אם בדיקה קיימת מסתמכת על כך שהשורה כולה היא כפתור אחד – מעדכנים רק את ההנחה הזו).

### 4.2 Integration מול Dev (`npm run test:integration`, ADR-7 – הנתונים מוחזרים בסיום)
- `setTaskStatus`: סימון וביטול נשמרים; `position` ושדות הפרטים לא משתנים; מזהה לא קיים ⇒ `TaskNotFoundError`.
- `reorderTasks`: סדר חדש נשמר בדיוק, עם מיקומים 0..N-1 בלי כפילויות; משימות שהושלמו מסודרות כמו האחרות; קבוצת מזהים חסרה/עודפת/עם מזהה שנמחק ⇒ `OrderConflictError` והמסד לא השתנה.
- **שתי גרירות במקביל** (שני Pools = שני מבקרים): שתיהן מצליחות, והסדר הסופי זהה במלואו לאחת מהן – לא תערובת; מיקומים רציפים.
- **יצירה בזמן גרירה** ו**מחיקה בזמן גרירה** (במקביל): או שהגרירה נדחית ב-`OrderConflictError` בלי שינוי, או ששתי הפעולות מצליחות; בכל מקרה – אין משימה חסרה, אין כפילות, ומיקומים רציפים 0..N-1.
- **סטטוס ו-עריכת פרטים במקביל לגרירה:** אף פעולה לא דורסת את השדות של האחרת.

### 4.3 E2E ב-Chrome (`npm run test:e2e`, Desktop + Mobile, מול Dev) – `e2e/milestone4.spec.ts`
- Checkbox: סימון ⇒ טקסט חצוי ⇒ Refresh ⇒ עדיין מסומן ובאותו מיקום; ביטול הסימון נשמר גם הוא. לחיצה על ה-Checkbox לא בוחרת את השורה.
- גרירה בעכבר (Desktop) מהידית ⇒ הסדר משתנה מיד ⇒ Refresh ⇒ אותו סדר בדיוק; בדיקה ישירה ב-API שה-`position` רציף בלי כפילויות. משימה שהושלמה נגררת כמו האחרות.
- גרירה במגע (Mobile Chrome / Pixel 7): הדמיית מגע אמיתית (Touch events דרך Chrome DevTools Protocol) על הידית ⇒ הסדר נשמר; נגיעה בידית לא מסמנת Checkbox ולא בוחרת משימה; גלילה ברשימה (מחוץ לידית) לא מתחילה גרירה.
- טיוטה: בחירת משימה ⇒ שינוי הכותרת בלי לשמור ⇒ סימון ה-Checkbox שלה וגרירתה ⇒ הטיוטה עדיין בשדה, ו-Refresh מראה שהכותרת השמורה לא השתנתה.
- כישלון מדומה (`page.route` ⇒ `503`): Checkbox חוזר למצבו + הודעה; גרירה – הסדר הקודם חוזר + הודעה.
- `409`: מוחקים משימה ישירות דרך ה-API (מבקר אחר) ⇒ גרירה בדף ⇒ הודעה עם "רענן את הרשימה" ⇒ הסדר המקומי חוזר בלי לאבד משימה ⇒ לחיצה על הכפתור טוענת את הרשימה העדכנית.
- מבקר אחר (`context` שני): סימון/גרירה בחלון אחד לא מופיעים בחלון השני עד Refresh, ומופיעים אחריו; אין בקשות `GET /api/tasks` ברקע במשך כמה שניות.
- **רגרסיה:** `milestone1/2/3.spec.ts` עוברים (אם בדיקה בוחרת שורה בלחיצה על השורה כולה – מעדכנים רק את הסלקטור לכפתור הבחירה).

### 4.4 בדיקה ידנית שלי לפני סימון 🟡
`npm start` ⇒ מעבר על כל סעיפי ה-Definition of Done בדסקטופ ובתצוגת מובייל עם מגע מודמה, ובדיקה ש-`npm run build` עובר. בסיום – סגירת השרת.
**גרירה במגע בטלפון Android אמיתי** – אני לא יכול לבדוק בעצמי (ADR-11); אחרי "הרץ כדי שאבדוק" אסביר לך איך לפתוח את האתר בטלפון ומה לבדוק.

## 5. קבצים

| פעולה | קובץ |
|---|---|
| חדש | `api/tasks/[id]/status.ts`, `api/tasks/[id]/status.test.ts` |
| חדש | `api/tasks/order.ts`, `api/tasks/order.test.ts` |
| חדש | `src/components/TaskList.test.tsx`, `e2e/milestone4.spec.ts` |
| שינוי | `api/_lib/tasksRepo.ts`, `api/_lib/http.ts` (`ORDER_BODY_LIMIT`), `api/_lib/tasksRepo.integration.test.ts` |
| שינוי | `src/api/tasksClient.ts`, `src/components/TaskRow.tsx`, `src/components/TaskList.tsx`, `src/pages/HomePage.tsx`, `src/pages/HomePage.test.tsx` |
| שינוי (אם צריך) | `src/components/TaskDetails.tsx` (רק אם הטיוטה מסונכרנת מחדש בשינוי `task`), בדיקות/E2E קיימים (רק סלקטור הבחירה) |
| שינוי | `src/styles/global.css` (ו-`tokens.css` אם צריך) |
| שינוי | `package.json`, `package-lock.json` (שלוש חבילות `@dnd-kit`) |
| שינוי בסיום | `spec/MILESTONES.md` – סימון 🟡 ליד Milestone 4 |

אין Migration ואין משתני סביבה חדשים.

## 6. החלטות ו-ADRs
- ADR-9 ב-`ARCHITECTURE.md` כבר מתאר את ההחלטות של ה-Milestone הזה (מיקום הקבצים, סטטוס בלי Advisory Lock, סדר תחת הנעילה עם `409`, מגבלת 64KB, ממשק אופטימי עם החזרה, ידית עם `PointerSensor` + `KeyboardSensor`). אם המימוש יחרוג ממנו – מעדכנים/מוסיפים ADR.
- הדמיית מגע ב-E2E דרך Chrome DevTools Protocol – אם יתברר שזה דורש שינוי בגישת הבדיקות של ADR-11, יתועד כ-ADR חדש.

## 7. מחוץ לטווח של Milestone זה
Polling / Real-Time / רענון אוטומטי (מחוץ ל-PRD); חלוקת הרשימה לפי סטטוס או מיון אוטומטי (מחוץ ל-PRD); ליטוש חזותי סופי, PWA ומצב Offline (Milestone 5).

## 8. Definition of Done – איך כל סעיף ייבדק
| סעיף DoD | בדיקה |
|---|---|
| Checkbox מסמן ומבטל, נשמר מיד, לא משנה מיקום | Integration 4.2, E2E 4.3 |
| משימות שהושלמו באותה רשימה וניתנות לגרירה | Integration 4.2, E2E 4.3 |
| Checkbox/גרירה של המשימה הנבחרת לא נוגעים בטיוטה | HomePage 4.1, E2E 4.3 |
| Drag & Drop בעכבר ובמגע, בלי להפעיל בטעות Checkbox או בחירה | TaskList 4.1, E2E 4.3 (Desktop + מגע מודמה), בדיקה שלך בטלפון Android |
| אחרי גרירה ו-Refresh – הסדר המדויק נשמר, מיקומים רציפים בלי כפילויות | Integration 4.2, E2E 4.3 |
| Integration: Transaction אטומית ביצירה/מחיקה בזמן שינוי סדר, ושתי גרירות במקביל | Integration 4.2 |
| קבוצת מזהים שהשתנתה ⇒ `409`, בלי אובדן משימה או סדר חלקי | API 4.1, Integration 4.2, E2E 4.3 |
| תקלת שרת ⇒ Checkbox/סדר חוזרים לשמור האחרון + הודעה | HomePage 4.1, E2E 4.3 |
| שינויי מבקר אחר מופיעים אחרי Refresh, בלי עדכוני רקע; יכולות קודמות עובדות | E2E 4.3 (שני חלונות + רגרסיה) |
