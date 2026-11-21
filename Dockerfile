# Build the page, then serve it (and its static data: gamedata.json, icons/) with nginx.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# optional: saves, blueprint archives and snapshots to open with ?url= / ?bp_url= / ?snapshot= (mount a volume here)
RUN mkdir -p /srv/data
EXPOSE 80
