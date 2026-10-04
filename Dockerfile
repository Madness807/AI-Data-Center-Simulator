# Dépendances communes au développement et à la bêta.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Développement (service « app ») : serveur Vite, sources montées par docker-compose.
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# Build de la bêta : l'image n'est produite que si le typage et les tests passent.
FROM deps AS build
COPY . .
RUN npm run check

# Bêta (service « beta ») : nginx sert le jeu compilé, sans les outils de développement.
FROM nginx:stable-alpine AS beta
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
