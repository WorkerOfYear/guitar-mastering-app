FROM node:22-slim
RUN npm install -g dl-librescore@latest && npm cache clean --force
WORKDIR /app
COPY server.mjs .
EXPOSE 8080
CMD ["node", "server.mjs"]
