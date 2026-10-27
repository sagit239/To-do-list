# Milestone 5 – התאמה חזותית, PWA ובדיקת מוצר מלאה – תוכנית

**מקורות:** `MILESTONES.md` (Milestone 5), `DESIGN.md` + `wireframes.png` / `style-guide.png` / `mockups1.png` / `mockups2.png`, `PRD.md`, `ARCHITECTURE.md` (2.7, 2.8, 2.9, 2.10, ADR-10, ADR-11).

## מצב נוכחי (נקודת פתיחה)

- כל הפיצ'רים של ה-PRD כבר עובדים (M1–M4): צפייה, יצירה, עריכה, מחיקה, השלמה, גרירה, ניווט.
- עיצוב: `src/styles/tokens.css` כבר מכיל את כל צבעי ה-Style Guide, הגופנים, המרווחים, הרדיוסים והצל. `global.css` מממש פריסה דו-עמודתית/עמודה אחת, כפתורים, שדות, Modal ו-Checkbox – בסיס טוב, חסר ליטוש.
- PWA: אין עדיין `public/`, Manifest, אייקונים או `theme-color`. אין Service Worker (וגם לא יהיה – ADR-10).
- Offline: אין חיווי קבוע על ניתוק; כשל רשת מטופל כבר בכל פעולה (הודעה + החזרת מצב).
- בדיקות: Vitest (יחידה/ממשק), Integration מול Dev, Playwright E2E ל-M1–M4 ב-Desktop Chrome וב-Pixel 7.

**אין שינויי מסד נתונים ב-Milestone הזה – אין Migration.**

## 1. ליטוש חזותי (DESIGN.md)

עקרון: לא מוסיפים שום רכיב פונקציונלי שלא קיים ב-PRD. מה-Mockups לוקחים רק גימור (צבעים, צל, ריווח, אייקונים) – **לא** תפריט המבורגר, "הגדרות", "ערוך משימה", תפריט שלוש-נקודות, פסי צבע לעדיפות, תאריך/תיאור בשורת הרשימה, או "נוצר בתאריך / עודכן לאחרונה".

קבצים: `src/styles/global.css`, `src/styles/tokens.css` (רק אם חסר ערך), `src/components/NavBar.tsx`, `HomePage.tsx`, `TaskDetails.tsx`, `CreateTaskModal.tsx`, `DeleteTaskModal.tsx`, `TaskList.tsx`, `AboutPage.tsx`, וקובץ חדש `src/components/icons.tsx`.

1. **אייקונים** (`icons.tsx`) – אייקוני קו SVG פשוטים, משקל קו אחיד, `currentColor`, `aria-hidden`:
   - `PlusIcon` בכפתור **הוסף משימה** (דף הבית בלבד; בכפתור השמירה שב-Modal – טקסט בלבד, כמו ב-Wireframe).
   - `TrashIcon` בכפתור **מחק משימה**.
   - `CloseIcon` – העברת ה-X הקיים מ-`CreateTaskModal` לקובץ המשותף, ושימוש בו גם בכפתור סגירת ההודעה ברשימה (במקום התו `×`).
   - ידית הגרירה הקיימת עוברת לאותו קובץ (`DragHandleIcon`) בלי שינוי התנהגות.
   - לוח שנה: נשאר בקר התאריך המובנה של Chrome (DESIGN 2.3).
