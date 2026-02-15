FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY index.html /usr/share/nginx/html/index.html
COPY epubreader.html /usr/share/nginx/html/epubreader.html

EXPOSE 80