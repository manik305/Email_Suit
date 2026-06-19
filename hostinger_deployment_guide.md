# Hostinger VPS Production Deployment Guide for Email Suit

This guide explains how to deploy your **React Frontend** and **FastAPI Backend** to your **Hostinger VPS** using Docker Compose. 

Since you have a **Hostinger Business Plan with 4GB RAM, 2-Core CPU, and 50GB Storage**, this server has plenty of capacity to host these containers for 15-20 active users, even alongside your 2 existing WordPress sites.

---

## 1. Hosting Architecture on Hostinger VPS

Since you already have 2 WordPress sites running on your VPS, your host server is likely running a web server (like **Nginx** or **Apache**) on ports `80` and `443` to route traffic to those sites.

To prevent port conflicts, we will run the Email Suit containers on custom ports, and configure a **reverse proxy** on the host Nginx to route a subdomain (e.g., `crm.yourdomain.com`) to the application.

```mermaid
graph TD
    User([User Browser]) -->|HTTPS crm.yourdomain.com| NginxHost[Host Nginx Reverse Proxy]
    NginxHost -->|Proxy to Port 8080| FE[Docker: Frontend Container]
    NginxHost -->|Proxy to Port 8000| BE[Docker: Backend Container]
    BE -->|Database Queries| DB[(Supabase PostgreSQL)]
    WordPress[WordPress Sites] <-->|Ports 80/443| NginxHost
```

---

## 2. Docker Compose Configuration

Create a file named `docker-compose.yml` in the root of your project directory (`c:\Users\manik\Downloads\Email Suit\docker-compose.yml`) to orchestrate both services.

We will write this file to your workspace:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: emailsas-backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres.rkfwraxddyozjcgssjii:Dandothkar1998@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
      - SECRET_KEY=sb_secret_K6EE_4MGbb_P31K26IAVlQ_h0xJMdrW
      - ALGORITHM=HS256
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: emailsas-frontend
    ports:
      - "8080:80"
    restart: always
    depends_on:
      - backend
```

> [!TIP]
> **Database Recommendation**: We highly recommend keeping the database on **Supabase** (as configured above). Running a local PostgreSQL instance inside your 4GB VPS alongside 2 WordPress sites and 2 Docker containers could cause memory exhaustion (Out-Of-Memory crashes). Supabase offloads this compute and RAM completely.

---

## 3. Step-by-Step Deployment on Hostinger VPS

### Step 1: Install Docker & Docker Compose on the VPS
Connect to your Hostinger VPS via SSH (using PuTTY or terminal):
```bash
ssh root@<YOUR_VPS_IP>
```
If not already installed, install Docker:
```bash
# Update package list
apt-get update

# Install Docker
apt-get install -y docker.io docker-compose-v2

# Start and enable Docker service
systemctl start docker
systemctl enable docker
```

### Step 2: Upload Project Files to the VPS
You can upload the project files using **SFTP** (via FileZilla) or clone the repository via Git directly onto the VPS in a directory like `/var/www/emailsas`.
Ensure the folder structure contains:
- `/backend` (with source code & Dockerfile)
- `/frontend` (with source code, nginx.conf & Dockerfile)
- `docker-compose.yml` (in the parent directory)

### Step 3: Run the Application
Navigate to the directory on the VPS and start the containers in detached (background) mode:
```bash
cd /var/www/emailsas
docker compose up -d --build
```
Verify the containers are running successfully:
```bash
docker ps
```
Your frontend is now listening on `http://localhost:8080` and backend on `http://localhost:8000` on the VPS.

### Step 4: Configure Host Nginx as a Reverse Proxy
To point your custom domain/subdomain to the Docker containers, configure Nginx on the VPS host:

1. Create a new Nginx configuration block:
   ```bash
   nano /etc/nginx/sites-available/emailsas.conf
   ```
2. Paste the following configuration, replacing `crm.yourdomain.com` with your subdomain:
   ```nginx
   server {
       listen 80;
       server_name crm.yourdomain.com;

       # Route to React Frontend Container
       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Route to FastAPI Backend Container
       location /api/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
3. Enable the configuration and restart Nginx:
   ```bash
   ln -s /etc/nginx/sites-available/emailsas.conf /etc/nginx/sites-enabled/
   nginx -t  # Test config for syntax errors
   systemctl restart nginx
   ```

### Step 5: Install SSL (HTTPS) Certificate
Secure the domain using Let's Encrypt SSL:
```bash
# Install Certbot Nginx plugin
apt-get install -y python3-certbot-nginx

# Obtain and configure SSL
certbot --nginx -d crm.yourdomain.com
```
Follow the prompts to complete the SSL setup. Certbot will automatically redirect all traffic from HTTP to HTTPS securely.
