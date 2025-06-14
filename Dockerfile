# Utilise une image officielle Node.js légère
FROM node:18-alpine

# Crée le dossier de travail dans le container
WORKDIR /app

# Copie package.json et package-lock.json si tu as (pour gérer les dépendances)
# Sinon tu peux commenter ces lignes si pas de package.json
COPY package*.json ./

# Installe axios (nécessaire)
RUN npm install axios

# Copie ton script dans le container
COPY app.js .

# Expose un dossier pour le volume (optionnel)
VOLUME [ "/app/data" ]

# Commande par défaut
CMD ["node", "app.js"]