2. **ניווט** – לשונית פעילה בסגנון ה-Style Guide: טקסט כחול + קו תחתון כחול (במקום רקע בלבד), Hover עדין; גובה קבוע ונוח למגע (≥ 44px). שני קישורים בלבד, גם במובייל.
3. **כותרת דף הבית** – `המשימות שלי` (H1), כפתור Primary עם `+`; מצב Disabled + הודעת "הרשימה מלאה" נשארים כמו היום.
4. **רשימת משימות** – שורות ברווח אחיד (8px grid), Hover תכלכל עדין, השורה הנבחרת ברקע תכלת (`--color-selected`) ועם הדגשה בצד (קו כחול דק בצד ההתחלה), Checkbox מעוגל מעט (כבר קיים), טקסט חצוי ואפור למשימה שהושלמה (קיים). מצבי טעינה/ריק/שגיאה – יישור ומרווח עקביים.
5. **אזור הפרטים** – Focus של שדה: גבול כחול + הילה עדינה (כמו ב-mockups2); שדות ברקע לבן עם גבול אפור בהיר; הודעות Validation באדום ליד השדה (קיים); הודעת הצלחה בירוק (קיימת). כפתורים: **שמור שינויים** Primary, **מחק משימה** Danger (מסגרת אדומה + אייקון פח). הודעת "בחר משימה..." ממורכזת בגוון משני.
6. **Modal-ים** – Overlay כהה-שקוף, חלון לבן, רדיוס 16px, צל רך; היררכיה: כותרת → שדות/שאלה → כפתורים. כפתורי פעולה בגובה אחיד. אין שינוי בטקסטים הקיימים (`הוספת משימה`, `הוסף משימה`/`סגור`, `מחיקת משימה`, `אישור`/`ביטול`).
7. **דף אודות** – כרטיס תוכן לבן ממורכז עם כותרת H1 ופסקה (קיים), התאמת מרווחים לדסקטופ ולמובייל.
8. **Typography** – לוודא שימוש עקבי ב-tokens: H1 32px (במובייל 24px – קיים), כותרות אזורים H3 18px, גוף 16px, הודעות 14px.
9. **RTL ותאריכים** – לבדוק בצילום מסך ש-`<input type="date">` מציג את הספרות והסדר תקין בתוך RTL בדסקטופ ובמובייל; אם הסדר משתבש – להוסיף `dir="ltr"` לשדה התאריך בלבד (יישור לימין נשמר). אם יידרש – לתעד כ-ADR קצר.

## 2. ליטוש מובייל (Viewport צר)

ב-`@media (max-width: 767px)` ב-`global.css`:
- אין גלילה אופקית בשום מסך (כולל טקסט ארוך מאוד בשורה, Modal פתוח ושגיאות).
- Modal: רוחב כמעט מלא עם שוליים של 16px, גובה מוגבל ל-Viewport עם גלילה פנימית; הכפתורים ברוחב מלא זה לצד זה.
- כפתורים ושדות ברוחב הזמין; כל אזור מגע (Checkbox, ידית גרירה, כפתורים, קישורי ניווט) ≥ 44×44px.
- `font-size` של שדות ≥ 16px (מונע הגדלה אוטומטית של הדף בעת Focus ב-Android).
- נשמרת ההפרדה בין ידית הגרירה (`touch-action: none`) לשאר השורה, כדי שגלילה במגע תמשיך לעבוד.

## 3. PWA (ADR-10 – ללא Service Worker)

קבצים חדשים:
- `public/manifest.webmanifest`:
  - `name: "רשימת משימות משותפת"`, `short_name: "משימות"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `lang: "he"`, `dir: "rtl"`, `background_color: "#EAF6FF"`, `theme_color: "#2F80ED"`.
  - `icons`: `icons/icon-192.png` (192×192), `icons/icon-512.png` (512×512), `icons/icon-maskable-512.png` (512×512, `purpose: "maskable"`).
- `public/icons/icon.svg` + `public/icons/icon-maskable.svg` – אייקון פשוט מתוך הפלטה: ריבוע כחול `#2F80ED` מעוגל עם סימן ✓ לבן (בגרסת ה-maskable – רקע מלא ושוליים בטוחים). זה עיצוב טכני מינימלי, לא דרישה חדשה; אפשר להחליף את ה-SVG באייקון אחר לפי בקשה.
- `scripts/generate-icons.mjs` – ממיר את ה-SVG ל-PNG בגדלים הנדרשים באמצעות ה-Chromium של Playwright שכבר מותקן בפרויקט (ללא תלות חדשה). מריצים פעם אחת; קובצי ה-PNG נשמרים ב-Git. סקריפט `npm run icons` ב-`package.json`.

