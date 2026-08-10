# אינטגרציות ואוטומציות ב-TaskFlow

## מה כבר קיים

TaskFlow כולל שכבת אינטגרציות דו-כיוונית:

- `integrations` שומר חיבורים של משתמשים לשירותים חיצוניים.
- `automation_rules` שומר חוקים שמופעלים בעקבות אירועים במערכת.
- `automation_logs` שומר הצלחות, שגיאות ונתונים שנשלחו.
- לכל משתמש אפשר ליצור כתובת Webhook נכנסת משלו.
- כל חיבור וכל כלל מבודדים לפי `user_id`.

ה-API המוגן:

```text
GET/POST/PUT/DELETE /api/integrations
POST                 /api/integrations/incoming-key
GET                  /api/integrations/google/authorize
GET                  /api/integrations/google/spreadsheets
GET/POST/PUT/DELETE  /api/automation-rules
GET                  /api/automation-logs
```

כתובת Webhook נכנסת היא החריג: היא מיועדת למערכות חיצוניות ולכן אינה דורשת התחברות בדפדפן. היא מאובטחת באמצעות מפתח ארוך וייחודי למשתמש.

## Make ו-Power Automate

### TaskFlow שולח החוצה

1. במערכת החיצונית יוצרים Flow/Scenario עם טריגר HTTP Webhook.
2. מעתיקים את כתובת ה-HTTPS שהשירות יצר.
3. ב-TaskFlow נכנסים להגדרות > אינטגרציות.
4. מוסיפים חיבור ובוחרים Make או Power Automate.
5. מדביקים את הכתובת ובוחרים כלל, למשל `task.completed`.
6. מפעילים את האוטומציה במערכת החיצונית ומבצעים בדיקה.

הבקשה שנשלחת:

```json
{
  "event": "task.completed",
  "data": {
    "id": 12,
    "name": "לחזור ללקוח",
    "priority": "high",
    "status": "completed",
    "due_date": "2026-08-12"
  }
}
```

ב-Make ממשיכים מה-Webhooks למודול הרצוי. ב-Power Automate משתמשים ב-`When an HTTP request is received`, ולאחר מכן מוסיפים Excel, Outlook, Teams, SharePoint או CRM.

### מערכת חיצונית יוצרת משימה

1. ב-TaskFlow לוחצים "כתובת לקבלת משימות".
2. מעתיקים את הכתובת שהתקבלה.
3. ב-Make מוסיפים מודול HTTP עם `POST`, או ב-Power Automate מוסיפים פעולה HTTP.
4. שולחים JSON עם לפחות `name`.

```json
{
  "name": "לחזור לליד חדש",
  "description": "הגיע מייל חדש",
  "category_id": 4,
  "priority": "high",
  "due_date": "2026-08-12"
}
```

בגרסה הנוכחית השדות `category_id`, `project_id`, `contact_id`, `priority` ו-`status` צריכים להכיל את הערכים שקיימים בחשבון המשתמש. אפשר להתחיל עם `name` בלבד, ולתת לברירות המחדל להשלים את השאר.

## Google Sheets

החיבור ל-Google נעשה באמצעות OAuth. המשתמש לוחץ "חיבור חשבון Google", מאשר הרשאות, ואז המערכת יכולה להציג את הגיליונות שלו.

### הגדרת Google Cloud

1. יוצרים פרויקט ב-Google Cloud Console.
2. מפעילים את Google Drive API ואת Google Sheets API.
3. מגדירים OAuth consent screen.
4. יוצרים OAuth Client מסוג Web application.
5. מוסיפים Authorized redirect URI:

```text
https://YOUR-DOMAIN/api/integrations/google/callback
```

6. מגדירים ב-Render את המשתנים:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
```

הסוד נשמר ב-Render ולא נכנס ל-Git.

## אירועים נתמכים

```text
task.created
task.updated
task.completed
customer.created
customer.closed
```

אפשר להוסיף תנאים פשוטים לכלל, לדוגמה:

```json
{
  "category_id": 4,
  "priority": "high"
}
```

כל התנאים צריכים להתאים כדי שהכלל יופעל.

## בדיקות לפני הפעלה אצל לקוח

- ליצור חיבור בדיקה ולא חיבור ייצור.
- להפעיל כלל אחד בלבד.
- ליצור משימת בדיקה ולבדוק את יומן האוטומציות.
- לוודא שהמערכת החיצונית קיבלה HTTP 2xx.
- לבדוק שהמפתח הנכנס אינו מופיע במסך רשימת האינטגרציות.
- לבדוק שמשתמש אחר אינו רואה את החיבור או את הלוגים.
- לאחר ההתקנה, להחליף את חיבור הבדיקה בחיבור אמיתי.

## הגדרות Render

`render.yaml` כולל את משתני Google כ-Secrets ללא ערכים. יש למלא אותם ב-Render Dashboard לפני הפעלת כפתור Google.

Make ו-Power Automate אינם דורשים משתני סביבה ב-TaskFlow בגרסה זו; המשתמש יוצר את ה-Webhook בשירות החיצוני ומדביק אותו במסך האינטגרציות.
