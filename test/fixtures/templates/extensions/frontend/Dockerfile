FROM node:14-alpine AS install

WORKDIR /opt

COPY ./package.json ./package-lock.json /opt/

RUN npm ci

COPY . .

RUN npm run build -- --configuration production


FROM nginx:alpine as runtime

COPY --from=install /opt/dist/frontend /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/nginx.conf
