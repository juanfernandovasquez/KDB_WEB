# Deploy barato (DigitalOcean)

Este flujo usa un droplet basico y Nginx + Gunicorn. Es la opcion mas barata y estable.

## 1) Crear servidor
- Crea un droplet basico (Ubuntu 22.04, 1GB RAM).
- Apunta tu dominio al IP del droplet (A record para `example.com` y `www`).

## 2) Preparar servidor
```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nginx git
```

## 3) Clonar proyecto
```bash
sudo mkdir -p /var/www/kdbweb
sudo chown -R $USER:$USER /var/www/kdbweb
git clone <TU_REPO> /var/www/kdbweb
```

## 4) Backend (venv + dependencias)
```bash
cd /var/www/kdbweb
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

## 5) Variables de entorno
```bash
cp /var/www/kdbweb/backend/.env.example /var/www/kdbweb/backend/.env
nano /var/www/kdbweb/backend/.env
```
Valores recomendados:
- `APP_ENV=production`
- `FLASK_DEBUG=0`
- `SECRET_KEY=<valor-largo>`
- `DB_PATH=/var/www/kdbweb/data/subscriptions.db`
- `CORS_ENABLED=0` (si frontend y backend estan en el mismo dominio)
- `S3_*` con tus datos reales

Crear carpeta para DB:
```bash
mkdir -p /var/www/kdbweb/data
```

Inicializar DB:
```bash
cd /var/www/kdbweb/backend
source /var/www/kdbweb/venv/bin/activate
python -c "from db import init_db; init_db()"
```

## 6) Systemd (gunicorn)
```bash
sudo cp /var/www/kdbweb/deploy/kdbweb.service /etc/systemd/system/kdbweb.service
sudo nano /etc/systemd/system/kdbweb.service
```
En el archivo, ajusta `User`, `Group` y rutas si es necesario.

```bash
sudo systemctl daemon-reload
sudo systemctl enable kdbweb
sudo systemctl start kdbweb
sudo systemctl status kdbweb
```

## 7) Nginx
```bash
sudo cp /var/www/kdbweb/deploy/nginx.conf /etc/nginx/sites-available/kdbweb
sudo nano /etc/nginx/sites-available/kdbweb
```
Actualiza `server_name` con tu dominio.

```bash
sudo ln -s /etc/nginx/sites-available/kdbweb /etc/nginx/sites-enabled/kdbweb
sudo nginx -t
sudo systemctl reload nginx
```

### Nota importante sobre HTTPS (Certbot)
- Certbot modifica `/etc/nginx/sites-available/kdbweb` para agregar el bloque SSL.
- Despues de activar HTTPS, **no sobrescribas** ese archivo con `deploy/nginx.conf`.
- Si necesitas cambios, copia manualmente las secciones necesarias al archivo real y luego:
  ```bash
  sudo nginx -t
  sudo systemctl reload nginx
  ```

## 8) HTTPS (Let’s Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

## 9) Admin
Abre `https://tudominio.com/admin` y crea el primer usuario con el boton de bootstrap.

---

## Notas
- El frontend es estatico. Nginx sirve `frontend/` directamente.
- El backend queda en `http://127.0.0.1:8000` por Gunicorn.
- Si necesitas otro dominio para el frontend, activa CORS en `.env`.
