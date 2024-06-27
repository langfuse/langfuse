# Use the official Node.js image based on Alpine
FROM node:20-alpine

# Set the working directory
WORKDIR /app


# Copy the rest of the application code
COPY . .
# Install pnpm globally
RUN npm install -g pnpm@8.6.0

# Install dependencies using pnpm
RUN pnpm install

RUN pnpm run build 
# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["pnpm", "run", "start"]