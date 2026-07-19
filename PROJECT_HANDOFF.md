# TaskFlow - Project Handoff

עודכן לאחרונה: 2026-07-08

מסמך זה מיועד לפתיחת שיחת Codex/ChatGPT חדשה עם כל ההקשר החשוב של הפרויקט. אפשר להדביק אותו בתחילת שיחה חדשה ולבקש: "תמשיך לעבוד על TaskFlow לפי המסמך הזה".

## תקציר

TaskFlow היא מערכת ניהול משימות ולקוחות בעברית, RTL, עם ממשק Web/PWA ואריזת Electron לדסקטופ. בתחילה תוכננה כאפליקציית Desktop מקומית, ובהמשך הוסטה לכיוון Web/PWA עם DB מרכזי כדי לאפשר שימוש גם מהמחשב וגם מהנייד. משרתת כיום 2 משתמשים; המיקוד הוא נוחות שימוש, מראה נקי וגמישות אישית — לא סקיילינג.

המערכת מותאמת לעברית, ללא Bootstrap וללא jQuery. ה־frontend הוא Vanilla JS/HTML/CSS, וה־backend הוא Node.js + Express + SQLite דרך sql.js.

## מצב מוצר נוכחי

קיים כרגע:

- התחברות ורישום משתמשים פשוטים.
- הפרדת נתונים לפי משתמש (`user_id`).
- ניהול משימות מלא, כולל הוספה מהירה עם תחביר חכם.
- קטגוריות ראשיות, תתי קטגוריות, אנשי קשר, לקוחות בסיסיים.
- דחיפויות **וסטטוסים** דינמיים לכל משתמש (שם/צבע/סדר; לסטטוס גם דגל "נחשב כהושלם").
- דשבורד עם בחירת ווידג'טים, סדר וגודל תצוגה.
- **העדפות UI נשמרות ב־DB** (לא רק localStorage) — אותה חוויה בכל מכשיר.
- תצוגות שמורות (Saved Views), סדר עמודות, צפיפות תצוגה, גודל טקסט, מסך פתיחה, התאמת סיידבר.
- sessions נשמרים ב־DB ושורדים restart של השרת.
- מובייל: FAB + תצוגת כרטיסים + swipe (ימין=הושלם, שמאל=מחיקה) + PWA shortcut.
- קיצורי מקלדת, Undo למחיקה/השלמה, שורות קריאה עם chips, אנימציות עדינות, empty states, נגישות מודלים (focus trap, סגירה ברקע, Esc, שחזור פוקוס).
- ייבוא/ייצוא CSV בסיסי למשימות, גיבוי/שחזור DB בגרסת Desktop.
- פריסה ל־Render עם דיסק קבוע; מנגנון נגד cache ישן בדפדפן.

## סטאק

- Electron, Node.js, Express, SQLite via `sql.js`
- Vanilla JavaScript, HTML, CSS
- electron-builder, Render לפריסה Web

## פקודות חשובות

```powershell
npm install
npm run web
npm run test
npm run build
npm run dist:win
npm start
```

- `npm run web` מפעיל שרת Web דרך `src/web/server.js`.
- `npm start` / `npm run dev` מפעיל Electron.
- `npm run test` מריץ בדיקות smoke ב־`js/tests.js`.
- `npm run build` אורז Electron דרך `electron-builder`.
- `npm run dist:win` בונה חבילת Windows.

## פריסה ל־Render

קובץ: `render.yaml` — service `taskflow`, Node, Frankfurt, `npm ci` / `npm run web`, health check `/health`, דיסק קבוע `taskflow-data` ב-`/var/data`, env `TASKFLOW_DATA_DIR=/var/data`.

## מבנה תיקיות מרכזי

