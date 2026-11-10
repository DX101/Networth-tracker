const express = require('express');
const router = express.Router();
const fs = require('fs');
const { google } = require('googleapis');
const { Dropbox } = require('dropbox');
const { getDb, DB_PATH } = require('../db');

function getGoogleOAuthClient() {
  const db = getDb();
  const settings = db.prepare('SELECT gdrive_client_id, gdrive_client_secret, gdrive_refresh_token FROM settings WHERE id = 1').get();
  
  if (!settings.gdrive_client_id || !settings.gdrive_client_secret) {
    throw new Error('Google Drive Client ID and Secret are not configured in settings.');
  }

  const oauth2Client = new google.auth.OAuth2(
    settings.gdrive_client_id,
    settings.gdrive_client_secret,
    'http://127.0.0.1:3001/api/backup/callback/google'
  );

  if (settings.gdrive_refresh_token) {
    oauth2Client.setCredentials({ refresh_token: settings.gdrive_refresh_token });
  }
  return oauth2Client;
}

// Generate Auth URL
router.get('/auth/google', (req, res) => {
  try {
    const oauth2Client = getGoogleOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file']
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Callback
router.get('/callback/google', async (req, res) => {
  const { code } = req.query;
  try {
    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      const db = getDb();
      db.prepare('UPDATE settings SET gdrive_refresh_token = ? WHERE id = 1').run(tokens.refresh_token);
    }
    
    res.send('<html><body><h2>Google Drive connected successfully!</h2><p>You can close this window and return to the app.</p><script>setTimeout(()=>window.close(), 2000);</script></body></html>');
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Upload
router.post('/upload/google', async (req, res) => {
  try {
    const oauth2Client = getGoogleOAuthClient();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const fileMetadata = {
      name: `networth-backup-${new Date().toISOString().slice(0, 10)}.db`
    };
    const media = {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(DB_PATH)
    };
    
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });
    
    res.json({ success: true, fileId: file.data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dropbox endpoints
router.get('/auth/dropbox', (req, res) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT dropbox_client_id FROM settings WHERE id = 1').get();
    
    if (!settings.dropbox_client_id) {
      throw new Error('Dropbox Client ID is not configured.');
    }

    const dbx = new Dropbox({ clientId: settings.dropbox_client_id });
    const authUrl = dbx.auth.getAuthenticationUrl('http://127.0.0.1:3001/api/backup/callback/dropbox', null, 'code', 'offline', null, 'none', false);
    
    authUrl.then((url) => {
      res.json({ url });
    }).catch(err => {
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/callback/dropbox', async (req, res) => {
  const { code } = req.query;
  try {
    const db = getDb();
    const settings = db.prepare('SELECT dropbox_client_id, dropbox_client_secret FROM settings WHERE id = 1').get();
    const dbxAuth = new Dropbox({ clientId: settings.dropbox_client_id, clientSecret: settings.dropbox_client_secret }).auth;
    
    const response = await dbxAuth.getAccessTokenFromCode('http://127.0.0.1:3001/api/backup/callback/dropbox', code);
    const refresh_token = response.result.refresh_token;
    
    if (refresh_token) {
      db.prepare('UPDATE settings SET dropbox_refresh_token = ? WHERE id = 1').run(refresh_token);
    }
    
    res.send('<html><body><h2>Dropbox connected successfully!</h2><p>You can close this window and return to the app.</p><script>setTimeout(()=>window.close(), 2000);</script></body></html>');
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

router.post('/upload/dropbox', async (req, res) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT dropbox_client_id, dropbox_client_secret, dropbox_refresh_token FROM settings WHERE id = 1').get();
    
    if (!settings.dropbox_refresh_token) {
      throw new Error('Dropbox is not connected.');
    }

    const dbx = new Dropbox({ 
      clientId: settings.dropbox_client_id, 
      clientSecret: settings.dropbox_client_secret, 
      refreshToken: settings.dropbox_refresh_token 
    });
    
    const fileContent = fs.readFileSync(DB_PATH);
    const timestamp = new Date().toISOString().slice(0, 10);
    
    const response = await dbx.filesUpload({
      path: `/networth-backup-${timestamp}.db`,
      contents: fileContent,
      mode: 'add',
      autorename: true
    });
    
    res.json({ success: true, path: response.result.path_display });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect endpoints
router.post('/disconnect/google', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE settings SET gdrive_refresh_token = NULL WHERE id = 1').run();
  res.json({ success: true });
});

router.post('/disconnect/dropbox', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE settings SET dropbox_refresh_token = NULL WHERE id = 1').run();
  res.json({ success: true });
});

module.exports = router;
