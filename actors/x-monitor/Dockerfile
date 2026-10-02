FROM apify/actor-node-playwright-chrome:20

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Run the actor
CMD npm start