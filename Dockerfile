# Deux etages : le build reste hors de l'image servie.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# oracledb et adm-zip sont externes au bundle standalone : on les embarque.
COPY --from=build /app/node_modules/oracledb ./node_modules/oracledb
COPY --from=build /app/node_modules/adm-zip ./node_modules/adm-zip
EXPOSE 3000
CMD ["node", "server.js"]
