FROM apify/actor-node-playwright-chrome:20

COPY package*.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY .actor ./.actor

CMD ["npx", "tsx", "src/main.ts"]
