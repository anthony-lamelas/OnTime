# Build the Vite + React Application
FROM node:18-alpine as build
WORKDIR /app

# Install dependencies rapidly caching the standard layers
COPY package*.json ./
RUN npm install

# Build the complete architecture
COPY . .
# We securely load structural mapbox keys mapping UI parameters at build cache time
ARG VITE_MAPBOX_TOKEN
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

RUN npm run build

# Expose Static Folders against Nginx
FROM nginx:alpine

# Strip Node from memory, copy pure artifacts strictly
COPY --from=build /app/dist /usr/share/nginx/html

# Replace standard default configurations mapping custom reverse proxy parameters
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Map public default web port
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
