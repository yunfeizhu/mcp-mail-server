# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.23.0

# ---- Build stage: compile the single-file bundle ----
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ---- Runtime stage: production dependencies + bundle only ----
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist/index.js ./dist/index.js

# Default location for attachment downloads/uploads; mount a volume here and
# set MAIL_ALLOWED_ROOTS=/data to enable local attachment access.
RUN mkdir -p /data && chown node:node /data

USER node

# The MCP server speaks JSON-RPC over stdio, so run the container with `-i`.
ENTRYPOINT ["node", "dist/index.js"]
