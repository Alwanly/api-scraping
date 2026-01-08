FROM node:22-alpine As base

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@latest --activate

# Build stage - compile TypeScript to JavaScript
FROM base As build

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Production stage - only JS files and runtime dependencies
FROM base As production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy only compiled JavaScript from build stage
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]