```text
src/
  backend/
    controllers/   (כולל preferencesController.js)
    database/
    middleware/
    repositories/  (כולל statusRepository.js, preferencesRepository.js)
    routes/
    services/      (כולל preferencesService.js)
    validators/
    server.js
  frontend/
    assets/
    components/
      api.js
      app.js        (~1800 שורות — כל ה-UI logic)
      ui.js
    i18n/
      he.js
    styles/
      styles.css    (~1400 שורות)
    index.html
    manifest.webmanifest  (כולל shortcuts)
    service-worker.js
  main/
  shared/
  web/
    server.js
js/
  tests.js
render.yaml
package.json
```

## ארכיטקטורה

### Backend

MVC/Service/Repository: `controllers` מקבלים request/response, `services` מכילים לוגיקה עסקית, `repositories` עובדים מול DB, `routes/index.js` מחבר endpoints, `middleware/auth.js` בודק token, `database/db.js` מאתחל DB/מיגרציות/persist.

**סטטוסים דינמיים** (`statusRepository.js`): מרכיב במדויק את `priorityRepository.js`. `taskService.normalize(userId, payload)` מולידציה מול הסטטוסים האמיתיים של המשתמש (לא enum קשיח), וקובע ברירת מחדל + `completed_at` לפי `is_done` של הסטטוס שנבחר. `taskRepository`: `exclude_completed`, `dashboard()`, `markComplete()`, `duplicate()` כולם עובדים מול `SELECT key FROM statuses WHERE ... is_done = 1` במקום מחרוזת `'completed'` קבועה. **אין יותר תלות ב-`shared/constants.js` STATUSES** — `taskValidator.validateTask(payload, validStatusKeys)` מקבל את הרשימה התקפה כפרמטר.

