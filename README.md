# Permanences & Back-Up — Serveur

Application de gestion des permanences téléphoniques et back-up.

---

## Installation

### Prérequis
- **Node.js** v16 ou supérieur : https://nodejs.org
- Un serveur Linux (Ubuntu/Debian recommandé) ou Windows Server

### 1. Copier les fichiers sur le serveur
```
perm-server/
├── server.js
├── package.json
├── public/
│   ├── index.html      ← Application principale
│   └── login.html      ← Page de connexion
└── data/               ← Créé automatiquement au premier démarrage
    ├── app-data.json   ← Toutes les données (gestionnaires, archives...)
    └── users.json      ← Comptes utilisateurs (mots de passe hashés)
```

### 2. Installer les dépendances
```bash
cd perm-server
npm install
```

### 3. Démarrer le serveur
```bash
node server.js
```
Le serveur démarre sur **http://localhost:3000**

---

## Démarrage automatique (Linux avec systemd)

Créer le fichier `/etc/systemd/system/permanences.service` :

```ini
[Unit]
Description=Permanences Back-Up Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/chemin/vers/perm-server
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=PORT=3000
Environment=SESSION_SECRET=changez-ce-secret-par-quelque-chose-de-long-et-aleatoire

[Install]
WantedBy=multi-user.target
```

Puis :
```bash
sudo systemctl daemon-reload
sudo systemctl enable permanences
sudo systemctl start permanences
sudo systemctl status permanences
```

---

## Accès depuis l'extérieur (reverse proxy Nginx)

Si vous voulez accéder via un nom de domaine avec HTTPS :

```nginx
server {
    listen 80;
    server_name votre-domaine.ch;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name votre-domaine.ch;

    ssl_certificate     /etc/letsencrypt/live/votre-domaine.ch/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.ch/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Gestion des utilisateurs

Via l'API (curl ou Postman) :

**Créer un utilisateur** (admin requis) :
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"username":"nouveau","password":"MotDePasse123!"}'
```

**Lister les utilisateurs** :
```bash
curl http://localhost:3000/api/users -b cookies.txt
```

**Supprimer un utilisateur** :
```bash
curl -X DELETE http://localhost:3000/api/users/nomutilisateur -b cookies.txt
```

---

## Sauvegarde des données

Les données sont dans `data/app-data.json`. Pour sauvegarder :
```bash
cp data/app-data.json data/app-data-backup-$(date +%Y%m%d).json
```

Automatiser avec cron :
```bash
0 2 * * * cp /chemin/perm-server/data/app-data.json /chemin/backups/app-data-$(date +\%Y\%m\%d).json
```

---

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port du serveur |
| `SESSION_SECRET` | Aléatoire | Clé de signature des sessions (changer en production) |
