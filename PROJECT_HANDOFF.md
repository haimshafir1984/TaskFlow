# TaskFlow - Project Handoff

עודכן לאחרונה: 2026-07-08

מסמך זה מיועד לפתיחת שיחת Codex/ChatGPT חדשה עם כל ההקשר החשוב של הפרויקט. אפשר להדביק אותו בתחילת שיחה חדשה ולבקש: "תמשיך לעבוד על TaskFlow לפי המסמך הזה".

## תקציר

TaskFlow היא מערכת ניהול משימות ולקוחות בעברית, RTL, עם ממשק Web/PWA ואריזת Electron לדסקטופ. בתחילה תוכננה כאפליקציית Desktop מקומית, ובהמשך הוסטה לכיוון Web/PWA עם DB מרכזי כדי לאפשר שימוש גם מהמחשב וגם מהנייד.

המערכת מותאמת לעברית, ללא Bootstrap וללא jQuery. ה־frontend הוא Vanilla JS/HTML/CSS, וה־backend הוא Node.js + Express + SQLite דרך sql.js.

## מצב מוצר נוכחי

קיים כרגע:

- התחברות ורישום משתמשים פשוטים.
- הפרדת נתונים לפי משתמש (`user_id`).
- ניהול משימות מלא.
- קטגוריות ראשיות.
- תתי קטגוריות דרך לשונית "תתי קטגוריות"/projects.
- אנשי קשר.
- לקוחות בסיסיים.
- דשבורד עם בחירת ווידג׳טים להצגה.
- הגדרות, כולל רמות דחיפות דינמיות לכל משתמש.
- הוספה מהירה של משימה משורת "+" בראש טבלת המשימות (שם בלבד, Enter).
- צביעה עדינה של שורות המשימות לפי צבע הקטגוריה.
- זכירת פילטרים ב־localStorage וברירת מחדל "פעילות (ללא הושלמו)".
- sessions נשמרים ב־DB (טבלת `sessions`) ושורדים restart של השרת.
- ייבוא/ייצוא CSV בסיסי למשימות.
- גיבוי/שחזור DB בגרסת Desktop.
- פריסה ל־Render עם דיסק קבוע.
- מנגנון נגד cache ישן בדפדפן: אין רישום Service Worker חדש, ונשלחים headers של `no-store` לקבצי האפליקציה.

## סטאק

- Electron
- Node.js
- Express
- SQLite via `sql.js`
- Vanilla JavaScript
- HTML
- CSS
- electron-builder
- Render לפריסה Web

## פקודות חשובות

```powershell
npm install
npm run web
npm run test
npm run build
npm run dist:win
npm start
```

פירוט:

- `npm run web` מפעיל שרת Web דרך `src/web/server.js`.
- `npm start` / `npm run dev` מפעיל Electron.
- `npm run test` מריץ בדיקות smoke ב־`js/tests.js`.
- `npm run build` אורז Electron דרך `electron-builder`.
- `npm run dist:win` בונה חבילת Windows.

## פריסה ל־Render

קובץ: `render.yaml`

- service name: `taskflow`
- runtime: Node
- region: Frankfurt
- build command: `npm ci`
- start command: `npm run web`
- health check: `/health`
- disk קבוע:
  - name: `taskflow-data`
  - mount path: `/var/data`
  - size: 1GB
- env var חשוב:
  - `TASKFLOW_DATA_DIR=/var/data`

ה־DB ב־Render נשמר בדיסק הקבוע תחת `/var/data`.

## מבנה תיקיות מרכזי

