FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install axios

COPY app.js .

VOLUME [ "/app/data" ]

CMD ["node", "app.js"]