**Preferences** (`preferencesRepository.js`): טבלה אחת `user_preferences(user_id PK, data JSON)` — כל ה-blob של העדפות המשתמש (עמודות, פילטרים, תצוגות שמורות, סדר עמודות/ווידג'טים, צפיפות, מסך פתיחה, סיידבר) נשמר כ-JSON יחיד. `GET/PUT /api/preferences`.

### Frontend

`app.js` הוא קובץ אחד גדול (בכוונה — ללא build step/bundler). מבנה עיקרי:

- `state` גלובלי + `state.prefs` (מסונכרן מול השרת, עם cache ב-localStorage וגיבוי migration חד-פעמי ממפתחות ה-localStorage הישנים).
- `renderTasks()` / `taskCell()` — כל תא לא-actions הוא **read-mode כברירת מחדל** (chip/טקסט, קליק להפעלת עריכה) דרך `state.editingCells` (Set), חוץ מהעמודה `name` שנשארת input תמיד. `editableCell()`/`readOnlyCell()`/`dueDateCell()`/`createdDateCell()`.
- הוספה מהירה עם parser (`parseQuickAddInput`): `!דחיפות`, `#קטגוריה/תת-קטגוריה`, `@תאריך` (היום/מחר/מחרתיים/שם יום/dd/mm[/yyyy]) + preview chips חיים.
- Optimistic UI: הוספה מהירה, עריכת שדה בשורה (`quickUpdateTask`), מחיקה/השלמה (Undo 5 שניות) — כולם מעדכנים DOM מיד ומתקנים אחורה אם השרת נכשל (`t.messages.networkError`).
- Bulk actions: checkbox לכל שורה + "בחר הכול" → `bulkActionsBar()` (השלמה/מחיקה/העברת קטגוריה לנבחרים).
- קיבוץ לפי קטגוריה (`groupedTaskRows`) — טוגל ב-filters, client-side בלבד.
- תצוגות שמורות (`savedViewsBar`, `applySavedView`) ב-`state.prefs.savedViews`.
- מובייל (≤760px): טבלה הופכת לכרטיסים דרך CSS (`data-label` + `content: attr()`, לא render path נפרד), FAB פותח bottom-sheet (`openQuickAddSheet`), swipe (`bindSwipeGestures`, touch בלבד — לא משפיע על דסקטופ).
- נגישות מודלים: `bindGlobalUiHandlers` (קליק על backdrop סוגר), `trapFocus` (Tab בתוך מודל), `lastFocusedElement` (שחזור פוקוס ב-`closeModal`). כל פונקציית `open*Modal` מתחילה ב-`lastFocusedElement = document.activeElement;`.
- קיצורי מקלדת: `bindGlobalShortcuts` — `N`/`/` פוקוס להוספה, `Esc` סגירה, `Ctrl+Enter` שמירה, `?` חלונית עזרה.

קבצים נוספים:

- `api.js` - עטיפה ל-`/api`, כולל `statuses`/`preferences`.
- `ui.js` - icons (כולל `up`/`down`/`logout`/`close`), **toast עם תור** (`UI.toastQueue`, תומך `{actionLabel, onAction, duration}`), `dateInput` תוקן ל-local date (לא `toISOString` — נמנע מבאג timezone).
- `he.js` - כל הטקסטים בעברית.
- `styles.css` - כולל chips דינמיים (`color-mix`), כרטיסי מובייל, FAB/bottom-sheet, אנימציות (`@media (prefers-reduced-motion: reduce)` מכובד).

## Authentication ומשתמשים

- session token בטבלת `sessions` ב־DB (תפוגה 30 יום), שורד restart.
- הסיסמה SHA256+salt. `<form onsubmit="return false">` כ-fallback נגד submit נייטיבי לפני שה-JS נקשר.

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/status
POST /api/auth/logout
POST /api/auth/change-password
```

הערה: auth בסיסי, לא מתאים לקהל רחב ללא שדרוג (bcrypt/argon2, rate limiting) — לא רלוונטי כרגע (2 משתמשים מוכרים).

## Database

קובץ schema: `src/backend/database/schema.sql`

טבלאות: `users`, `sessions`, `categories`, `projects`, `contacts`, `customers`, `priorities`, **`statuses`**, **`user_preferences`**, `tasks`, `tags`, `task_tags`, `settings`.

### statuses (חדש)

מרכיב `priorities` בדיוק: `user_id`, `key`, `name`, `color`, `sort_order`, **`is_done`** (0/1), `created_at`/`updated_at`. אינדקס ייחודי `(user_id, key)`.

ברירת מחדל לכל משתמש (גם חדש דרך `catalogService.seedUserDefaults`, גם קיים דרך מיגרציה ב-`db.js`):

| key | name | is_done |
|---|---|---|
| open | פתוחה | 0 |
| in_progress | בתהליך | 0 |
| completed | הושלמה | 1 |
| blocked | חסומה | 0 |

**חשוב:** `tasks.status` נשאר עמודת TEXT רגילה עם ערך ברירת מחדל `'open'` — לא שונה סכמטית. הדינמיות היא רק בטבלת ה-lookup `statuses` ובקוד שמפרש אותה.

### user_preferences (חדש)

`user_id` (PK), `data` (TEXT — JSON blob), `updated_at`. מבנה ה-JSON (כל השדות אופציונליים, עם defaults ב-`defaultPreferences()` ב-`app.js`):

```text
taskFilters, visibleTaskColumns, taskColumnOrder, dashboardWidgets,
dashboardPanelOrder, dashboardWidgetSize, savedViews, density,
fontSize, homeView, sidebarOrder, sidebarHidden
```

### tasks / categories / projects / contacts / customers / priorities

ללא שינוי מבני מהותי (ראו גרסה קודמת של מסמך זה ב-git history לפירוט מלא של שדות אם צריך). תזכורת: קטגוריה = ראשית, `projects` = תת קטגוריה בקוד.

## API קיים

כל routes חוץ מ־auth דורשים `Authorization: Bearer <token>`.

```text
GET    /api/dashboard
GET    /api/tasks              (תומך exclude_completed=1 בנוסף לפילטרים הרגילים)
POST   /api/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/tasks/:id/complete
POST   /api/tasks/:id/duplicate

GET/POST/PUT/DELETE /api/priorities[/:id]
GET/POST/PUT/DELETE /api/categories[/:id]
GET/POST/PUT/DELETE /api/projects[/:id]
GET/POST/PUT/DELETE /api/customers[/:id]
GET/POST/PUT/DELETE /api/contacts[/:id]
GET/POST/PUT/DELETE /api/statuses[/:id]      (חדש — כמו priorities, plus is_done)

GET /api/preferences                          (חדש)
PUT /api/preferences                          (חדש — מחליף את כל ה-blob)

GET  /api/settings
POST /api/settings
POST /api/settings/backup
POST /api/settings/restore
POST /api/settings/export-csv
POST /api/settings/import-csv
```

## UI ולשוניות

הסיידבר: לוח בקרה, משימות, לקוחות, קטגוריות, תתי קטגוריות, אנשי קשר, הגדרות. **ניתן להסתיר ולסדר מחדש** דרך הגדרות (חוץ מ"הגדרות" עצמו, שנשאר תמיד גלוי). מסך הפתיחה אחרי login ניתן לבחירה (`state.prefs.homeView`).

## מסך משימות

- שורת "+" בראש הטבלה עם תחביר חכם (`!דחיפות #קטגוריה @תאריך`) + preview chips.
- כל תא (חוץ מ-actions) הוא chip/טקסט קריא; קליק הופך אותו לעריכה (select/input), יציאה אוטומטית ב-blur/שמירה.
- checkbox לכל שורה + "בחר הכול" → פס bulk actions (השלמה/מחיקה/העברת קטגוריה).
- קיבוץ לפי קטגוריה (טוגל ליד המיון).
- תצוגות שמורות (chips מעל הטבלה, "שמירת תצוגה" עם `prompt()` לשם).
- בחירת/סדר עמודות (חיצים למעלה/למטה ב-column picker; `actions` תמיד קבוע אחרון).
- badge לתאריך יעד + צ'יפים "היום"/"מחר" (בשורה — רק בפוקוס; במודל — גם "+שבוע").
- Undo 5 שניות למחיקה/השלמה (`UNDO_WINDOW_MS`). **הערה:** אם עובר זמן אמיתי >5 שניות בין הפעולה ל"בטל" (למשל בבדיקות עם השהיה), הפעולה מתבצעת בפועל — זה חלון קשיח, לא מתאפס.
- מובייל: כרטיסים במקום טבלה (CSS בלבד), FAB לפתיחת bottom-sheet, swipe (ימין=הושלם, שמאל=מחיקה).

## דשבורד

ווידג'טים: משימות פתוחות/שהושלמו/באיחור/להיום (כרטיסים), לפי דחיפות/קטגוריה/תת-קטגוריה/פעילות אחרונה (panels — עם סדר וגודל "רוחב מלא" הניתנים להגדרה).

## הגדרות

מצב בהיר/כהה, גיבוי/שחזור/CSV, **תצוגה** (צפיפות טבלה, גודל טקסט, מסך פתיחה), **תפריט צד** (הסתרה/סדר), **רמות דחיפות**, **סטטוסים** (ניהול מלא כמו דחיפויות, כולל "נחשב כהושלם").

## Cache / Service Worker

`index.html` לא רושם Service Worker חדש, מנקה קיימים; `server.js` שולח `no-store` לקבצי אפליקציה. `manifest.webmanifest` כולל `shortcuts` (לחיצה ארוכה על האייקון בנייד → `/?quick-add=1`).

**`service-worker.js` הוא כעת "kill switch" (עודכן 2026-07-19):** מכשיר עם registration ישן (גם כזה שתפס בקשות מ-cache) יתקין בעדכון התקופתי את הגרסה הזו, שבשלב `activate` מוחקת את כל ה-caches, מבטלת את הרישום של עצמה, ומכריחה `client.navigate()` על כל טאב פתוח שהיא שולטת בו — כך המכשיר מתכנס בחזרה למצב "בלי Service Worker בכלל", בלי פעולה ידנית. **תופעת לוואי מכוונת:** בפעם שבה עדכון זה מגיע לכל משתמש, טאב TaskFlow פתוח שלו ירענן את עצמו אוטומטית (בלי אזהרה) — זה חד-פעמי, לא יקרה שוב אחרי שהמכשיר "נקי". לא למחוק את הקובץ הזה בעתיד; הוא משמש כרשת ביטחון קבועה למכשירים שעדיין תקועים.

**לוגים:** `server.js` כותב שורת לוג לכל בקשה (`timestamp METHOD path status duration`), וה-error handler ב-`routes/index.js` (וגם זה הכפול/הלא-מגיע ב-`server.js`, שנשאר כרשת ביטחון) כותבים `console.error(error)` — קודם לכן לא היה שום לוג לבקשות/שגיאות מעבר לשלוש שורות ה-startup החד-פעמיות, מה שהפך את Render Logs לחסר תועלת לדיבאג.

## Electron/Desktop

`src/main/main.js`, `src/main/preload.js` — ללא שינוי בשלב זה.

## בדיקות

`js/tests.js` — ולידציה, רישום, CRUD לקוחות, בידוד בין משתמשים, **יצירת/השלמת משימה עם `exclude_completed`**, **session ששורד restart**. הרצה: `npm run test`.

## כללי פיתוח חשובים

- כל טקסט UI ב־`src/frontend/i18n/he.js`. RTL ועברית כברירת מחדל. Vanilla JS, בלי Bootstrap/jQuery.
- תבנית Repository/Service/Controller ב־backend; `user_id` בכל טבלה עסקית חדשה; `requireAuth` על כל API.
- **תבנית "סטטוסים/דחיפויות דינמיים"**: אם מוסיפים עוד enum שצריך להיות מותאם-משתמש (למשל שלבי עסקה של לקוחות), להעתיק במדויק את הדפוס של `statusRepository`/`priorityRepository` + `catalogService` + section ב-Settings.
- **תבנית "Optimistic UI"**: לעדכן `state`/DOM מיד, לשלוח ל-API ברקע, rollback + `t.messages.networkError` בכישלון. ראו `quickUpdateTask`, `bindQuickAdd`, `removeTask`/`completeTaskWithUndo`.
- **תבנית "העדפה חדשה"**: להוסיף שדה ל-`defaultPreferences()`, לקרוא/לכתוב דרך `state.prefs.<key>` + `persistPreferences()` (debounced PUT + localStorage cache). לא לשמור ישירות ב-localStorage בלבד.
- `requestAnimationFrame` נמנע בכוונה בקוד היישום (למשל `startEditingCell` עובר עם `setTimeout(fn, 0)`) — סביבות מסוימות (טאב ברקע, headless testing) לא מריצות rAF באופן אמין.

## דברים שחשוב לזכור

- 2 משתמשים בלבד כרגע — החלטות מוצר ממוקדות בנוחות/מראה/גמישות, לא בסקייל (ראו `IMPROVEMENT_PLAN.md` לנספח "לא רלוונטי כרגע" עם דברים לדחות לעתיד: better-sqlite3, pagination, אבטחה מוגברת, Service Worker אמיתי).
- קטגוריה היא הראשית; תת קטגוריה = `projects` בקוד.
- לקוחות כרגע נפרדים ממשימות.

## פיצ׳רים עתידיים מתוכננים/רעיוניים

חיבור לקוחות למשימות, Pipeline לקוחות מתקדם, שלבי עסקה דינמיים, דשבורד לקוחות, ייבוא/ייצוא Excel, התראות, לוח שנה, משימות חוזרות, AI Assistant, WhatsApp/Gmail Integration, multi-user מתקדם, cloud sync אמיתי, הרשאות/roles.

## מצב Git / הערות עבודה

לפני commit תמיד לבדוק:

```powershell
git status --short
git diff --stat
npm run test
```

## Prompt מומלץ לשיחה חדשה

```text
אני עובד על פרויקט TaskFlow. קרא את PROJECT_HANDOFF.md המצורף ותמשיך משם.
חשוב: עברית, RTL, Vanilla JS, Express, SQLite/sql.js, בלי Bootstrap ובלי jQuery.
לפני שינוי קוד תבדוק את המבנה הקיים ותשמור על הארכיטקטורה.
```