```text
src/
  backend/
    controllers/
    database/
    middleware/
    repositories/
    routes/
    services/
    validators/
    server.js
  frontend/
    assets/
    components/
      api.js
      app.js
      ui.js
    i18n/
      he.js
    styles/
      styles.css
    index.html
    manifest.webmanifest
    service-worker.js
  main/
    main.js
    preload.js
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

ה־backend בנוי בסגנון MVC/Service/Repository:

- `controllers` מקבלים request/response.
- `services` מכילים לוגיקה עסקית ונרמול payload.
- `repositories` עובדים מול DB.
- `routes/index.js` מחבר endpoints.
- `middleware/auth.js` בודק token ומוסיף `req.user`.
- `database/db.js` מאתחל DB, מריץ schema, מיגרציות ו־persist.

### Frontend

ה־frontend מרוכז בעיקר ב־`src/frontend/components/app.js`:

- state גלובלי בצד לקוח.
- render לפי לשונית פעילה.
- CRUD modals.
- inline editing למשימות.
- שמירת בחירת עמודות ודשבורד ב־`localStorage`.

קבצים נוספים:

- `api.js` - עטיפה לקריאות `/api` ושמירת token ב־`localStorage`.
- `ui.js` - icons, toast, תאריכים.
- `he.js` - כל הטקסטים בעברית במקום אחד.
- `styles.css` - עיצוב RTL, Windows 11 style, light theme, responsive.

## Authentication ומשתמשים

המודל כרגע פשוט:

- משתמש נרשם עם שם משתמש וסיסמה.
- אין הגבלת אורך סיסמה.
- הסיסמה נשמרת כ־SHA256 עם salt.
- session token נשמר בטבלת `sessions` ב־DB (תפוגה 30 יום) וב־localStorage בדפדפן.
- sessions שורדים restart/deploy של השרת; sessions שפגו מנוקים באתחול.
- כל נתוני המשתמש מופרדים לפי `user_id`.

Endpoints:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/status
POST /api/auth/logout
POST /api/auth/change-password
```

הערה: זה auth בסיסי מאוד, לא אבטחה מלאה למערכת ציבורית רחבה. אם יהיו לקוחות אמיתיים רבים, צריך לשדרג בהמשך ל־sessions/JWT יציב, hash חזק יותר כמו bcrypt/argon2, rate limiting ועוד.

## Database

קובץ schema: `src/backend/database/schema.sql`

טבלאות קיימות:

- `users`
- `sessions` - session tokens עם `expires_at`
- `tasks`
- `categories`
- `projects`
- `contacts`
- `customers`
- `priorities`
- `tags`
- `task_tags`
- `settings`

### users

שדות מרכזיים:

- `id`
- `username`
- `password_hash`
- `password_salt`
- `created_at`
- `updated_at`

### tasks

שדות מרכזיים:

- `user_id`
- `name`
- `description`
- `project_id`
- `category_id`
- `contact_id`
- `priority`
- `status`
- `created_at`
- `due_date`
- `notes`
- `completed_at`

סטטוסים:

- `open`
- `in_progress`
- `completed`
- `blocked`

### categories

קטגוריה ראשית.

שדות:

- `user_id`
- `name`
- `color`
- `description`
- `sort_order`

דוגמאות ברירת מחדל שנזרעות למשתמש חדש:

- משימות אישיות
- סידורים
- משפחה
- פיתוח עסקי
- קניות

### projects

תת קטגוריה.

שדות:

- `user_id`
- `name`
- `category_id`
- `color`
- `description`

דוגמאות תחת קניות:

- קניות קטנות
- קניות גדולות
- סופר ומוצרי מזון

### contacts

אנשי קשר פשוטים:

- `name`
- `phone`
- `email`
- `notes`

### customers

אזור לקוחות בסיסי ונפרד מניהול המשימות.

שדות:

- `user_id`
- `name` - שם לקוח
- `deal_description` - מהות העסקה, טקסט חופשי
- `stage` - שלב
- `price` - מחיר
- `contact_person` - איש קשר
- `phone`
- `email`
- `notes`

שלבים קיימים:

- `quote` - ניתנה הצעת מחיר
- `closed` - נסגר

כרגע אין קשר DB בין לקוחות למשימות. בהמשך אפשר להוסיף `customer_id` ל־`tasks`.

### priorities

