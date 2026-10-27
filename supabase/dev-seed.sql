-- Test data for the Dev project only. Never run against Production.
-- Replaces all tasks in the table.

begin;

delete from public.tasks;

insert into public.tasks (title, description, due_date, completed, position) values
  ('לקנות מצרכים', 'חלב, לחם, ביצים וירקות לשבוע', current_date + 2, false, 0),
  ('לתכנן חופשה', 'לבדוק יעדים, מחירים ולסגור כרטיסים', current_date + 30, false, 1),
  ('לסיים דוח שנתי', 'להגיש לפני סוף החודש', current_date - 3, true, 2),
  ('לפנות למוסך', null, null, false, 3),
  (null, 'לבדוק אפשרויות ביטוח לרכב החדש ולהשוות בין לפחות שלוש חברות ביטוח שונות לפני שמחליטים', current_date + 7, false, 4),
  ('כותרת ארוכה במיוחד כדי לבדוק שהטקסט נקטע כראוי בשורת הרשימה כשאין לו מספיק מקום להיות מוצג במלואו', 'תיאור קצר', null, false, 5);

commit;
