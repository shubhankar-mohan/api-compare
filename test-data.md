# Test Data for Enhanced Diff Features

## Test 1: Semantic Comparison
**Original:**
```json
{
  "count": "5",
  "active": "true",
  "value": "100"
}
```

**Modified:**
```json
{
  "count": 5,
  "active": true,
  "value": 100
}
```
Enable "Semantic comparison" to treat these as equal.

## Test 2: Array Reordering Detection
**Original:**
```json
{
  "users": [
    { "id": 1, "name": "Alice", "age": 30 },
    { "id": 2, "name": "Bob", "age": 25 },
    { "id": 3, "name": "Charlie", "age": 35 }
  ]
}
```

**Modified:**
```json
{
  "users": [
    { "id": 2, "name": "Bob", "age": 25 },
    { "id": 3, "name": "Charlie", "age": 35 },
    { "id": 1, "name": "Alice", "age": 30 }
  ]
}
```
Enable "Detect reordering" and set "Array key field" to "id" to detect moved items.

## Test 3: Ignore Keys and Paths
**Original:**
```json
{
  "data": {
    "id": "abc123",
    "timestamp": "2024-01-01T10:00:00Z",
    "user": {
      "name": "John",
      "sessionId": "sess_xyz789"
    },
    "value": 100
  }
}
```

**Modified:**
```json
{
  "data": {
    "id": "def456",
    "timestamp": "2024-01-02T15:30:00Z",
    "user": {
      "name": "John",
      "sessionId": "sess_abc123"
    },
    "value": 100
  }
}
```
Add ignore keys: "timestamp", "id", "sessionId" to ignore these differences.
Or use ignore paths: "$.data.id", "$.data.timestamp", "$.data.user.sessionId"

## Test 4: Case and Whitespace Differences
**Original:**
```json
{
  "message": "Hello World",
  "status": "ACTIVE",
  "description": "This is   a    test"
}
```

**Modified:**
```json
{
  "message": "hello world",
  "status": "active",
  "description": "This is a test"
}
```
Enable "Ignore case" and "Ignore whitespace" to treat these as equal.

## Test 5: Complex Structural Changes
**Original:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "address": {
    "street": "123 Main St",
    "city": "Boston"
  }
}
```

**Modified:**
```json
{
  "name": {
    "first": "John",
    "last": "Doe"
  },
  "contactEmail": "john@example.com",
  "location": {
    "street": "123 Main St",
    "city": "Boston"
  }
}
```
This will show structural changes like renamed/moved properties.

## cURL Test Commands

### Test API with different responses:
```bash
# Original domain (returns user with ID 1)
curl 'https://jsonplaceholder.typicode.com/users/1'

# Change localhost URL to return user with ID 2
# This will show differences in the user data
```

### Test with headers:
```bash
curl 'https://api.github.com/users/github' \
  -H 'Accept: application/json' \
  -H 'User-Agent: TestApp'
```

## Features to Test:

1. **Diff Options Panel**:
   - Click the "Diff Options" button
   - Toggle different comparison modes
   - Add keys/paths to ignore
   - Enable array reordering detection

2. **Search in Diff**:
   - Click "Search" button
   - Search for specific terms
   - Use Ctrl+N/Ctrl+P to navigate results

3. **Path Navigation**:
   - Click "Go to Path" button
   - Enter JSON path like "$.users[0].name"
   - Jump directly to that location

4. **Statistics**:
   - View percentage changed badge
   - See structural changes count
   - Check additions/removals counts

5. **Display Options**:
   - Toggle "Show only differences" to hide unchanged lines
   - Switch between Diff and Foldable views