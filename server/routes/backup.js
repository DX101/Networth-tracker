const express = require('express');
const router = express.Router();
const fs = require('fs');
const { google } = require('googleapis');
const { Dropbox } = require('dropbox');
const jwt = require('jsonwebtoken');
const { getDb, DB_PATH } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

function resolveUserId(req) {
  if (req?.user?.id) return req.user.id;
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded && decoded.id) return decoded.id;
    } catch (e) {}
  }
  return null;
}

function getGoogleOAuthClient(reqOrUserId) {
  const db = getDb();
  const userId = typeof reqOrUserId === 'object' ? resolveUserId(reqOrUserId) : reqOrUserId;
  
  let settings = null;
  if (userId) {
    settings = db.prepare('SELECT gdrive_client_id, gdrive_client_secret, gdrive_refresh_token FROM settings WHERE user_id = ?').get(userId);
  }
  if (!settings || !settings.gdrive_client_id) {
    settings = db.prepare("SELECT gdrive_client_id, gdrive_client_secret, gdrive_refresh_token FROM settings WHERE gdrive_client_id IS NOT NULL AND gdrive_client_id != '' ORDER BY id DESC LIMIT 1").get();
  }
  
  if (!settings || !settings.gdrive_client_id || !settings.gdrive_client_secret) {
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
    const oauth2Client = getGoogleOAuthClient(req);
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
      db.prepare("UPDATE settings SET gdrive_refresh_token = ? WHERE gdrive_client_id IS NOT NULL AND gdrive_client_id != ''").run(tokens.refresh_token);
    }
    
    res.send('<html><body><h2>Google Drive connected successfully!</h2><p>You can close this window and return to the app.</p><script>setTimeout(()=>window.close(), 2000);</script></body></html>');
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Upload
router.post('/upload/google', async (req, res) => {
  try {
    const oauth2Client = getGoogleOAuthClient(req);
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

// Restore from Google Drive
router.post('/restore/google', async (req, res) => {
  try {
    const oauth2Client = getGoogleOAuthClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const listRes = await drive.files.list({
      q: "name contains 'networth-backup-' and trashed = false",
      orderBy: 'createdTime desc',
      pageSize: 10,
      fields: 'files(id, name, createdTime, size)'
    });

    const files = listRes.data.files;
    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'No backups found in Google Drive.' });
    }

    const targetFile = req.body && req.body.fileId ? files.find(f => f.id === req.body.fileId) : files[0];
    if (!targetFile) {
      return res.status(404).json({ error: 'Specified backup file not found.' });
    }

    const destPath = DB_PATH + '.restore_temp';
    const dest = fs.createWriteStream(destPath);
    const driveRes = await drive.files.get(
      { fileId: targetFile.id, alt: 'media' },
      { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
      driveRes.data
        .pipe(dest)
        .on('finish', resolve)
        .on('error', reject);
    });

    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, DB_PATH + '.pre_restore_bak');
    }

    fs.copyFileSync(destPath, DB_PATH);
    fs.unlinkSync(destPath);

    res.json({ success: true, restoredFile: targetFile.name, createdTime: targetFile.createdTime });
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
    const userId = resolveUserId(req);
    let settings = null;
    if (userId) {
      settings = db.prepare('SELECT dropbox_client_id, dropbox_client_secret, dropbox_refresh_token FROM settings WHERE user_id = ?').get(userId);
    }
    if (!settings || !settings.dropbox_refresh_token) {
      settings = db.prepare("SELECT dropbox_client_id, dropbox_client_secret, dropbox_refresh_token FROM settings WHERE dropbox_refresh_token IS NOT NULL ORDER BY id DESC LIMIT 1").get();
    }
    
    if (!settings || !settings.dropbox_refresh_token) {
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

// Restore from Dropbox
router.post('/restore/dropbox', async (req, res) => {
  try {
    const db = getDb();
    const userId = resolveUserId(req);
    let settings = null;
    if (userId) {
      settings = db.prepare('SELECT dropbox_client_id, dropbox_client_secret, dropbox_refresh_token FROM settings WHERE user_id = ?').get(userId);
    }
    if (!settings || !settings.dropbox_refresh_token) {
      settings = db.prepare("SELECT dropbox_client_id, dropbox_client_secret, dropbox_refresh_token FROM settings WHERE dropbox_refresh_token IS NOT NULL ORDER BY id DESC LIMIT 1").get();
    }
    
    if (!settings || !settings.dropbox_refresh_token) {
      throw new Error('Dropbox is not connected.');
    }

    const dbx = new Dropbox({ 
      clientId: settings.dropbox_client_id, 
      clientSecret: settings.dropbox_client_secret, 
      refreshToken: settings.dropbox_refresh_token 
    });

    const listRes = await dbx.filesListFolder({ path: '' });
    const backupFiles = listRes.result.entries
      .filter(f => f['.tag'] === 'file' && f.name.startsWith('networth-backup-') && f.name.endsWith('.db'))
      .sort((a, b) => new Date(b.client_modified) - new Date(a.client_modified));

    if (backupFiles.length === 0) {
      return res.status(404).json({ error: 'No backup files found in Dropbox.' });
    }

    const targetFile = backupFiles[0];
    const downloadRes = await dbx.filesDownload({ path: targetFile.path_display });
    const fileBinary = downloadRes.result.fileBinary;

    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, DB_PATH + '.pre_restore_bak');
    }

    fs.writeFileSync(DB_PATH, fileBinary);

    res.json({ success: true, restoredFile: targetFile.name, modified: targetFile.client_modified });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect endpoints
router.post('/disconnect/google', (req, res) => {
  const db = getDb();
  const userId = resolveUserId(req);
  if (userId) {
    db.prepare('UPDATE settings SET gdrive_refresh_token = NULL WHERE user_id = ?').run(userId);
  } else {
    db.prepare("UPDATE settings SET gdrive_refresh_token = NULL WHERE gdrive_client_id IS NOT NULL").run();
  }
  res.json({ success: true });
});

router.post('/disconnect/dropbox', (req, res) => {
  const db = getDb();
  const userId = resolveUserId(req);
  if (userId) {
    db.prepare('UPDATE settings SET dropbox_refresh_token = NULL WHERE user_id = ?').run(userId);
  } else {
    db.prepare("UPDATE settings SET dropbox_refresh_token = NULL WHERE dropbox_client_id IS NOT NULL").run();
  }
  res.json({ success: true });
});

// Export all tenant financial data as JSON
router.get('/export-json', (req, res) => {
  try {
    const db = getDb();
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const data = {
      assets: db.prepare('SELECT * FROM assets WHERE user_id = ?').all(userId),
      liabilities: db.prepare('SELECT * FROM liabilities WHERE user_id = ?').all(userId),
      investments: db.prepare('SELECT * FROM investments WHERE user_id = ?').all(userId),
      cashflow: db.prepare('SELECT * FROM cashflow WHERE user_id = ?').all(userId),
      snapshots: db.prepare('SELECT * FROM snapshots WHERE user_id = ?').all(userId),
      budgets: db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId),
      budget_expenses: db.prepare('SELECT * FROM budget_expenses WHERE user_id = ?').all(userId),
      goals: db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId),
      goal_contributions: db.prepare('SELECT * FROM goal_contributions WHERE user_id = ?').all(userId),
      subscriptions: db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(userId),
      insurance: db.prepare('SELECT * FROM insurance WHERE user_id = ?').all(userId),
      settings: db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId)
    };
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import tenant financial data from JSON
router.post('/import-json', (req, res) => {
  try {
    const db = getDb();
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data, overwrite } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing data payload' });

    db.transaction(() => {
      if (overwrite) {
        db.prepare('DELETE FROM assets WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM liabilities WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM investments WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM cashflow WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM snapshots WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM budgets WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM budget_expenses WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM goals WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM goal_contributions WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM insurance WHERE user_id = ?').run(userId);
      }

      const insertRows = (tableName, rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        for (const row of rows) {
          const rowCopy = { ...row, user_id: userId };
          delete rowCopy.id;
          const cols = Object.keys(rowCopy);
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`;
          try {
            db.prepare(sql).run(...cols.map(c => rowCopy[c]));
          } catch (e) {
            console.error(`Error inserting into ${tableName}:`, e.message);
          }
        }
      };

      insertRows('assets', data.assets);
      insertRows('liabilities', data.liabilities);
      insertRows('investments', data.investments);
      insertRows('cashflow', data.cashflow);
      insertRows('snapshots', data.snapshots);
      insertRows('budgets', data.budgets);
      insertRows('budget_expenses', data.budget_expenses);
      insertRows('goals', data.goals);
      insertRows('goal_contributions', data.goal_contributions);
      insertRows('subscriptions', data.subscriptions);
      insertRows('insurance', data.insurance);

      if (data.settings) {
        const s = data.settings;
        try {
          db.prepare(`
            UPDATE settings SET
              currency = COALESCE(?, currency),
              currency_symbol = COALESCE(?, currency_symbol),
              date_format = COALESCE(?, date_format),
              app_name = COALESCE(?, app_name),
              dashboard_layout = COALESCE(?, dashboard_layout),
              exchange_rates = COALESCE(?, exchange_rates),
              gdrive_client_id = COALESCE(?, gdrive_client_id),
              gdrive_client_secret = COALESCE(?, gdrive_client_secret),
              gdrive_refresh_token = COALESCE(?, gdrive_refresh_token)
            WHERE user_id = ?
          `).run(
            s.currency, s.currency_symbol, s.date_format, s.app_name,
            s.dashboard_layout, s.exchange_rates,
            s.gdrive_client_id, s.gdrive_client_secret, s.gdrive_refresh_token,
            userId
          );
        } catch (e) {}
      }
    })();

    res.json({ success: true, message: 'Data imported successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
