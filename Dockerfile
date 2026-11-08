FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production
EXPOSE 4000
VOLUME ["/app/data", "/app/uploads"]
USER node
CMD ["node", "src/server.js"]
