FROM apify/actor-node-playwright-chrome:20

# Set working directory
WORKDIR /home/myuser/

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy TypeScript config
COPY tsconfig.json ./

# Copy source code
COPY src ./src

# Copy actor config
COPY .actor ./.actor

# Run the actor
CMD ["npm", "start"]
