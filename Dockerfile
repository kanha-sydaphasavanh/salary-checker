FROM node:18-alpine

WORKDIR /opt/app/salary-checker

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

VOLUME ["/app/data"]

CMD ["node", "app.js"]
