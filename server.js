require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 11434;

// Session middleware - MUST come first
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    maxAge: 30 * 60 * 1000, // 30 minutes instead of 7 days
    httpOnly: true
  },
  genid: function(req) {
    return require('crypto').randomBytes(16).toString('hex');
  }
}));

// --- Discord OAuth ---
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${BASE_URL}/auth/discord/callback`;

// Admin Discord usernames (case-insensitive, any format)
const ADMIN_USERNAMES = ['draxyog.', 'zs.jarko'];

function isAdmin(discordUser) {
  if (!discordUser) return false;
  const name = (discordUser.username || discordUser.global_name || '').toLowerCase().replace(/\s/g, '');
  const adminSet = new Set(ADMIN_USERNAMES.map(u => u.toLowerCase().replace(/\s/g, '')));
  return adminSet.has(name);
}

app.get('/auth/discord/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/?error=discord_denied');
  if (!code) return res.redirect('/?error=no_code');
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) return res.redirect('/?error=discord_not_configured');

  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const user = userRes.data;
    req.session.discordUser = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar
    };
    req.session.isAdmin = isAdmin(user);
    
    // Send login notification to Discord bot
    const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';
    axios.post(`${BOT_API_URL}/api/login`, {
      discordId: user.id,
      username: user.username,
      globalName: user.global_name,
      avatar: user.avatar,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Bot login notify error:', err.message));
    
    return res.redirect(req.session.returnTo || '/');
  } catch (e) {
    console.error('Discord OAuth error', e.response?.data || e.message);
    return res.redirect('/?error=discord_failed');
  }
});

// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Status storage (JSON file)
const STATUS_FILE = path.join(__dirname, 'data', 'status.json');
function ensureDataDir() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readStatus() {
  ensureDataDir();
  if (!fs.existsSync(STATUS_FILE)) {
    const defaultStatus = [
      { id: 'api', name: 'API', status: 'operational' },
      { id: 'delivery', name: 'Delivery', status: 'operational' },
      { id: 'discord', name: 'Discord Support', status: 'operational' }
    ];
    fs.writeFileSync(STATUS_FILE, JSON.stringify(defaultStatus, null, 2));
    return defaultStatus;
  }
  return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
}
function writeStatus(data) {
  ensureDataDir();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
}

// Key storage (JSON file)
const KEYS_FILE = path.join(__dirname, 'data', 'keys.json');
function readKeys() {
  ensureDataDir();
  if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
}
function writeKeys(data) {
  ensureDataDir();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

// Purchases storage (JSON file)
const PURCHASES_FILE = path.join(__dirname, 'data', 'purchases.json');
function readPurchases() {
  ensureDataDir();
  if (!fs.existsSync(PURCHASES_FILE)) {
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(PURCHASES_FILE, 'utf8'));
}
function writePurchases(data) {
  ensureDataDir();
  fs.writeFileSync(PURCHASES_FILE, JSON.stringify(data, null, 2));
}

// Orders storage (JSON file)
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
function readOrders() {
  ensureDataDir();
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}
function writeOrders(data) {
  ensureDataDir();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}

// Messages storage (JSON file)
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
function readMessages() {
  ensureDataDir();
  if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
}
function writeMessages(data) {
  ensureDataDir();
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));
}

// Downloads storage (JSON file)
const DOWNLOADS_FILE = path.join(__dirname, 'data', 'downloads.json');
function readDownloads() {
  ensureDataDir();
  if (!fs.existsSync(DOWNLOADS_FILE)) {
    fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(DOWNLOADS_FILE, 'utf8'));
}
function writeDownloads(data) {
  ensureDataDir();
  fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify(data, null, 2));
}

function getNextOrderNumber() {
  const orders = readOrders();
  return orders.length + 1;
}

// -- simple coupon definitions (in a real site these would be stored in DB)
const COUPONS = {
  'TEST10': { type: 'percent', amount: 10 },
  'FIVEOFF': { type: 'amount', amount: 5 }
};

// confirm stripe session after redirection
app.get('/api/confirm-session', requireLogin, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId || !stripe) return res.json({ ok: false });
  try {
    // mark order in orders.json as paid
    const orders = readOrders();
    const ord = orders.find(o => o.stripeSessionId === sessionId);
    if (ord) {
      ord.status = 'paid';
      writeOrders(orders);
      // send webhook notification similar to non-stripe path
      if (WEBHOOK_URL) {
        const payload = {
          content: '<@1453092257489092641>',
          embeds: [{
            title: 'New Purchase (Stripe)',
            color: 0x3b82f6,
            fields: [
              { name: 'Discord (buyer)', value: ord.discordUsername || 'N/A', inline: true },
              { name: 'Email', value: ord.email || 'N/A', inline: true },
              { name: 'Language', value: ord.language || 'N/A', inline: true },
              { name: 'Total', value: ord.total != null ? `$${Number(ord.total).toFixed(2)}` : 'N/A', inline: true },
              { name: 'Items', value: ord.items && ord.items.length ? ord.items.map(i => `${i.name || i.id} x${i.quantity || 1}`).join('\n') : 'No items', inline: false },
              ...(ord.coupon ? [{ name: 'Coupon', value: ord.coupon, inline: true }] : [])
            ],
            footer: { text: `Discord ID: ${req.session.discordUser?.id || 'N/A'}` },
            timestamp: new Date().toISOString()
          }]
        };
        axios.post(WEBHOOK_URL, payload).catch(err => console.error('Webhook error', err.response?.data || err.message));
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('confirm-session error', e);
    res.json({ ok: false });
  }
});

function validateCoupon(code) {
  if (!code || typeof code !== 'string') return null;
  return COUPONS[code.toUpperCase()] || null;
}

function calculateOrderTotal(items, coupon) {
  if (!Array.isArray(items)) return 0;
  let total = items.reduce((sum, i) => {
    const price = Number(i.price) || 0;
    const qty = Number(i.quantity) || 1;
    return sum + price * qty;
  }, 0);
  if (coupon) {
    if (coupon.type === 'percent') {
      total = total * (100 - coupon.amount) / 100;
    } else if (coupon.type === 'amount') {
      total = Math.max(0, total - coupon.amount);
    }
  }
  return total;
}

app.get('/auth/discord', (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    return res.redirect('/?error=discord_not_configured');
  }
  const scope = 'identify';
  const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
  res.redirect(url);
});


app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Current user (for frontend)
app.get('/api/me', (req, res) => {
  if (!req.session.discordUser) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    user: req.session.discordUser,
    isAdmin: !!req.session.isAdmin
  });
});

// Require login middleware (optional use)
function requireLogin(req, res, next) {
  if (!req.session.discordUser) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Login required' });
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/discord');
  }
  next();
}

// API-specific login middleware
function requireApiLogin(req, res, next) {
  if (!req.session.discordUser) {
    return res.status(401).json({ error: 'Login required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.discordUser || !req.session.isAdmin) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Admin required' });
    }
    return res.redirect('/');
  }
  next();
}

// Stripe config storage (JSON file)
const STRIPE_CONFIG_FILE = path.join(__dirname, 'data', 'stripe-config.json');
function readStripeConfig() {
  ensureDataDir();
  if (!fs.existsSync(STRIPE_CONFIG_FILE)) {
    return {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
    };
  }
  return JSON.parse(fs.readFileSync(STRIPE_CONFIG_FILE, 'utf8'));
}
function writeStripeConfig(config) {
  ensureDataDir();
  fs.writeFileSync(STRIPE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Initialize Stripe from config
let stripe = null;
let stripeConfig = readStripeConfig();
function initStripe() {
  stripeConfig = readStripeConfig();
  if (stripeConfig.secretKey) {
    const Stripe = require('stripe');
    stripe = Stripe(stripeConfig.secretKey);
  } else {
    stripe = null;
  }
}
initStripe();

// --- Stripe Configuration (admin) ---
app.get('/api/stripe-config', requireLogin, requireAdmin, (req, res) => {
  const config = readStripeConfig();
  res.json({
    publishableKey: config.publishableKey || null,
    hasSecretKey: !!config.secretKey,
    hasWebhookSecret: !!config.webhookSecret
  });
});

app.post('/api/stripe-config', requireLogin, requireAdmin, async (req, res) => {
  const { publishableKey, secretKey, webhookSecret } = req.body;
  const currentConfig = readStripeConfig();
  
  try {
    // Validate the keys by attempting to initialize Stripe
    if (secretKey && secretKey !== '•••••••••••••••••••••••••••••••••') {
      const Stripe = require('stripe');
      const testStripe = Stripe(secretKey);
      await testStripe.balance.retrieve();
    }
    
    // Update config
    const newConfig = {
      publishableKey: (publishableKey && publishableKey !== '•••••••••••••••••••••••••••••••••') ? publishableKey : currentConfig.publishableKey,
      secretKey: (secretKey && secretKey !== '•••••••••••••••••••••••••••••••••') ? secretKey : currentConfig.secretKey,
      webhookSecret: (webhookSecret && webhookSecret !== '•••••••••••••••••••••••••••••••••') ? webhookSecret : currentConfig.webhookSecret
    };
    
    writeStripeConfig(newConfig);
    
    // Reinitialize Stripe with new keys
    initStripe();
    
    res.json({ success: true, message: 'Stripe configuration saved!' });
  } catch (error) {
    console.error('Stripe config error:', error);
    res.status(400).json({ error: 'Invalid Stripe keys. Please check your API keys.' });
  }
});

// --- Status (public read) ---
app.get('/api/status', (req, res) => {
  res.json(readStatus());
});

// --- Keys (admin) ---
app.get('/api/keys', requireLogin, requireAdmin, (req, res) => {
  res.json(readKeys());
});

// --- Keys (user-owned) ---
app.get('/api/mykeys', requireLogin, (req, res) => {
  const user = req.session.discordUser;
  const keys = readKeys().filter(k => k.owner === user?.id);
  res.json(keys);
});

app.post('/api/keys', requireLogin, requireAdmin, (req, res) => {
  const { key, status } = req.body;
  if (!key || !status) {
    return res.status(400).json({ error: 'Invalid key or status' });
  }
  const keys = readKeys();
  keys.push({ key, status });
  writeKeys(keys);
  res.json({ key, status });
});

app.put('/api/keys/:key', requireLogin, requireAdmin, (req, res) => {
  const { key } = req.params;
  const { status } = req.body;
  if (!['active', 'deactivated', 'used'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const keys = readKeys();
  const keyToUpdate = keys.find(k => k.key === key);
  if (!keyToUpdate) {
    return res.status(404).json({ error: 'Key not found' });
  }
  keyToUpdate.status = status;
  writeKeys(keys);
  res.json(keyToUpdate);
});

app.delete('/api/keys', requireLogin, requireAdmin, (req, res) => {
  writeKeys([]);
  res.json({ success: true });
});

app.get('/api/my-keys', requireLogin, (req, res) => {
  const purchases = readPurchases();
  const userPurchases = purchases.filter(p => p.userId === req.session.discordUser.id);
  res.json(userPurchases);
});

app.get('/api/stock', (req, res) => {
  const keys = readKeys();
  const stock = keys.filter(k => k.status === 'active').length;
  res.json({ stock });
});

app.delete('/api/keys/:key', requireLogin, requireAdmin, (req, res) => {
  const { key } = req.params;
  let keys = readKeys();
  keys = keys.filter(k => k.key !== key);
  writeKeys(keys);
  res.json({ success: true });
});

// --- Status (admin write) ---
app.put('/api/status', requireLogin, requireAdmin, (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: 'Expected array' });
  const valid = body.every(
    item => item && typeof item.id === 'string' && typeof item.name === 'string' && ['operational', 'degraded', 'outage'].includes(item.status)
  );
  if (!valid) return res.status(400).json({ error: 'Invalid items: id, name, status (operational|degraded|outage)' });
  writeStatus(body);
  res.json(readStatus());
});

// --- Checkout: send Discord webhook ---
const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// create checkout session endpoint
app.post('/api/create-session', requireLogin, async (req, res) => {
  if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });
  const { items, email, language, coupon: couponCode } = req.body || {};
  const user = req.session.discordUser;
  try {
    const coupon = validateCoupon(couponCode);
    let line_items = (Array.isArray(items) ? items : []).map(i => ({
      price_data: {
        currency: 'usd',
        product_data: { name: i.name || i.id },
        unit_amount: Math.round((Number(i.price) || 0) * 100)
      },
      quantity: i.quantity || 1
    }));

    // calculate total for record
    const computedTotal = calculateOrderTotal(items, coupon);

    // apply coupon by recalculating total and compressing into one line item for stripe
    if (coupon) {
      line_items = [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Order total (after coupon)' },
          unit_amount: Math.round(computedTotal * 100)
        },
        quantity: 1
      }];
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      customer_email: email || undefined,
      success_url: `${BASE_URL}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?canceled=1`
    });

    // persist pending order
    try {
      const orders = readOrders();
      orders.push({
        orderNumber: getNextOrderNumber(),
        userId: user?.id,
        discordUsername: user?.global_name || user?.username || 'N/A',
        email: email || null,
        language: language || null,
        items: Array.isArray(items) ? items : [],
        total: computedTotal,
        coupon: couponCode || null,
        stripeSessionId: session.id,
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      writeOrders(orders);
    } catch (e) {
      console.error('Failed to write pending order:', e);
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// coupon lookup
app.get('/api/coupon', (req, res) => {
  const code = req.query.code;
  const c = validateCoupon(code);
  if (!c) return res.json({ valid: false });
  res.json({ valid: true, coupon: c });
});

// Test endpoint for API authentication (no middleware for testing)
app.get('/api/test-auth', (req, res) => {
  const user = req.session.discordUser;
  res.json({ 
    success: true, 
    user: user?.username,
    hasSession: !!req.session,
    sessionData: req.session
  });
});

app.delete('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;
  const user = req.session.discordUser;
  
  console.log('Cancel order request:', { orderId, userId: user?.id, userLoggedIn: !!user });
  
  try {
    // Check if user is logged in
    if (!user) {
      console.log('User not logged in');
      return res.status(401).json({ error: 'Not logged in' });
    }
    
    const orders = readOrders();
    console.log('All orders:', orders.map(o => ({ 
      id: o.id, 
      orderNumber: o.orderNumber, 
      userId: o.userId, 
      status: o.status 
    })));
    
    const orderIndex = orders.findIndex(o => {
      const orderNumMatch = o.orderNumber === parseInt(orderId);
      const userMatch = o.userId === user.id;
      const match = orderNumMatch && userMatch;
      console.log('Checking order:', { 
        orderNumber: o.orderNumber, 
        orderId: parseInt(orderId), 
        orderNumMatch: orderNumMatch,
        userId: o.userId, 
        searchUserId: user.id, 
        userMatch: userMatch,
        match: match 
      });
      return match;
    });
    
    console.log('Order search result:', { 
      orderId, 
      userId: user?.id, 
      orderIndex, 
      totalOrders: orders.length 
    });
    
    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orders[orderIndex];
    
    // Only allow canceling pending orders
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot cancel completed order' });
    }
    
    // Remove the order
    orders.splice(orderIndex, 1);
    writeOrders(orders);
    
    console.log('Order canceled successfully');
    res.json({ success: true, message: 'Order canceled' });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// --- Orders (user) ---
app.get('/api/orders', requireApiLogin, (req, res) => {
  const user = req.session.discordUser;
  const orders = readOrders().filter(o => o.userId === user?.id);
  res.json(orders);
});

// --- Contact Form Submission ---
app.post('/api/contact', async (req, res) => {
  const { name, discord, subject, message } = req.body || {};
  
  if (!name || !discord || !subject || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Save to messages if user is logged in
  const user = req.session.discordUser;
  if (user) {
    const messages = readMessages();
    messages.push({
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      discord,
      subject,
      message,
      status: 'sent',
      date: new Date().toISOString()
    });
    writeMessages(messages);
  }
  
  // Forward to Discord bot
  const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';
  try {
    await axios.post(`${BOT_API_URL}/api/contact`, {
      name,
      discord,
      subject,
      message,
      userId: user?.id,
      username: user?.username
    });
  } catch (err) {
    console.error('Bot contact notify error:', err.message);
  }
  
  res.json({ success: true });
});

// --- Messages (user) ---
app.get('/api/my-messages', requireApiLogin, (req, res) => {
  const user = req.session.discordUser;
  const messages = readMessages().filter(m => m.userId === user?.id);
  res.json(messages);
});

app.get('/api/my-messages/:id', requireApiLogin, (req, res) => {
  const user = req.session.discordUser;
  const message = readMessages().find(m => m.id === req.params.id && m.userId === user?.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  res.json(message);
});

// Admin: Reply to a message
app.post('/api/admin/messages/:id/reply', requireApiLogin, (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const { reply } = req.body || {};
  if (!reply || !reply.trim()) {
    return res.status(400).json({ error: 'Reply message is required' });
  }
  
  const messages = readMessages();
  const messageIndex = messages.findIndex(m => m.id === req.params.id);
  
  if (messageIndex === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }
  
  // Initialize replies array if it doesn't exist
  if (!messages[messageIndex].replies) {
    messages[messageIndex].replies = [];
  }
  
  // Add the reply
  messages[messageIndex].replies.push({
    id: crypto.randomUUID(),
    content: reply.trim(),
    from: 'admin',
    adminName: req.session.discordUser?.username || 'Admin',
    date: new Date().toISOString()
  });
  
  // Update message status to answered
  messages[messageIndex].status = 'answered';
  messages[messageIndex].answeredAt = new Date().toISOString();
  
  writeMessages(messages);
  
  res.json({ success: true, message: 'Reply sent successfully' });
});

// --- Downloads (user) ---
app.get('/api/my-downloads', requireApiLogin, (req, res) => {
  const user = req.session.discordUser;
  const downloads = readDownloads().filter(d => d.userId === user?.id);
  res.json(downloads);
});

// --- Admin: Send downloads to users ---
app.post('/api/admin/downloads', requireAdmin, (req, res) => {
  const { userId, productName, url, version, description, fileSize, expires } = req.body || {};
  
  if (!userId || !productName || !url) {
    return res.status(400).json({ error: 'Missing required fields: userId, productName, url' });
  }
  
  const downloads = readDownloads();
  const newDownload = {
    id: crypto.randomUUID(),
    userId,
    productName,
    url,
    version: version || 'v1.0.0',
    description: description || '',
    fileSize: fileSize || null,
    expires: expires || null,
    date: new Date().toISOString(),
    downloaded: false
  };
  
  downloads.push(newDownload);
  writeDownloads(downloads);
  
  res.json({ success: true, download: newDownload });
});

// --- Admin: List all downloads ---
app.get('/api/admin/downloads', requireAdmin, (req, res) => {
  const downloads = readDownloads();
  res.json(downloads);
});

// --- Admin: Delete download ---
app.delete('/api/admin/downloads/:id', requireAdmin, (req, res) => {
  const downloads = readDownloads();
  const index = downloads.findIndex(d => d.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Download not found' });
  
  downloads.splice(index, 1);
  writeDownloads(downloads);
  res.json({ success: true });
});
app.post('/api/checkout', requireLogin, (req, res) => {
  const { items, total, discordUsername, email, language, note, coupon: couponCode } = req.body || {};
  const user = req.session.discordUser;
  const coupon = validateCoupon(couponCode);

  // Find an available key
  const keys = readKeys();
  const availableKey = keys.find(k => k.status === 'active');

  if (!availableKey) {
    return res.status(500).json({ error: 'No keys available' });
  }

  // Mark key as used
  availableKey.status = 'used';
  writeKeys(keys);

  // Record the purchase
  const purchases = readPurchases();
  purchases.push({
    key: availableKey.key,
    userId: user.id,
    productName: items.map(i => i.name).join(', '),
    purchaseDate: new Date().toISOString()
  });
  writePurchases(purchases);

  if (!WEBHOOK_URL) {
    console.error('DISCORD_WEBHOOK_URL not set');
    return res.status(500).json({ error: 'Checkout not configured' });
  }

  // persist order for dashboard (non-stripe path)
  try {
    const orders = readOrders();
    const finalTotal = calculateOrderTotal(items, coupon);
    orders.push({
      orderNumber: getNextOrderNumber(),
      userId: user?.id,
      discordUsername: discordUsername || user?.global_name || user?.username || 'N/A',
      email: email || null,
      language: language || null,
      items: Array.isArray(items) ? items : [],
      total: finalTotal,
      coupon: couponCode || null,
      note: note || null,
      status: 'paid',
      timestamp: new Date().toISOString()
    });
    writeOrders(orders);
  } catch (e) {
    console.error('Failed to write order:', e);
  }

  const payload = {
    content: '<@1453092257489092641>',
    embeds: [{
      title: 'New Purchase',
      color: 0x3b82f6,
      fields: [
        { name: 'Discord (buyer)', value: discordUsername || user?.global_name || user?.username || 'N/A', inline: true },
        { name: 'Email', value: email || 'N/A', inline: true },
        { name: 'Language', value: language || 'N/A', inline: true },
        { name: 'Total', value: total != null ? `$${Number(total).toFixed(2)}` : 'N/A', inline: true },
        { name: 'Items', value: Array.isArray(items) && items.length ? items.map(i => `${i.name || i.id} x${i.quantity || 1}`).join('\n') : 'No items', inline: false },
        ...(note ? [{ name: 'Note', value: note, inline: false }] : [])
      ],
      footer: { text: `Discord ID: ${user?.id || 'N/A'}` },
      timestamp: new Date().toISOString()
    }]
  };

  axios.post(WEBHOOK_URL, payload).then(() => {
    res.json({ success: true });
  }).catch(err => {
    console.error('Webhook error', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to submit order' });
  });
});

// Pretty URLs: /products -> products.html, etc.
const pages = ['products', 'cart', 'checkout', 'status', 'admin', 'keys', 'dashboard'];
pages.forEach(name => {
  app.get('/' + name, (req, res) => {
    res.sendFile(path.join(__dirname, name + '.html'));
  });
});

// Dashboard routes - new design
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});
app.get('/dashboard/orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'orders.html'));
});
app.get('/dashboard/downloads', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'downloads.html'));
});
app.get('/dashboard/contact-logs', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'contact-logs.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!DISCORD_CLIENT_ID) console.warn('Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET for Discord login.');
  if (!WEBHOOK_URL) console.warn('Set DISCORD_WEBHOOK_URL for purchase notifications.');
});
