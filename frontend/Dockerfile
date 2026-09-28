# L'etage de build tourne sur l'architecture du constructeur, pas sur celle de
# la cible : sa sortie est du JavaScript, identique partout. Sans cela, un
# build arm64 depuis un runner x86 ferait tourner npm sous emulation.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