רמות דחיפות דינמיות לפי משתמש.

שדות:

- `user_id`
- `key`
- `name`
- `color`
- `sort_order`
- `is_default`

ברירת מחדל למשתמש חדש:

- נמוכה
- בינונית
- גבוהה
- דחופה

## API קיים

כל routes חוץ מ־auth דורשים Authorization header:

```text
Authorization: Bearer <token>
```

### Tasks

```text
GET    /api/dashboard
GET    /api/tasks
POST   /api/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/tasks/:id/complete
POST   /api/tasks/:id/duplicate
```

### Priorities

```text
GET    /api/priorities
POST   /api/priorities
PUT    /api/priorities/:id
DELETE /api/priorities/:id
```

### Categories

```text
GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id
```

### Projects / Subcategories

```text
GET    /api/projects
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id
```

### Customers

```text
GET    /api/customers
POST   /api/customers
PUT    /api/customers/:id
DELETE /api/customers/:id
```

### Contacts

```text
GET    /api/contacts
POST   /api/contacts
PUT    /api/contacts/:id
DELETE /api/contacts/:id
```

### Settings

```text
GET  /api/settings
POST /api/settings
POST /api/settings/backup
POST /api/settings/restore
POST /api/settings/export-csv
POST /api/settings/import-csv
```

## UI ולשוניות

הסיידבר כולל:

- לוח בקרה
- משימות
- לקוחות
- קטגוריות
- תתי קטגוריות
- אנשי קשר
- הגדרות

## מסך משימות

קיים:

- טבלת משימות.
- בחירת עמודות להצגה.
- חיפוש וסינון.
- סינון לפי קטגוריה, תת קטגוריה, דחיפות, סטטוס, תאריכים.
- מיון לפי דחיפות, תאריך יצירה, תאריך יעד, תת קטגוריה, קטגוריה.
- פעולות שורה: עריכה, מחיקה, סימון הושלם, שכפול.
- עריכה מהירה מתוך הטבלה לחלק מהשדות.
- הוספה מהירה: שורת "+" בראש הטבלה - שם + Enter יוצר משימה, הפוקוס נשאר להוספה רציפה. הוספה תחת פילטר פעיל יורשת קטגוריה/תת/דחיפות.
- שורות צבועות בעדינות לפי צבע הקטגוריה (`--cat-color`, class `cat-row`).
- ברירת מחדל של פילטר סטטוס: "פעילות (ללא הושלמו)" - ערך פסאודו `active` שממופה ל־`exclude_completed=1` ב־API.
- פילטרים נשמרים ב־localStorage תחת `taskflow_task_filters`.
- מוטציות של משימות מרעננות רק את `/api/tasks` (לא `loadAll`); מעבר לשונית מרענן הכול.
- יצירת משימה חדשה במודל.
- שדה חובה יחיד: שם משימה.
- כפתור שמירה עליון ותחתון במודל.

## דשבורד

הדשבורד מציג נתונים לפי בחירת המשתמש.

ווידג׳טים זמינים:

- משימות פתוחות
- משימות שהושלמו
- משימות באיחור
- משימות להיום
- לפי דחיפות
- לפי קטגוריה
- לפי תת קטגוריה
- פעילות אחרונה

בחירת הדשבורד נשמרת ב־`localStorage` תחת:

```text
taskflow_dashboard_widgets
```

## בחירת עמודות במשימות

בחירת עמודות נשמרת ב־`localStorage` תחת:

```text
taskflow_task_columns
```

## Cache / Service Worker

הייתה בעיה שבה הדפדפן המשיך לפתוח גרסה ישנה אחרי deploy עד `Ctrl+F5`.

תיקון שבוצע:

- `index.html` לא רושם Service Worker חדש.
- בטעינת העמוד הוא מנקה Service Workers קיימים ו־Cache Storage.
- `server.js` מחזיר `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` עבור HTML/JS/CSS/manifest/service-worker ו־SPA fallback.

