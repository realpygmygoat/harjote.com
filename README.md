# Welcome to Harjote's portfolio website!

This is my personal portfolio website where I want to share my professional skills 
as a Computer Science major, and also share stuff about my life and what I like to do. 

## Motivation

I have wanted to build a website for myself for so long and have just been tethered down 
by big tech and their social media that I have not been able to identify ways to express myself. 

I have all this information overload around me that I get stuck in a decision paralysis (believe me, I don't have ADHD... yet)

## Features of my website

1. **Blog style entries:**

    I wanted a space on the internet where I could share my thoughts and interests outside of the conventional social media 
    and what better than to have your own webpage for it!

2. **Admin login and 2FA:**

   I have added an admin login that lets me customize my entries within the website rather than in my code base, 
   allowing me to push changes easier. 

   I also didnt want unnecessary traffic from bots and figured the best way to avoid getting hacked into would be to 
   have a 2FA authentication for my admin side. I also blocked exposure of the admin page through Tailscale VPS and Caddy. 

3. **Ripple and Sweep animations:**

   I wanted the website to be custom to my design and ideas and wanted to explore on what creativity I can showcase on my website. 
   I am in love with the ripple effect in the website as well as the sweep animation when you switch between pages. 

4. **Light/Dark Mode:**

   I wanted to have a light and dark mode for my website so there is that. 

5. **WebGL Interactive Compass**

   I added a compass that also switches between light and dark modes, and the needle points to where the cursor is on the webpage. 
   I saw some other portfolio websites where people had something interactive to showcase and wanted to have one of my own too. 


## Project layout

```
server/
  server.js       the HTTP server — routes, auth checks, security headers, wiring everything together
  db.js           SQLite schema + queries (node:sqlite, no npm package)
  auth.js         password hashing (scrypt), sessions, login rate limiting, pending-2FA state
  totp.js         TOTP/2FA implementation (RFC 6238) + recovery codes, built on Node's crypto only
  render.js       public-facing page templates (same design as before, output-escaped)
  create-admin.js command-line tool to create/reset the admin login
  backup.js       creates a safe snapshot of the database (see "Backing up" below)
  admin.css       styling for the admin panel
  public-admin.js admin panel's client-side JS (live preview, delete confirmation)
  views/admin.js  admin panel page templates (login, dashboard, editors, 2FA setup)
  lib/markdown.js frontmatter + Markdown parsing, output escaping, shared across the app
data/
  site.db         the SQLite database (created automatically, not in the zip)
  backups/        snapshots created by backup.js
styles.css         the site's visual design — same file as before
```

## Backing up

Run this any time, including while the server is running — it uses SQLite's
`VACUUM INTO`, which takes a consistent snapshot atomically, so there's no risk
of copying a half-written file mid-save (unlike a plain file copy):

```
node server/backup.js
```

Snapshots land in `data/backups/`, timestamped. The script keeps the 14 most
recent and deletes older ones automatically, so you can point a daily cron job
(Linux/Mac) or Task Scheduler entry (Windows) at this command and forget about it.

To restore: stop the server, copy the backup file you want over `data/site.db`,
then start the server again.
