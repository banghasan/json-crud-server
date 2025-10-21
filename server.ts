import { Hono } from "jsr:@hono/hono@4.5.11";
import { cors } from "jsr:@hono/hono/cors";
import { parse } from "https://deno.land/std@0.224.0/yaml/parse.ts";

// Define the application
const app = new Hono();

// Add CORS middleware
app.use("*", cors());

// Read configuration from YAML file
const configData = parse(await Deno.readTextFile("./config.yml")) as {
  server: { port: number };
  data_dir: string;
  auth_header: { value: string };
  retention?: { days: number };
};

// Authorization header constant - can be overridden by environment variable
const AUTH_HEADER = Deno.env.get("AUTH_HEADER") || configData.auth_header.value;

// Data directory for individual files
const DATA_DIR = configData.data_dir;

// Type for our data structure
type DataItem = {
  [key: string]: any;
};

// Helper function to write individual data file
async function writeIndividualDataFile(id: string, data: any): Promise<void> {
  const filePath = `${DATA_DIR}/${id}.json`;
  await Deno.writeTextFile(
    filePath,
    JSON.stringify({ ...data, createdAt: new Date().toISOString() }, null, 2),
  );
}

// Helper function to delete individual data file
async function deleteIndividualDataFile(id: string): Promise<void> {
  const filePath = `${DATA_DIR}/${id}.json`;
  try {
    await Deno.remove(filePath);
  } catch (error) {
    // If file doesn't exist, ignore the error
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

// Middleware to ensure data directory exists
async function ensureDataDir() {
  try {
    await Deno.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // If directory already exists, ignore the error
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
}

// Initialize data directory on startup
await ensureDataDir();

// In-memory storage (would be persistent in a real app with a database)
let dataStore: { [key: string]: any } = {};

// Scheduler to clean up old files
async function scheduleCleanup() {
  // Calculate the next execution time (next day at 00:00 Asia/Jakarta time)
  const now = new Date();
  // Convert to Asia/Jakarta time - this requires getting the local time in Jakarta
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jakartaTime = new Date(utc + 3600000 * 7); // Jakarta is UTC+7

  // Set the time to next day at 00:00:00 in Jakarta timezone
  const nextRun = new Date(jakartaTime);
  nextRun.setDate(nextRun.getDate() + 1);
  nextRun.setHours(0, 0, 0, 0);

  // Calculate delay in milliseconds
  const delay = nextRun.getTime() - now.getTime();

  setTimeout(async () => {
    await cleanupOldFiles();
    // Schedule the next cleanup
    scheduleCleanup();
  }, delay);
}

// Function to clean up old files
async function cleanupOldFiles() {
  try {
    const retentionDays = configData.retention?.days || 7;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const now = Date.now();

    console.log(`Starting cleanup for files older than ${retentionDays} days`);

    for await (const entry of Deno.readDir(DATA_DIR)) {
      if (entry.name.endsWith(".json")) {
        const filePath = `${DATA_DIR}/${entry.name}`;
        const fileInfo = await Deno.stat(filePath);

        // Calculate age of file
        if (fileInfo.mtime) {
          const fileAge = now - fileInfo.mtime.getTime();

          // If file is older than retention period, delete it
          if (fileAge > retentionMs) {
            try {
              await Deno.remove(filePath);
              console.log(`Deleted old file: ${entry.name}`);

              // Also remove from in-memory store if present
              const id = entry.name.slice(0, -5); // Remove '.json' extension
              if (dataStore[id]) {
                delete dataStore[id];
              }
            } catch (deleteError) {
              console.error(`Error deleting file ${entry.name}:`, deleteError);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

// Start the cleanup scheduler
scheduleCleanup();

// Middleware for authentication (for write operations)
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== AUTH_HEADER) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};

// Logging middleware
app.use("*", async (c, next) => {
  await next();
  console.log(`${c.req.method} ${c.req.url} -> ${c.res.status}`);
});

// GET /json - Get all json (public)
app.get("/json", async (c) => {
  try {
    // Start with the in-memory store
    const result = { ...dataStore };

    // Read all files in the data directory to include any that might not be in memory
    try {
      for await (const entry of Deno.readDir(DATA_DIR)) {
        if (entry.name.endsWith(".json")) {
          const id = entry.name.slice(0, -5); // Remove '.json' extension to get the ID
          if (!result[id]) {
            // Only add if not already in memory
            try {
              const filePath = `${DATA_DIR}/${entry.name}`;
              const fileContent = await Deno.readTextFile(filePath);
              result[id] = JSON.parse(fileContent);
            } catch (error) {
              console.error(`Error reading file ${entry.name}:`, error);
            }
          }
        }
      }
    } catch (dirError) {
      console.error("Error reading data directory:", dirError);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error reading data:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// GET /json/:id - Get a specific json (public)
app.get("/json/:id", async (c) => {
  try {
    const id = c.req.param("id");

    // First, check in-memory store
    if (dataStore[id]) {
      return c.json(dataStore[id]);
    }

    // If not found in memory, try to read from file system
    try {
      const filePath = `${DATA_DIR}/${id}.json`;
      const fileContent = await Deno.readTextFile(filePath);
      const jsonData = JSON.parse(fileContent);
      return c.json(jsonData);
    } catch (fileError) {
      if (fileError instanceof Deno.errors.NotFound) {
        return c.json({ error: "Not Found" }, 404);
      }
      throw fileError;
    }
  } catch (error) {
    console.error("Error reading data:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// POST /json - Create a new json (requires auth)
app.post("/json", authMiddleware, async (c) => {
  try {
    // Parse the request body as JSON
    const body = await c.req.json();

    // Generate a new UUID
    const id = crypto.randomUUID();

    // Add the new json to the data store
    dataStore[id] = body;

    // Create the individual data file
    await writeIndividualDataFile(id, body);

    // Build the URL for the new json
    const url = new URL(c.req.url);
    const newJsonUrl = `${url.protocol}//${url.host}/json/${id}`;

    // Return the response
    return c.json({ id, url: newJsonUrl, data: body }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json({ error: "Bad Request - Invalid JSON" }, 400);
    }
    console.error("Error creating json:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// PUT /json/:id - Replace a json completely (requires auth)
app.put("/json/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");

    // Parse the request body as JSON
    const body = await c.req.json();

    // Check if the json exists
    if (!dataStore[id]) {
      return c.json({ error: "Not Found" }, 404);
    }

    // Update the json in the data store
    dataStore[id] = body;

    // Update the individual data file
    await writeIndividualDataFile(id, body);

    // Return the updated json
    return c.json(dataStore[id]);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json({ error: "Bad Request - Invalid JSON" }, 400);
    }
    console.error("Error updating json:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// PATCH /json/:id - Update a json partially (requires auth)
app.patch("/json/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");

    // Parse the request body as JSON
    const updates = await c.req.json();

    // Check if the json exists
    if (!dataStore[id]) {
      return c.json({ error: "Not Found" }, 404);
    }

    // Update the json with the new values
    dataStore[id] = { ...dataStore[id], ...updates };

    // Update the individual data file
    await writeIndividualDataFile(id, dataStore[id]);

    // Return the updated json
    return c.json(dataStore[id]);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json({ error: "Bad Request - Invalid JSON" }, 400);
    }
    console.error("Error updating json:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// DELETE /json/:id - Delete a json (requires auth)
app.delete("/json/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");

    // Check if the json exists
    if (!dataStore[id]) {
      return c.json({ error: "Not Found" }, 404);
    }

    // Remove the json from the data store
    delete dataStore[id];

    // Delete the individual data file
    await deleteIndividualDataFile(id);

    // Return success response
    return c.json({ message: "Json deleted successfully" });
  } catch (error) {
    console.error("Error deleting json:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Error handler
app.onError((err, c) => {
  console.error("Error occurred:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// 404 handler for undefined routes
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Get port from environment variable (which overrides config), or from config, or default to 8000
const port = Number(Deno.env.get("PORT")) || configData.server.port || 8000;

// Start the server
console.log(`Server running on http://localhost:${port}`);
Deno.serve(
  {
    port,
  },
  app.fetch,
);
