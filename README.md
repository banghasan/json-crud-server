# JSON CRUD SERVER

A simple web service built with Deno and Hono for handling CRUD operations on JSON data.

## Features
- Full CRUD operations (Create, Read, Update, Delete)
- Individual JSON files stored in data directory
- Authentication required for write operations
- YAML-based configuration
- Automatic cleanup of old files
- CORS support

## Configuration

The service can be configured via `config.yml`:

```yaml
server:
  # Port for the web server (default: 8000)
  port: 8000

# Directory for storing individual JSON files
data_dir: "./data"

# Authentication header required for write operations
auth_header:
  # Value for the Authorization header required for POST, PUT, PATCH, DELETE
  value: "r4HaS1AbangHaSAN"

# Data retention settings
retention:
  # Number of days after which files will be automatically deleted (default: 7)
  days: 7
```

## API Endpoints

### Public Endpoints (No Authentication Required)

#### Get All JSON Items
- **GET** `/json`
- Returns all JSON items in the store

#### Get Specific JSON Item
- **GET** `/json/:id`
- Returns a specific JSON item by its UUID
- This will return data from memory or from the data directory if the file exists
- Add `?pretty=true` query parameter to get pretty-printed JSON output
  - Example: `/json/<UUID>?pretty=true`

### Authenticated Endpoints (Authentication Required)

For all write operations, include the Authorization header:
```
Authorization: r4HaS1AbangHaSAN
```

#### Create New JSON Item
- **POST** `/json`
- Creates a new JSON item with a random UUID
- Body: Any valid JSON data
- Returns the new item's ID and URL

#### Replace JSON Item
- **PUT** `/json/:id`
- Replaces an existing JSON item completely
- Body: New JSON data to replace the existing item

#### Update JSON Item
- **PATCH** `/json/:id`
- Updates an existing JSON item partially
- Body: JSON data with fields to update

#### Delete JSON Item
- **DELETE** `/json/:id`
- Deletes an existing JSON item

## Usage Examples

### Using curl

#### Create a new item:
```bash
curl -X POST http://localhost:8000/json \
  -H "Content-Type: application/json" \
  -H "Authorization: r4HaS1AbangHaSAN" \
  -d '{
    "title": "Example Item",
    "content": "This is a sample content",
    "author": "Test User"
  }'
```

#### Get all items:
```bash
curl http://localhost:8000/json
```

#### Get a specific item:
```bash
curl http://localhost:8000/json/<UUID>
```

#### Get a specific item with pretty formatting:
```bash
curl http://localhost:8000/json/<UUID>?pretty=true
```

#### Update an item partially:
```bash
curl -X PATCH http://localhost:8000/json/<UUID> \
  -H "Content-Type: application/json" \
  -H "Authorization: r4HaS1AbangHaSAN" \
  -d '{
    "content": "Updated content"
  }'
```

#### Replace an item completely:
```bash
curl -X PUT http://localhost:8000/json/<UUID> \
  -H "Content-Type: application/json" \
  -H "Authorization: r4HaS1AbangHaSAN" \
  -d '{
    "title": "New Title",
    "content": "New content"
  }'
```

#### Delete an item:
```bash
curl -X DELETE http://localhost:8000/json/<UUID> \
  -H "Authorization: r4HaS1AbangHaSAN"
```

## Running the Service

```bash
deno run --allow-net --allow-read --allow-write --allow-env server.ts
```

The server will start on the configured port (default: 8000) and display:
```
Server running on http://localhost:8000
```

## Automatic File Cleanup

The service automatically runs a scheduler at 00:00 (midnight) daily in the Asia/Jakarta timezone to remove files older than the configured number of days (default: 7 days).

## Data Storage

- Each item is stored as both in-memory data and as an individual JSON file in the data directory
- File names follow the pattern: `data/<UUID>.json`
- The `createdAt` timestamp is automatically added to each stored item

## Docker Image Automation

This repository is configured with GitHub Actions to automatically build and push Docker images to Docker Hub on every push to the main branch.

### Setting up Docker Hub Integration

To enable automatic Docker image building and pushing:

1. Create a Docker Hub account if you don't have one
2. Create an access token in your Docker Hub account (Account Settings > Security > Access Tokens)
3. In your GitHub repository, go to Settings > Secrets and variables > Actions
4. Add the following secrets:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: The access token you created in step 2

The workflow will automatically:
- Build your Docker image when code is pushed to the main branch
- Tag the image with the branch name, git tag, and commit SHA
- Push the image to your Docker Hub repository
