FROM apify/actor-node:20

COPY package*.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY .actor ./.actor

CMD ["npx", "tsx", "src/main.ts"]
