# פריסת TaskFlow ב־Contabo דרך Dokploy

המסמך מתאר פריסה מבודדת של TaskFlow. אין לעצור, למחוק או לערוך שירותים קיימים בשרת.

## עקרונות בידוד

- ליצור Application חדשה בשם `taskflow` בתוך Dokploy.
- להשתמש בדומיין חדש, למשל `taskflow.flowsbiz.com`.
- ליצור Volume חדש ובלעדי למסד הנתונים.
- לא להשתמש ב־Volumes, Networks או Services של אפליקציות אחרות.
- לא להריץ `docker system prune`, `docker stack rm` או מחיקה של שירותים קיימים.
- Traefik הקיים יטפל ב־HTTP/HTTPS; אין להפעיל Nginx נוסף.

## הגדרות Application

מקור הקוד: GitHub repository של TaskFlow.

Build method: `Dockerfile`.

Port פנימי של הקונטיינר: `3012`.

Health check:

```text
/health
```

## Volume

יש ליצור Volume חדש עבור TaskFlow בלבד ולחבר אותו אל:

```text
/var/lib/taskflow/data
```

הקובץ שייווצר שם הוא:

```text
/var/lib/taskflow/data/taskflow.sqlite
```

אין לשמור את מסד הנתונים בתוך הקונטיינר בלבד.

## משתני סביבה

```text
NODE_ENV=production
PORT=3012
HOST=0.0.0.0
TASKFLOW_DATA_DIR=/var/lib/taskflow/data
TASKFLOW_INITIAL_PASSWORD=<רק אם נדרש בהתקנה ראשונית>
GOOGLE_CLIENT_ID=<Secret>
GOOGLE_CLIENT_SECRET=<Secret>
GOOGLE_REDIRECT_URI=https://taskflow.flowsbiz.com/api/integrations/google/callback
```

אין לשמור את הערכים בתוך GitHub או במסמך זה. יש להזין אותם בשדות Environment של Dokploy.

## סדר מעבר הנתונים

1. להפעיל קודם את TaskFlow עם Volume ריק בסביבה זמנית או בדומיין בדיקה.
2. לבדוק שהקונטיינר עולה ו־`/health` מחזיר תקין.
3. לעצור זמנית את הכתיבה ב־Render בזמן יצירת גיבוי.
4. להעתיק את `taskflow.sqlite` של Render אל ה־Volume החדש.
5. להפעיל מחדש את TaskFlow ולבדוק משתמשים, משימות, לקוחות ואינטגרציות.
6. רק לאחר בדיקה מלאה לעדכן DNS ב־Cloudflare.

## Google OAuth

ב־Google Cloud צריך להוסיף את כתובת ה־Redirect URI החדשה:

```text
https://taskflow.flowsbiz.com/api/integrations/google/callback
```

מומלץ להשאיר את כתובת Render הישנה בזמן הבדיקה, ולהסיר אותה רק לאחר שהמעבר הושלם.

## בדיקות לפני מעבר DNS

- `/health` מחזיר HTTP 200.
- מסך התחברות עולה.
- משתמש קיים יכול להתחבר.
- משימות ולקוחות קיימים מופיעים.
- יצירת משימה חדשה נשמרת לאחר Restart של הקונטיינר.
- Google OAuth חוזר לכתובת החדשה.
- Make ו־Power Automate מקבלים אירועים.
- גיבוי של קובץ SQLite נוצר מחוץ ל־Volume הראשי.

## פעולות שאסור לבצע

- לא לשנות את `dokploy` או `dokploy-postgres`.
- לא לשנות את `dokploy-traefik`.
- לא למחוק שירותים קיימים.
- לא להפעיל את TaskFlow על פורט `80`, `443` או `3000`.
- לא להעתיק את מסד הנתונים ל־GitHub.