שינויים:
- `index.html`: `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" content="#2F80ED">`, `<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">`.
- `vercel.json`: בדיקה שה-Rewrite הקיים (רק נתיבים ללא נקודה) לא תופס את `manifest.webmanifest` ואת `icons/*`; הוספת `headers` עבור `/manifest.webmanifest` עם `Content-Type: application/manifest+json`.
- HTTPS: מסופק אוטומטית על ידי Vercel ב-Production; אין מה לממש.

## 4. Offline – בלי נתונים שמורים

- **אין Service Worker** ואין Cache של `/api/*`, IndexedDB או Local Storage (המצב היום – נשמר).
- רכיב חדש `src/components/OfflineNotice.tsx`: מאזין ל-`navigator.onLine` ולאירועי `online`/`offline`; כשאין חיבור מציג פס הודעה קבוע מתחת לניווט, בשני הדפים (ב-`Layout.tsx`), עם `role="status"`:
  **"אין חיבור לאינטרנט. הרשימה המוצגת עשויה שלא להיות עדכנית, ולא ניתן לשמור שינויים עד שהחיבור יחזור."**
  כך רשימה שכבר נטענה לא נראית "עדכנית" כשאין רשת. כשהחיבור חוזר – הפס נעלם (בלי רענון אוטומטי של הרשימה, כי אין Real-Time לפי ה-PRD).
- פעולות בזמן ניתוק: ממשיכות להיכשל בבקשת הרשת ולהחזיר את המצב הקודם עם הודעה (התנהגות קיימת) – ייבדק ב-E2E.
- פתיחת האתר/ה-PWA בלי חיבור מציגה את דף "אין אינטרנט" של Chrome (ADR-10) – אין רשימה שמורה.
- הסגנון: גוון `warning`/`error-soft` עדין לפי ה-Style Guide (States & Feedback).

## 5. בדיקות

### יחידה / ממשק (Vitest – `npm test`)
- `OfflineNotice.test.tsx`: מוסתר כשמחובר; מופיע באירוע `offline`; נעלם באירוע `online`.
- עדכון בדיקות קיימות שנשענות על הסמל `×` בכפתור סגירת ההודעה (אם יש), כך שישתמשו ב-`aria-label` הקיים.
- כל הבדיקות הקיימות עוברות.

### Integration מול Dev (`npm run test:integration`)
- הרצה מלאה לרגרסיה (אין קוד שרת חדש).

### E2E (Playwright – `npm run test:e2e`, Desktop Chrome + Pixel 7) – קובץ חדש `e2e/milestone5.spec.ts`
1. **זרימה מלאה מקצה לקצה:** טעינה → יצירה ב-Modal → המשימה נבחרת → עריכה ושמירה → Checkbox → גרירה → מחיקה באישור → מעבר לאודות וחזרה → Refresh – בכל שלב המצב נשמר בשרת.
2. **מספר חלונות:** שני Browser Contexts נפרדים; שינוי בחלון א' לא מופיע בחלון ב' עד Reload, ואחרי Reload מופיע.
3. **PWA:** `/manifest.webmanifest` מחזיר 200 עם `Content-Type` מתאים ושדות חובה (`name`, `short_name`, `start_url`, `display: standalone`, `lang`, `dir`, אייקונים 192/512); כל אייקון מחזיר 200 כ-PNG בגודל הנכון; ב-HTML קיימים `link rel=manifest` ו-`theme-color`; `navigator.serviceWorker.getRegistrations()` ריק.
4. **Offline:** `context.setOffline(true)` → הפס מופיע בשני הדפים; ניסיון יצירה/סימון/גרירה נכשל, מציג הודעה ומחזיר את המצב הקודם; אחרי `setOffline(false)` הפס נעלם ו-Reload מציג את הנתונים מהשרת ללא השינויים שנכשלו. אין נתוני משימות ב-Local/Session Storage וב-Cache Storage.
5. **פריסה ועברית:** `dir=rtl` ו-`lang=he`; בכל מסך (בית, בית+בחירה, Modal יצירה, Modal מחיקה, אודות) אין גלילה אופקית (`scrollWidth <= clientWidth`) גם עם משימה בעלת כותרת ארוכה; במובייל ה-Modal נכנס כולו ב-Viewport; אזורי מגע ≥ 44px; תאריך יעד מוצג בשדה בפורמט תאריך בלבד.
6. **שגיאות שרת:** (קיים ב-M1–M4) – רגרסיה מלאה של כל הקבצים `milestone1–4.spec.ts`.
7. **צילומי מסך** של כל ששת מצבי התצוגה (דסקטופ + מובייל) לשמירה כראיה ולהשוואה ל-Wireframes – נשמרים בתיקיית הבדיקות הזמנית (לא ב-Git).