חשוב: במחשב שכבר תקוע על Service Worker ישן ייתכן שנדרש `Ctrl+F5` פעם אחת אחרי deploy. אחר כך זה אמור להיפתר.

## Electron/Desktop

קבצים:

- `src/main/main.js`
- `src/main/preload.js`

ב־Electron ה־DB אמור להיווצר אוטומטית ב־user data directory. ב־Web/Render ה־DB נשמר תחת `TASKFLOW_DATA_DIR`.

## בדיקות

קובץ בדיקות: `js/tests.js`

הבדיקות כוללות כרגע:

- ולידציה בסיסית של משימה.
- רישום משתמשים.
- שגיאת username כפול עם `USERNAME_EXISTS`.
- CRUD בסיסי ללקוחות.
- בדיקת בידוד לקוחות בין משתמשים.

הרצה:

```powershell
npm run test
```

## כללי פיתוח חשובים

- כל טקסט UI צריך להיות ב־`src/frontend/i18n/he.js`.
- לשמור על RTL ועברית כברירת מחדל.
- לא להשתמש ב־Bootstrap או jQuery.
- לשמור על Vanilla JS.
- רצוי להמשיך בתבנית Repository/Service/Controller ב־backend.
- לכל טבלה עסקית חדשה להוסיף `user_id` מההתחלה.
- כל API עסקי צריך לעבור דרך `requireAuth`.
- אם מוסיפים קשר בין ישויות, עדיף לעשות זאת בסכמה ולא רק בצד client.
- לא להוסיף cache אגרסיבי לקבצי frontend עד שיש versioning מסודר.

## דברים שחשוב לזכור מהשיחות הקודמות

- המשתמש רוצה עברית מלאה ועיצוב נקי ובהיר.
- המערכת מיועדת כרגע למשתמשים פרטיים/לקוחות בודדים, אבל עם אפשרות עתידית להרחבה.
- הוחלט שזו תהיה Web/PWA עם DB מרכזי והתחברות פשוטה, כי יש שימוש גם בנייד וגם במחשב.
- קטגוריה היא הראשית; תת קטגוריה היא מה שנקרא בקוד `projects`.
- לקוחות כרגע נפרדים ממשימות; בהמשך כנראה נחבר ביניהם.
- המשתמש מעדיף פיתוח פרקטי ומהיר, אבל עם מבנה שמאפשר הרחבה.

## פיצ׳רים עתידיים מתוכננים/רעיוניים

- חיבור לקוחות למשימות (`customer_id` ב־tasks).
- Pipeline לקוחות מתקדם יותר.
- שלבי עסקה דינמיים לכל משתמש.
- דשבורד לקוחות.
- ייבוא/ייצוא Excel.
- התראות.
- תצוגת לוח שנה.
- משימות חוזרות.
- AI Assistant.
- WhatsApp Integration.
- Gmail Integration.
- Multi-user מתקדם יותר.
- Cloud synchronization אמיתי.
- הרשאות/roles אם יהיו כמה משתמשים באותו ארגון.

## מצב Git / הערות עבודה

לפני commit תמיד לבדוק:

```powershell
git status --short
git diff --stat
npm run test
```

במהלך העבודה היו לפעמים קבצים לא קשורים שהיו dirty, למשל:

- `package.json`
- `src/frontend/assets/icon.svg`
- `src/main/main.js`

לא להכניס קבצים כאלה ל־commit אם הם לא קשורים למשימה הנוכחית.

## Prompt מומלץ לשיחה חדשה

אפשר לפתוח שיחה חדשה כך:

```text
אני עובד על פרויקט TaskFlow. קרא את PROJECT_HANDOFF.md המצורף ותמשיך משם.
חשוב: עברית, RTL, Vanilla JS, Express, SQLite/sql.js, בלי Bootstrap ובלי jQuery.
לפני שינוי קוד תבדוק את המבנה הקיים ותשמור על הארכיטקטורה.
```