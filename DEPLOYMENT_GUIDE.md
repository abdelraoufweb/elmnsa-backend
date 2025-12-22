# 🚀 Deployment Guide

## Pre-Deployment Checklist

### 1. Security Updates
- [ ] Change `JWT_SECRET` to a strong random 32+ character string
- [ ] Update `GROQ_API_KEY` if needed (verify it's not public)
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS

### 2. Database
- [ ] Set up MongoDB Atlas account (cloud)
- [ ] Create production database
- [ ] Update `MONGODB_URI` in production .env
- [ ] Create database backups
- [ ] Enable MongoDB Atlas backup

### 3. Frontend
- [ ] Update API base URL to production backend
- [ ] Update Socket.IO connection URL
- [ ] Set correct `FRONTEND_URL` in backend .env
- [ ] Test CORS is working

### 4. Environment
- [ ] Create production `.env` file
- [ ] Don't commit `.env` to git
- [ ] Use environment variables on server

### 5. Testing
- [ ] Test all API endpoints
- [ ] Test file uploads
- [ ] Test real-time features (Socket.IO)
- [ ] Test authentication flow
- [ ] Load test with multiple concurrent users

---

## Deployment Options

### Option 1: Heroku (Easiest)

#### Install Heroku CLI
```bash
brew tap heroku/brew && brew install heroku
heroku login
```

#### Create Heroku App
```bash
cd backend
heroku create your-app-name
```

#### Set Environment Variables
```bash
heroku config:set JWT_SECRET=your_32_char_secret
heroku config:set MONGODB_URI=your_mongodb_atlas_uri
heroku config:set GROQ_API_KEY=gsk_...
heroku config:set FRONTEND_URL=https://yourfrontend.com
heroku config:set NODE_ENV=production
```

#### Deploy
```bash
git push heroku main
```

#### Verify Deployment
```bash
heroku logs --tail
curl https://your-app-name.herokuapp.com/health
```

---

### Option 2: DigitalOcean (Recommended)

#### 1. Create Droplet
- Choose Ubuntu 20.04 LTS
- Choose size (start with $5/month)
- Add SSH keys

#### 2. SSH into Server
```bash
ssh root@your_droplet_ip
```

#### 3. Install Dependencies
```bash
# Update packages
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
apt install -y nodejs

# Install MongoDB
apt install -y mongodb

# Start MongoDB
systemctl start mongodb
systemctl enable mongodb

# Install Nginx
apt install -y nginx

# Install PM2
npm install -g pm2
```

#### 4. Clone Repository
```bash
cd /var/www
git clone your_repo
cd elmnsa/backend
npm install
```

#### 5. Create .env File
```bash
cat > .env << 'EOF'
PORT=5000
NODE_ENV=production
SERVER_URL=https://your-domain.com
MONGODB_URI=mongodb://localhost:27017/elmnsa
JWT_SECRET=your_32_char_secret
GROQ_API_KEY=gsk_...
FRONTEND_URL=https://your-frontend.com
EOF
```

#### 6. Start with PM2
```bash
pm2 start index.js --name "elmnsa-backend"
pm2 startup
pm2 save
```

#### 7. Configure Nginx
```bash
cat > /etc/nginx/sites-available/elmnsa << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
```

#### 8. Enable Nginx
```bash
ln -s /etc/nginx/sites-available/elmnsa /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### 9. Setup SSL (Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

#### 10. Verify
```bash
curl https://your-domain.com/health
```

---

### Option 3: AWS EC2

#### 1. Launch EC2 Instance
- AMI: Ubuntu 20.04 LTS
- Instance type: t2.micro (free tier) or larger
- Security group: Allow ports 80, 443, 22

#### 2. Connect via SSH
```bash
ssh -i your-key.pem ubuntu@your_instance_ip
```

#### 3. Follow DigitalOcean steps 3-10 above

---

### Option 4: Railway (Simplest)

#### 1. Create Account
Go to https://railway.app

#### 2. Create New Project
- Connect GitHub repo
- Select backend directory
- Add MongoDB

#### 3. Set Environment Variables
Dashboard → Variables

#### 4. Deploy
Push to GitHub, Railway auto-deploys

---

## Post-Deployment

### 1. Verify Everything Works
```bash
# Health check
curl https://your-domain.com/health

# Test authentication
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+201234567890","password":"password"}'

# Test Socket.IO
# Open in browser console and test connection
```

### 2. Setup Monitoring
```bash
# Install PM2 Plus for monitoring
npm install -g pm2-plus
pm2 plus
```

### 3. Enable Logging
```bash
pm2 logs elmnsa-backend
```

### 4. Setup Backups
```bash
# MongoDB Atlas automatic backups (enabled by default)
# Or cron backup script
```

### 5. Setup Alerts
- MongoDB Atlas alerts
- PM2 Plus alerts
- Error tracking (Sentry, Bugsnag)

---

## Production .env Template

```
# Server
PORT=5000
NODE_ENV=production
SERVER_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Database (MongoDB Atlas)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/elmnsa

# Security
JWT_SECRET=generate_long_random_string_here_32_chars_minimum
JWT_EXPIRE=7d

# AI
GROQ_API_KEY=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
GROQ_MODEL=mixtral-8x7b-32768

# File Storage
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads
# For production, consider AWS S3 or similar

# Logging
LOG_LEVEL=info
```

---

## Performance Optimization

### 1. Enable Compression
```javascript
// In index.js
const compression = require('compression');
app.use(compression());
```

### 2. Use CDN for Static Files
```
// Serve uploads from CDN
// Update getFileUrl to CDN URL
```

### 3. Implement Caching
```javascript
// Redis for session caching
const redis = require('redis');
```

### 4. Database Optimization
- All indexes already created
- Lean queries for read-only
- Pagination for large datasets

### 5. Load Balancing
- Use Nginx as reverse proxy
- Multiple Node.js instances with PM2 cluster mode

---

## Monitoring & Logging

### 1. PM2 Monitoring
```bash
pm2 monit
pm2 logs
```

### 2. Nginx Logs
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 3. MongoDB Monitoring
- Use MongoDB Atlas dashboard
- Monitor connections, operations, disk

### 4. Application Monitoring
- Sentry for error tracking
- Datadog for performance monitoring
- New Relic for APM

---

## Security Hardening

### 1. Firewall
```bash
# UFW (Ubuntu)
ufw default deny incoming
ufw allow ssh
ufw allow http
ufw allow https
ufw enable
```

### 2. Fail2Ban
```bash
apt install -y fail2ban
systemctl enable fail2ban
```

### 3. Regular Updates
```bash
# Auto update packages
apt install -y unattended-upgrades
```

### 4. Backup Strategy
- MongoDB Atlas backup (daily)
- Server file backup (weekly)
- Database snapshots (monthly)

### 5. SSL/TLS
- Let's Encrypt (free)
- Auto-renewal configured
- HTTPS only

---

## Troubleshooting Deployment

### Application crashes
```bash
# Check logs
pm2 logs elmnsa-backend

# Restart
pm2 restart elmnsa-backend
```

### Database connection issues
```bash
# Verify connection string
mongosh "your_mongodb_uri"

# Check IP whitelist on MongoDB Atlas
```

### Out of memory
```bash
# Increase swap
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

### High CPU usage
```bash
# Check what's running
top

# Monitor Node process
pm2 monit
```

### SSL certificate expiring
```bash
# Auto renewal should handle it, but check:
certbot renew --dry-run
```

---

## Scaling Strategies

### Horizontal Scaling
1. Run multiple Node.js instances
2. Use load balancer (Nginx, HAProxy)
3. Sticky sessions for Socket.IO

### Vertical Scaling
1. Increase server resources
2. Optimize code
3. Database query optimization

### Database Scaling
1. MongoDB Atlas replica sets
2. Read replicas for scaling reads
3. Sharding for large datasets

---

## Cost Optimization

| Service | Cost | Note |
|---------|------|------|
| DigitalOcean | $5-40/mo | Start small, scale up |
| MongoDB Atlas | Free-1000/mo | Free tier includes 512MB |
| Heroku | $25+/mo | Easy deployment |
| AWS | Variable | Pay per use |

**Budget Estimate:**
- Small startup: $10-15/month
- Medium startup: $50-100/month
- Large enterprise: $200+/month

---

## Rollback Plan

### If Deployment Fails
```bash
# Git rollback
git revert {commit_hash}
git push

# PM2 rollback
pm2 restart elmnsa-backend

# Manual rollback
git checkout {previous_version}
npm install
pm2 restart
```

---

## Maintenance

### Weekly
- Check logs for errors
- Monitor disk space
- Review security logs

### Monthly
- Update dependencies
- Review performance metrics
- Database maintenance
- Backup verification

### Quarterly
- Security audit
- Load testing
- Disaster recovery drill

---

## Emergency Contacts

Add these to your documentation:
- Database admin contact
- Server provider support
- Security incident hotline
- Development team leads

---

## Success Criteria

✅ All endpoints responding
✅ Real-time features working
✅ File uploads functioning
✅ Authentication working
✅ Database connected
✅ Logging active
✅ Backups running
✅ SSL certificate valid
✅ Load times under 2s
✅ Uptime > 99.5%

---

**You're ready to deploy! 🚀**

---

**Version:** 1.0.0
**Last Updated:** 2024
