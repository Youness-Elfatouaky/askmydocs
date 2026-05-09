# =============================================================================
# Multi-stage Dockerfile for the React frontend.
#
#   - target "dev"  : Vite dev server with HMR. Used by docker-compose locally.
#   - target "build": runs `vite build` and produces /app/dist (static files).
#   - target "prod" : Nginx serves the built files. Used in production / AWS.
#
# Build a specific stage with:  docker build --target prod -t askmydocs-frontend .
# Compose picks "dev" via the `target:` field in docker-compose.yml.
# =============================================================================

# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app
# Install deps first so they cache when only source code changes.
COPY package.json ./
RUN npm install

# ---- dev ----
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- build ----
FROM base AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# ---- prod ----
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
