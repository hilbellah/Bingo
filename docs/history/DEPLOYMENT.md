# Deployment Guide — Wolastoq Bingo

## Overview
This guide covers deploying the Bingo Ticketing System to **Render.com** for public access.

**Platform:** Render.com  
**App Type:** Node.js (Express) + React (SPA)  
**Database:** SQLite (persistent file storage)  
**Estimated Cost:** Free tier available

## Prerequisites

1. **GitHub Account** — Push code to GitHub (Render uses GitHub for deployments)
2. **Render.com Account** — Sign up at https://render.com (free)
3. **Environment Variables** — Prepare sensitive values:
   - `ADMIN_USERNAME` (e.g., `bingo_admin`)
   - `ADMIN_PASSWORD` (strong password for production)

## Step 1: Push Code to GitHub

If code is not yet on GitHub:

```bash
cd Wolastoq\ BINGO
git init
git add .
git commit -m "Initial Bingo system commit

Co-Authored-By: Paperclip <noreply@paperclip.ing>"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USER/wolastoq-bingo.git
git push -u origin main
```

If already on GitHub, ensure the latest code is pushed:
```bash
git add .
git commit -m "Deployment: Final production build

Co-Authored-By: Paperclip <noreply@paperclip.ing>"
git push
```

## Step 2: Create Render.com Web Service

1. **Sign in** to https://render.com
2. Click **New +** → **Web Service**
3. **Connect your GitHub repo** (authorize Render to access GitHub)
4. **Select Repository:** `wolastoq-bingo`
5. **Service Settings:**
   - **Name:** `wolastoq-bingo`
   - **Environment:** `Node`
   - **Build Command:**
     ```
     npm install && npm run build && cd server && npm install
     ```
   - **Start Command:**
     ```
     npm run start
     ```
   - **Plan:** Free (or Starter if you need guaranteed uptime)

6. **Environment Variables** — Add these in the Render dashboard:
   ```
   NODE_ENV = production
   PORT = 3000
   ADMIN_USERNAME = [SET TO STRONG VALUE]
   ADMIN_PASSWORD = [SET TO STRONG VALUE]
   DATABASE_URL = ./bingo.db
   SESSION_HOLD_MINUTES = 10
   ```

7. **Advanced** (optional):
   - **Auto-Deploy:** Leave unchecked for first deployment
   - **Health Check Path:** `/api/sessions`

8. **Create Web Service** — Click "Create Web Service"

Render will immediately start building and deploying. This takes 3-5 minutes.

## Step 3: Monitor Deployment

1. **View Logs** in Render Dashboard
2. Look for:
   ```
   npm notice
   npm notice You can uninstall Render's Tailwind CSS build.
   npm notice Then in your terminal:
   npm notice   npm uninstall tailwindcss autoprefixer postcss
   npm notice
   > server listening on port 3000
   ```
3. **Check Status** — When you see "server listening", deployment is complete

## Step 4: Verify Deployment

Once deployed, Render will provide a public URL (e.g., `https://bingo-jk2h.onrender.com`).

### Test Booking Flow
```
1. Visit https://bingo-jk2h.onrender.com
2. Select a session (date/time)
3. Choose party size
4. Enter attendee names
5. Select seats
6. Verify order summary
7. Submit mock payment
8. Confirm booking reference appears
```

### Test Admin Panel
```
1. Visit https://bingo-jk2h.onrender.com/admin
2. Login: admin / [PASSWORD YOU SET]
3. Check dashboard (today's bookings, revenue)
4. View booking report
5. Try cancelling a booking (seats should return to available)
```

### Test Real-Time Seat Locking (with multiple users)
```
1. Open booking page in 2 browser windows
2. In Window A: Select a seat
3. In Window B: Verify that seat appears as "held/yellow" in real-time
4. Wait 10 minutes → seat should release back to green (or reload to see)
```

## Step 5: Provide Client with URL & Credentials

**Deliver to Client:**
```
Booking Page: https://bingo-jk2h.onrender.com
Admin Panel: https://bingo-jk2h.onrender.com/admin

Admin Credentials:
  Username: [YOUR_ADMIN_USERNAME]
  Password: [YOUR_ADMIN_PASSWORD]

Session Hold Time: 10 minutes (automatically releases if not completed)
```

## Step 6: Monitor for Issues

### Common Issues & Fixes

**Issue: "Cannot GET /" or blank page**
- **Cause:** React build may not have completed
- **Fix:** Check Render logs. If build failed, debug and redeploy

**Issue: Admin login fails**
- **Cause:** Environment variables not set or wrong values
- **Fix:** Check Render dashboard → Environment variables are correct

**Issue: Seats don't lock in real-time**
- **Cause:** WebSocket connection issue (CORS or proxy)
- **Fix:** Check browser console for errors. Verify Socket.io connection to `wss://` (secure WebSocket)

**Issue: Database errors after restart**
- **Cause:** SQLite file lost (Render disk space issues)
- **Fix:** Seed new data and re-deploy

### Ongoing Monitoring
1. Check Render logs periodically for errors
2. Verify bookings are being recorded (check admin panel)
3. Test booking flow weekly (multiple browsers)

## Database Persistence Note

Render's free tier provides **100 MB disk space** and files persist across restarts (as long as service is not deleted). The SQLite database file (`bingo.db`) will survive normal restarts.

If you need **guaranteed persistence** across deployments, upgrade to a paid plan or migrate to PostgreSQL.

## Rollback / Updates

**To deploy a new version:**
```bash
git add .
git commit -m "Update: [describe changes]

Co-Authored-By: Paperclip <noreply@paperclip.ing>"
git push
```

Render auto-detects the push (if auto-deploy is enabled) and redeploys automatically.

**To rollback:**
- Go to Render Dashboard → Deployments
- Click the previous successful deployment
- Click "Redeploy"

## Support & Troubleshooting

- **Render Status:** https://render.com/status
- **Render Docs:** https://render.com/docs
- **Socket.io Issues:** https://socket.io/docs/v4/
- **React Issues:** Check browser console (F12)

---

**Deployment Complete!** Client can now access the live Bingo system.

For questions, contact the development team.
