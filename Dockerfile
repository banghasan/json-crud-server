# Use the official Deno image
FROM denoland/deno:2.2.2

# Set the working directory
WORKDIR /app

# Copy the server file and config
COPY server.ts config.yml ./

# Cache the dependencies
RUN deno cache server.ts

# Expose the port (default is 8000)
EXPOSE 8000

# Run the server with necessary permissions
CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "server.ts"]
