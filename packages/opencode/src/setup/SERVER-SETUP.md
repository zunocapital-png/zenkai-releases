# Remote Ollama Server Setup for Zenkai

## 1. Install Ollama on a VPS (Ubuntu)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen3:14b

# Enable and start the service
sudo systemctl enable ollama
sudo systemctl start ollama
```

Configure Ollama to listen on all interfaces by editing the systemd unit:

```bash
sudo systemctl edit ollama
```

Add:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

## 2. Docker Compose with GPU Passthrough

```yaml
# docker-compose.yml
version: "3.8"
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    environment:
      - OLLAMA_HOST=0.0.0.0:11434

volumes:
  ollama-data:
```

Start:

```bash
docker compose up -d
docker compose exec ollama ollama pull qwen3:14b
```

## 3. Nginx Reverse Proxy with Basic Auth

Generate a password file:

```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.ollama_htpasswd zenkai
```

Nginx config at `/etc/nginx/sites-available/ollama`:

```nginx
server {
    listen 443 ssl;
    server_name ollama.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/ollama.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ollama.yourdomain.com/privkey.pem;

    location / {
        auth_basic "Ollama API";
        auth_basic_user_file /etc/nginx/.ollama_htpasswd;

        proxy_pass http://127.0.0.1:11434;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 600s;
        client_max_body_size 500M;
    }
}
```

Enable the site and get a TLS certificate:

```bash
sudo ln -s /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
sudo certbot --nginx -d ollama.yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Connect Zenkai to the Remote Server

Use the helper in `remote-server.ts`:

```typescript
import { testRemoteConnection, configureRemoteProvider } from "./remote-server"

// Test the connection first
const result = await testRemoteConnection("https://ollama.yourdomain.com")
if (result.ok) {
  console.log(`Connected in ${result.latency}ms, models: ${result.models.join(", ")}`)
  await configureRemoteProvider("https://ollama.yourdomain.com", "your-api-key")
}
```

Or edit `~/.config/opencode/opencode.jsonc` manually:

```jsonc
{
  "provider": {
    "ollama-remote": {
      "id": "ollama-remote",
      "api": "ollama",
      "name": "Ollama Cloud",
      "baseURL": "https://ollama.yourdomain.com",
      "models": {}
    }
  }
}
```

## 5. Security Considerations

- **Always use HTTPS** in production. Never expose the Ollama API over plain HTTP on the internet.
- **Firewall**: Only open port 443; keep 11434 bound to `127.0.0.1` so Nginx is the single entry point.
  ```bash
  sudo ufw allow 443/tcp
  sudo ufw deny 11434
  sudo ufw enable
  ```
- **API key / Basic Auth**: The Nginx basic-auth layer above provides a simple credential gate. For token-based auth, use a header check in Nginx or an API gateway.
- **Rate limiting**: Add `limit_req_zone` in Nginx to prevent abuse.
- **Keep Ollama updated**: `curl -fsSL https://ollama.com/install.sh | sh` re-runs the installer to update.
- **Monitor logs**: `journalctl -u ollama -f` for systemd, or `docker compose logs -f ollama` for Docker.