### Build ואבטחה
- `npm run typecheck`, `npm run build`.
- סריקה של `dist/` שאין בו `DATABASE_URL`, `postgres://`, סיסמאות או שמות משתני שרת; אין משתני `VITE_*` רגישים.
- סקירה שכל קריאות ה-SQL ב-`api/_lib/tasksRepo.ts` פרמטריות (`$1, $2...`) ושכל Handler מאמת קלט בשרת (קיים – בדיקה בלבד).

### בדיקות ידניות (על ידי המשתמש, עם הדרכה צעד אחר צעד)
- **Android Chrome:** גרירה במגע אמיתי; התקנת האתר כאפליקציה (תפריט ⋮ ← "הוספה למסך הבית"/"התקנת אפליקציה") ופתיחתו כחלון עצמאי. אין צורך בהודעת התקנה יזומה.
- **Offline בטלפון:** מצב טיסה → פתיחת האפליקציה → אין רשימה שמורה.

## 6. Production ופריסה

- כל ההרצות והבדיקות נעשות מול **Dev** בלבד; מול Production – רק בדיקות קריאה.
- פריסה ל-Production מחייבת Push ל-GitHub. לפי `CLAUDE.md` – **בסיום הבנייה אעצור ואבקש אישור ל-Push** (שהוא גם האישור לסימון ✅).
- אחרי ה-Push (לאחר אישור): בדיקת קריאה בלבד מול כתובת ה-Production שתימסר לי – `GET /api/tasks` מחזיר 200, Refresh ב-`/about`, ה-Manifest והאייקונים נטענים ב-HTTPS, אין Service Worker. אין Migration חדשה, כך שאין שינוי במבנה מסד ה-Production.

## 7. תיעוד

- `MILESTONES.md`: סימון 🟡 בסיום הבנייה.
- `ARCHITECTURE.md`: ADR-10 ו-ADR-11 כבר מתארים את הגישה; ADR חדש רק אם תתקבל החלטה שלא מכוסה (למשל `dir="ltr"` לשדה התאריך או Header ל-Manifest).
- `CLAUDE.md` – פקודות ההרצה לא משתנות (רק `npm run icons` נוסף, לשימוש חד-פעמי).

## 8. Definition of Done – איך כל תנאי ייבדק

| תנאי | אימות |
|---|---|
| תאימות ל-Wireframes ול-Style Guide, ללא רכיבים נוספים | צילומי מסך של ששת המצבים מול התמונות + סקירה שאין רכיבים מחוץ ל-PRD |
| RTL, תאריכים ועברית; פריסה בדסקטופ ובמובייל | E2E (5) + צילומי מסך + בדיקות M1 |
| כל הזרימות End-to-End | E2E (1), (2) + רגרסיה M1–M4 |
| PWA ב-Chrome Android | E2E (3) + בדיקה ידנית בטלפון אחרי פריסה |
| Offline ללא נתונים שמורים | E2E (4) + Unit + בדיקה ידנית במצב טיסה |
| Database מחוץ ללקוח, Validation בשרת, SQL פרמטרי | סריקת `dist/` + סקירת קוד + בדיקות API קיימות |
| Build, API, Integration, E2E, גרירה במגע, פריסה GitHub → Vercel | הרצת כל חבילות הבדיקה + בדיקה ידנית + Deployment אחרי אישור Push |
| הדגמה ותוצאות | סיכום תוצאות + "הרץ כדי שאבדוק" + עצירה לאישור הסופי |
