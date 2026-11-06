FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs rooms.ts schema.sql index.html sample-catalog.json fetch-samples.mjs ./
RUN node fetch-samples.mjs
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node","server.mjs"]
