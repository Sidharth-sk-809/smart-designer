# Render Deployment Guide

## Backend Deployment Configuration

### Render.yaml (Already Created)
A `render.yaml` file has been created in the project root with all configurations.

### Step-by-Step Render Deployment

#### 1. **Connect GitHub Repository**
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the repository containing this project

#### 2. **Set These Deployment Fields:**

| Field | Value |
|-------|-------|
| **Name** | `smart-designer-backend` |
| **Environment** | `Python 3` |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r backend/requirements.txt && python manage.py collectstatic --no-input && python manage.py migrate` |
| **Start Command** | `gunicorn backend_config.wsgi:application --bind 0.0.0.0:$PORT` |
| **Instance Type** | `Free` (or `Starter` for better performance) |

#### 3. **Environment Variables**
Add these in Render Dashboard → Environment:

```
DEBUG=False
SECRET_KEY=(generate a secure key or let Render auto-generate)
ENVIRONMENT=production
```

#### 4. **After Deployment**
   - Update the `ALLOWED_HOSTS` in `backend/backend_config/settings.py`
   - Replace `smart-designer-backend.onrender.com` with your actual Render domain
   - Also update frontend CORS origins if frontend is on Render

### Key Files Created/Modified:

1. **render.yaml** - Complete deployment configuration
2. **requirements.txt** - Updated with `gunicorn` and `python-dotenv`
3. **.python-version** - Specifies Python 3.13
4. **settings.py** - Updated to support production environment variables

### Important Notes:

⚠️ **Database Warning:**
- Currently using SQLite (`db.sqlite3`)
- SQLite doesn't persist on Render (stateless platform)
- For production, use PostgreSQL:
  ```bash
  pip install psycopg2-binary
  ```
  Update `DATABASES` in settings.py to use PostgreSQL

⚠️ **Media Files:**
- For persistent uploads, use cloud storage like AWS S3 or Cloudinary
- Currently saving to local `/media` directory

### Render Instance Types:

| Type | Cost | Use Case |
|------|------|----------|
| **Free** | $0 | Development/Testing (spins down after 15 mins inactivity) |
| **Starter** | $7/month | Small production apps |
| **Standard** | $25/month | Medium apps with more resources |

### Once Deployed:

1. Your backend will be available at: `https://smart-designer-backend.onrender.com`
2. Update frontend API calls to use this URL
3. Frontend can be deployed separately to Render

### Troubleshooting:

- **502 Bad Gateway**: Check build logs in Render dashboard
- **Import errors**: Ensure all dependencies are in `requirements.txt`
- **Database errors**: Initialize with migrations in build command
- **CORS errors**: Update `CORS_ALLOWED_ORIGINS` with frontend URL
